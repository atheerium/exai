// Orchestrates a complete first-draft exam: passage, Part One, Text Exploration
// and Writing, in that order, with every question grounded in the passage.
//
// Why a separate module rather than more branches in the route
// -----------------------------------------------------------
// The route owns HTTP concerns (auth, CSRF, quota, transactions). This owns the
// generation *sequence* and its failure semantics, which is the part worth
// testing directly: the two-phase order, the all-or-nothing guarantee, and the
// linkage guarantee.
//
// Ordering and why it is not parallelism-friendly
// ----------------------------------------------
// Phase A produces the passage. Phase B produces questions that must be
// answerable *from that passage*, so it cannot start until A has finished.
//
// Validation happens INSIDE the chain
// -----------------------------------
// Every section goes through `generateValidated`, never through the raw
// `generate*Candidates` facade. That distinction is the whole fix for the
// 2026-10-26 production failure: with validation outside the chain, the first
// model to answer won even when its answer was wrong, so one bad model failed
// every exam while a good one sat behind it. See `runChainLadder` in index.ts.
//
// All-or-nothing
// --------------
// Any failure returns `{ ok: false }` with no partial payload. A half-written
// exam is worse than none: the teacher cannot tell which sections are real.
// The caller (route) writes nothing unless `ok` is true.

import {
  buildContext,
  generateValidated,
  runBudgetMs,
  validateCandidate,
  type GenContext,
  type LadderResult,
} from "./index";
import { trimPassageToBand } from "./trim";
import { ChainError } from "./chain";
import type { GeneratedTask, GeneratedTextCandidate, GeneratedTopic } from "@/types";

export const FULL_EXAM_SECTIONS = ["TEXT", "PART_ONE", "TEXT_EXPLORATION", "WRITING"] as const;
export type FullExamSection = (typeof FULL_EXAM_SECTIONS)[number];

/**
 * One provider call per section, so a full run costs 4 quota units at minimum.
 *
 * A run can cost more: every entry in the chain may be tried, and each entry gets
 * one corrective call when its reply fails the exam's rules. The quota is a
 * teacher-facing allowance per run, not a count of HTTP requests.
 */
export const FULL_EXAM_QUOTA_COST = FULL_EXAM_SECTIONS.length;

/** One writing proposal. BEM guides carry no free topic. */
type WritingPair = { guided: GeneratedTopic; free: GeneratedTopic | null };

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

/**
 * True when the ONLY problem is the length band.
 *
 * The trim is a surgical fix and must not be used to paper over anything else:
 * if the passage is also off-topic or has the wrong paragraph count, cutting
 * sentences could easily make that worse, so the repair path handles it instead.
 */
function isOnlyLengthIssue(issues: string[]): boolean {
  return issues.length > 0 && issues.every((i) => /word count .* is outside the expected range/.test(i));
}

/** `Promise.allSettled([p])` for one promise, so `unwrapLadder` keeps one signature. */
async function settle<T>(run: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await run() };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

/**
 * Marks a run-level (not section-level) failure. Matching on the message prefix
 * is deliberate: it is the one string the budget error is built from, and it
 * keeps the whole-run/section distinction out of the issue list, which the API
 * contract already returns verbatim to the teacher.
 */
const BUDGET_PREFIX = "The time budget for this run is spent";

function isBudgetError(e: unknown): boolean {
  return e instanceof ChainError && e.failure === "budget";
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Report a transport-shaped failure once, without duplicating the budget line. */
function reportTransport(
  reason: unknown,
  section: FullExamSection,
  issues: FullExamResult["issues"]
): void {
  // A spent budget is a whole-run condition, not a per-section fault. Reporting
  // it once per remaining section would give the teacher three identical lines
  // and hide which section actually ran out of time.
  if (isBudgetError(reason)) {
    // Only the first one: the sections after it will trip the same check
    // instantly, and three identical lines hide which part ran out of time.
    if (!issues.some((i) => i.messages[0]?.startsWith(BUDGET_PREFIX))) {
      issues.push({ section, messages: [msg(reason)] });
    }
    return;
  }
  issues.push({ section, messages: [`Could not generate this section: ${msg(reason)}`] });
}

/**
 * Turn a settled ladder result into a payload, or name the reason it failed.
 *
 * A validation failure reports the ORIGINAL issue strings — the same words the
 * teacher would read on the paper's defect — never a downstream symptom of a
 * retry. A transport failure keeps its own message so "the provider was down" is
 * distinguishable from "the model wrote the wrong thing".
 */
function unwrapLadder<T>(
  res: PromiseSettledResult<LadderResult<T>>,
  section: FullExamSection,
  issues: FullExamResult["issues"]
): T | null {
  if (res.status === "rejected") {
    reportTransport(res.reason, section, issues);
    return null;
  }
  if (res.value.ok) return res.value.value;
  if (res.value.issues.length > 0) {
    issues.push({ section, messages: res.value.issues });
  } else {
    reportTransport(res.value.error, section, issues);
  }
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
  // One deadline for the whole run, not per call: the teacher pressed one button
  // and is watching it spin. Four sequential sections, each of which may walk the
  // chain and make a corrective call, can otherwise spend minutes before admitting
  // failure — and since the run is all-or-nothing, every one of those minutes
  // produces nothing at all. Measured live 2026-10-13: a single run reached 199s
  // of chain-walking on blocked/overloaded models.
  //
  // Overridable for a slower provider or a larger TPM quota. Read once here
  // rather than per call so every section of a run shares one budget.
  const runDeadlineMs = Date.now() + runBudgetMs();
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
    runDeadlineMs,
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

  /**
   * Code-side trim, before any model call is spent on fixing an over-long text.
   *
   * An over-length passage is computable, so it is computed (`trim.ts`) rather
   * than re-rolled; a model asked twice tends to overshoot twice. Only a pure
   * length failure is trimmed, and the trimmed text is re-validated against every
   * other rule, so a trim that breaks anchoring or the paragraph count is
   * discarded rather than shipped.
   */
  const trimOverLong = (candidates: GeneratedTextCandidate[]): GeneratedTextCandidate[] => {
    const first = candidates[0];
    if (!first) return candidates;
    const check = validatePassage(first);
    if (check.ok || !isOnlyLengthIssue(check.issues)) return candidates;
    const trimmed = trimPassageToBand(first.text, { length: baseCtx.length });
    if (!trimmed.trimmed) return candidates;
    if (!validatePassage({ ...first, text: trimmed.text }).ok) return candidates;
    console.warn(
      `[generate] passage was ${trimmed.wordsBefore} words (band max ` +
        `${Math.ceil(baseCtx.length * 1.2)}); trimmed to ${trimmed.wordsAfter}`
    );
    return [{ ...first, text: trimmed.text }, ...candidates.slice(1)];
  };

  let passage: LadderResult<GeneratedTextCandidate[]>;
  try {
    passage = await generateValidated<GeneratedTextCandidate[]>({
      ctx: baseCtx,
      run: (impl, ctx) => impl.generateTextCandidates(ctx),
      validate: (candidates) =>
        candidates[0] ? validatePassage(candidates[0]) : { ok: false, issues: ["no passage returned"] },
      normalise: trimOverLong,
    });
  } catch (e) {
    return { ok: false, issues: [{ section: "TEXT", messages: [`Could not generate the passage: ${msg(e)}`] }] };
  }

  if (!passage.ok) {
    const messages = passage.issues.length > 0 ? passage.issues : [`Could not generate the passage: ${msg(passage.error)}`];
    return { ok: false, issues: [{ section: "TEXT", messages }] };
  }

  // The alternatives offered in the replacement panel come from the SAME reply as
  // the primary. Keeping alternatives from an attempt that already failed
  // validation would offer the teacher passages that were rejected.
  const textCandidates = passage.value;
  const primary = textCandidates[0]!;
  const alternatives = textCandidates.slice(1);

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
  //
  // Each section validates with the IDENTICAL opts (`groundingText` included):
  // a "repaired" section checked more loosely than the original would let exactly
  // the defect being repaired through.
  const p1Check = (tasks: GeneratedTask[]) =>
    validateCandidate("PART_ONE", tasks, ctx.guide.marks.partOne, { guide: ctx.guide, groundingText });
  const teCheck = (tasks: GeneratedTask[]) =>
    validateCandidate("TEXT_EXPLORATION", tasks, ctx.guide.marks.textExploration, { guide: ctx.guide, groundingText });
  const wCheck = (pair: WritingPair) => validateCandidate("WRITING", pair, undefined, { singleTopic: input.singleTopic });

  const partOneRes = await settle(() =>
    generateValidated<GeneratedTask[][]>({
      ctx,
      run: (impl, c) => impl.generatePartOneCandidates(c),
      validate: (sets) => (sets[0] ? p1Check(sets[0]) : { ok: false, issues: ["No tasks were generated."] }),
    })
  );
  const explorationRes = await settle(() =>
    generateValidated<GeneratedTask[][]>({
      ctx,
      run: (impl, c) => impl.generateTextExplorationCandidates(c),
      validate: (sets) => (sets[0] ? teCheck(sets[0]) : { ok: false, issues: ["No tasks were generated."] }),
    })
  );
  const writingRes = await settle(() =>
    generateValidated<WritingPair[]>({
      ctx,
      run: (impl, c) => impl.generateWritingCandidates(c),
      validate: (pairs) => (pairs[0] ? wCheck(pairs[0]) : { ok: false, issues: ["No writing topics were generated."] }),
    })
  );

  const partOneSets = unwrapLadder(partOneRes, "PART_ONE", issues);
  const explorationSets = unwrapLadder(explorationRes, "TEXT_EXPLORATION", issues);
  const writingCands = unwrapLadder(writingRes, "WRITING", issues);

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
