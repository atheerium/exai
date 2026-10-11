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
  /** Passage paragraphs, 3 or 4 (teacher choice, default 3). */
  paragraphCount?: number;
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

/**
 * One repair attempt, carrying the validator's own complaints back to the model.
 *
 * `withRetry` above only helps with TRANSPORT failures (429, timeout). A
 * validation failure is different: the model answered, and the answer was
 * wrong. Re-rolling the same prompt at the same temperature usually reproduces
 * the same mistake, so instead the exact issue strings are appended — the
 * validator already speaks in terms a teacher reads, e.g. "Generated text has 2
 * paragraph(s) instead of 3" or "Paragraph 2 does not mention ... off-topic".
 *
 * Bounded at ONE attempt, and only for the passage. Two reasons:
 *   - A prompt that must satisfy a validator becomes a conversation, and a
 *     conversation with a free-tier model costs more tokens than it saves.
 *   - The failure the repair cannot fix (a topic that has no good 3-paragraph
 *     treatment) must still surface to the teacher rather than being papered
 *     over by repeated sampling.
 *
 * If the repair fails, the ORIGINAL issues are returned, not the repair's: the
 * teacher should see the real problem, not a downstream symptom of the retry.
 */
async function repairPassage(
  generate: (issues: string[]) => Promise<GeneratedTextCandidate[]>,
  validate: (c: GeneratedTextCandidate) => { ok: boolean; issues: string[] },
  baseIssues: string[]
): Promise<{ candidates: GeneratedTextCandidate[] | null; issues: string[] }> {
  try {
    const repaired = await generate(baseIssues);
    const candidate = repaired[0];
    const check = candidate ? validate(candidate) : { ok: false, issues: ["no passage returned"] };
    // The whole list is returned, not just the primary: the alternatives offered
    // in the replacement panel must come from the SAME call, or the panel would
    // offer passages unrelated to the one that passed validation.
    if (check.ok) return { candidates: repaired, issues: [] };
    return { candidates: null, issues: baseIssues };
  } catch {
    // Never surface a transport error in place of a real validation issue.
    return { candidates: null, issues: baseIssues };
  }
}

/**
 * The corrective prompt for a single repair attempt.
 *
 * Deliberately terse. The provider already owns the exam instructions, the
 * schema and the teacher parameters; this adds only what the validator found
 * wrong, so the model is not re-reading the whole specification mid-conversation.
 */
function repairContext(ctx: GenContext, issues: string[]): GenContext {
  return {
    ...ctx,
    repairOf: issues.join(" | "),
  };
}

/** `Promise.allSettled([p])` for one promise, so `unwrap` keeps one signature. */
async function settle<T>(run: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await run() };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

/** Narrowing helper: `unwrap` only returns null after pushing an issue. */
function unwrap<T>(res: PromiseSettledResult<T>, section: FullExamSection, issues: FullExamResult["issues"]): T | null {
  if (res.status === "fulfilled") return res.value;
  issues.push({ section, messages: [`Could not generate this section: ${msg(res.reason)}`] });
  return null;
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
    paragraphCount: input.paragraphCount,
  });

  // ---- Phase A: the passage -------------------------------------------------
  // Validated on its own before anything else runs: a passage outside the
  // length band would make every downstream question ungroundable, so there is
  // no point spending three more provider calls on it.
  const validatePassage = (c: GeneratedTextCandidate) =>
    validateCandidate("TEXT", { text: c.text, title: c.title }, undefined, {
      length: baseCtx.length,
      // The two passage-shape rules. Both are checked here, before any question
      // is generated: a passage with the wrong paragraph count or a drifting one
      // would waste three more model calls on questions nobody can answer well.
      paragraphCount: baseCtx.paragraphCount,
      topic: baseCtx.topic,
      teacherKeywords: baseCtx.teacherKeywords,
    });

  let primary: GeneratedTextCandidate | undefined;
  // The alternatives offered in the replacement panel. Tracked separately from
  // `primary` so a repair attempt swaps both together: keeping alternatives from
  // a rejected attempt alongside a repaired primary would offer the teacher
  // passages that already failed validation.
  let alternatives: GeneratedTextCandidate[] = [];
  try {
    const textCandidates = await withRetry(() => generateTextCandidates(baseCtx));
    const first = textCandidates[0];
    const check = first ? validatePassage(first) : { ok: false, issues: ["no passage returned"] };

    if (check.ok) {
      primary = first;
      alternatives = textCandidates.slice(1);
    } else {
      // The prompt already states the paragraph count and the one-topic rule, so
      // a miss here is usually a near miss worth one corrective call.
      const repaired = await withRetry(() =>
        repairPassage(
          (issues) => generateTextCandidates(repairContext(baseCtx, issues)),
          validatePassage,
          check.issues
        )
      );
      if (!repaired.candidates) {
        return { ok: false, issues: [{ section: "TEXT", messages: repaired.issues }] };
      }
      primary = repaired.candidates[0];
      alternatives = repaired.candidates.slice(1);
    }
  } catch (e) {
    return { ok: false, issues: [{ section: "TEXT", messages: [`Could not generate the passage: ${msg(e)}`] }] };
  }

  if (!primary) {
    return { ok: false, issues: [{ section: "TEXT", messages: ["no passage returned"] }] };
  }

  // The grounding text is the exact passage the teacher will print. Every
  // downstream question is validated against this string.
  const groundingText = primary.text;
  const ctx: GenContext = { ...baseCtx, groundingText };

  // ---- Phase B: questions, SEQUENTIAL --------------------------------------
  //
  // This was `Promise.allSettled` and it could not work on the free tier. Each
  // section carries the full passage as its prompt, so one section is already
  // ~2-4K tokens; three at once plus the passage call exceed Groq's 8000
  // tokens-per-minute limit and the run fails with a 429 (measured live
  // 2026-10-11: 3 of 4 runs died on TPM, not on content).
  //
  // Each section is still settled independently and ALL of them still run, so
  // one failure does not hide the others — the teacher still gets every section
  // that was wrong named at once. Only the timing changed.
  //
  // A paid tier with a higher TPM can restore concurrency without touching this
  // code: raise it there, and keep it here.
  const partOneRes = await settle(() => withRetry(() => generatePartOneCandidates(ctx)));
  const explorationRes = await settle(() => withRetry(() => generateTextExplorationCandidates(ctx)));
  const writingRes = await settle(() => withRetry(() => generateWritingCandidates(ctx)));

  const partOneSets = unwrap(partOneRes, "PART_ONE", issues);
  const explorationSets = unwrap(explorationRes, "TEXT_EXPLORATION", issues);
  const writingCands = unwrap(writingRes, "WRITING", issues);

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
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    issues: [],
    text: {
      title: primary.title,
      text: groundingText,
      candidates: alternatives,
      source: primary.source,
    },
    partOne: partOneSets!,
    textExploration: explorationSets!,
    writing: writingCands!.map((c) => ({ ...c, singleTopic: input.singleTopic })),
  };
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}