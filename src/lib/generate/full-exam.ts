// Orchestrates a complete first-draft exam: passage, Part One, Text Exploration
// and Writing, in that order, with every question grounded in the passage.
//
// Why a separate module rather than more branches in the route
// -----------------------------------------------------------
// The route owns HTTP concerns (auth, CSRF, quota, transactions). This owns the
// generation *sequence* and its failure semantics, which is the part worth
// testing directly: the two-phase order, the all-or-nothing guarantee, and the
// linkage guarantee. Neither the mock provider nor the LLM path is special-
// cased here.
//
// Ordering and why it is not parallelism-friendly
// ----------------------------------------------
// Phase A produces the passage. Phase B produces questions that must be
// answerable *from that passage*, so it cannot start until A has finished. The
// three Phase B sections are then independent of each other and run
// concurrently to bound wall-clock time.
//
// All-or-nothing
// --------------
// Any failure returns `{ ok: false }` with no partial payload. A half-written
// exam is worse than none: the teacher cannot tell which sections are real.
// The caller (route) writes nothing unless `ok` is true.

import {
  buildContext,
  generatePartOneCandidates,
  generateTextCandidates,
  generateTextExplorationCandidates,
  generateWritingCandidates,
  validateCandidate,
  type GenContext,
} from "./index";
import type { GeneratedTask, GeneratedTextCandidate, GeneratedTopic } from "@/types";

export const FULL_EXAM_SECTIONS = ["TEXT", "PART_ONE", "TEXT_EXPLORATION", "WRITING"] as const;
export type FullExamSection = (typeof FULL_EXAM_SECTIONS)[number];

/** One provider call per section, so a full run costs 4 quota units. */
export const FULL_EXAM_QUOTA_COST = FULL_EXAM_SECTIONS.length;

export interface FullExamResult {
  ok: boolean;
  /** Populated only when `ok`. Never partially populated. */
  text?: { title: string; text: string; candidates: GeneratedTextCandidate[]; source?: GeneratedTextCandidate["source"] };
  partOne?: GeneratedTask[][];
  textExploration?: GeneratedTask[][];
  writing?: { guided: GeneratedTopic; free: GeneratedTopic | null; singleTopic: boolean }[];
  /** Section-scoped validation messages, for diagnostics when ok is false. */
  issues: { section: FullExamSection | "TEXT"; messages: string[] }[];
}

export interface FullExamInput {
  level: string;
  grade: string;
  stream?: string | null;
  length: number;
  unit: string;
  topic: string;
  examId: string;
  language?: string | null;
  teacherKeywords?: string | null;
  difficulty?: string | null;
  /** BEM guides take one writing topic; BAC guides take two. */
  singleTopic: boolean;
}

/** Retries a provider call once on a transient failure. Bounded on purpose. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    return await fn().catch(() => {
      throw first;
    });
  }
}

function collect(result: FullExamResult): FullExamResult {
  return result;
}

/**
 * Generate a complete exam, or fail with nothing produced.
 *
 * Never throws for expected generation failures (validation issues, provider
 * errors): those come back as `ok: false` so the caller can answer 422 without a
 * partial write. Unexpected programmer errors still propagate.
 */
export async function generateFullExam(input: FullExamInput): Promise<FullExamResult> {
  const issues: FullExamResult["issues"] = [];
  const baseCtx = buildContext({
    level: input.level,
    grade: input.grade,
    stream: input.stream,
    length: input.length,
    unit: input.unit,
    topic: input.topic,
    examId: input.examId,
    language: input.language ?? undefined,
    teacherKeywords: input.teacherKeywords,
    difficulty: input.difficulty,
  });

  // ---- Phase A: the passage -------------------------------------------------
  // Validated on its own before anything else runs: a passage outside the
  // length band would make every downstream question ungroundable, so there is
  // no point spending three more provider calls on it.
  let textCandidates: GeneratedTextCandidate[];
  try {
    textCandidates = await withRetry(() => generateTextCandidates(baseCtx));
  } catch (e) {
    return collect({ ok: false, issues: [{ section: "TEXT", messages: [`Could not generate the passage: ${msg(e)}`] }] });
  }

  const primary = textCandidates[0];
  const textCheck = validateCandidate("TEXT", { text: primary?.text, title: primary?.title }, undefined, {
    length: baseCtx.length,
  });
  if (!textCheck.ok) {
    return collect({ ok: false, issues: [{ section: "TEXT", messages: textCheck.issues }] });
  }

  // The grounding text is the exact passage the teacher will print. Every
  // downstream question is validated against this string.
  const groundingText = primary.text;
  const ctx: GenContext = { ...baseCtx, groundingText };

  // ---- Phase B: questions, concurrent ------------------------------------
  // Each section validates independently; Promise.allSettled (not all) so one
  // slow section cannot discard three good ones — we still fail overall, but
  // the error names every section that was wrong, which is what the teacher
  // needs to know.
  const [partOneRes, explorationRes, writingRes] = await Promise.allSettled([
    withRetry(() => generatePartOneCandidates(ctx)),
    withRetry(() => generateTextExplorationCandidates(ctx)),
    withRetry(() => generateWritingCandidates(ctx)),
  ]);

  const partOneSets = await unwrap(partOneRes, "PART_ONE", issues);
  const explorationSets = await unwrap(explorationRes, "TEXT_EXPLORATION", issues);
  const writingCands = await unwrap(writingRes, "WRITING", issues);

  if (partOneSets) {
    const v = validateCandidate("PART_ONE", partOneSets[0], ctx.guide.marks.partOne, {
      guide: ctx.guide,
      groundingText,
    });
    if (!v.ok) issues.push({ section: "PART_ONE", messages: v.issues });
  }
  if (explorationSets) {
    const v = validateCandidate("TEXT_EXPLORATION", explorationSets[0], ctx.guide.marks.textExploration, {
      guide: ctx.guide,
      groundingText,
    });
    if (!v.ok) issues.push({ section: "TEXT_EXPLORATION", messages: v.issues });
  }
  if (writingCands) {
    const v = validateCandidate("WRITING", writingCands[0], undefined, { singleTopic: input.singleTopic });
    if (!v.ok) issues.push({ section: "WRITING", messages: v.issues });
  }

  // All-or-nothing: any issue at all aborts the whole run.
  if (issues.length > 0) return collect({ ok: false, issues });

  return collect({
    ok: true,
    issues: [],
    text: {
      title: primary.title,
      text: groundingText,
      candidates: textCandidates.slice(1),
      source: primary.source,
    },
    partOne: partOneSets!,
    textExploration: explorationSets!,
    writing: writingCands!.map((c) => ({ ...c, singleTopic: input.singleTopic })),
  });
}

async function unwrap<T>(
  res: PromiseSettledResult<T>,
  section: FullExamSection,
  issues: FullExamResult["issues"]
): Promise<T | null> {
  if (res.status === "fulfilled") return res.value;
  issues.push({ section, messages: [`Could not generate this section: ${msg(res.reason)}`] });
  return null;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}