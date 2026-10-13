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
  runBudgetMs,
  validateCandidate,
  type GenContext,
} from "./index";
import { trimPassageToBand } from "./trim";
import { ChainError } from "./chain";
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
 * Used for the passage AND for every task section. Task sections previously had
 * transport retry only, so one bad vocabulary target ("Task 1 targets \"urge\"",
 * which does not occur in the passage — teacher report 2026-10-13) discarded a
 * whole exam of otherwise correct work with no second chance.
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
export async function repairGeneration<T>(
  generate: (issues: string[]) => Promise<T[]>,
  validate: (c: T) => { ok: boolean; issues: string[] },
  baseIssues: string[],
  opts: { emptyIssue: string; /** What the repaired list's first element is called. */ noun: string }
): Promise<{ candidates: T[] | null; issues: string[] }> {
  try {
    const repaired = await generate(baseIssues);
    const candidate = repaired[0];
    const check = candidate ? validate(candidate) : { ok: false, issues: [opts.emptyIssue] };
    // The whole list is returned, not just the primary: the alternatives offered
    // in the replacement panel must come from the SAME call, or the panel would
    // offer material unrelated to the one that passed validation.
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

/**
 * Validate a section, and on failure give the model exactly one corrective call.
 *
 * Returns the replacement payload when the repair succeeded, `null` when the
 * original was already fine, and pushes the ORIGINAL issue strings when the
 * repair failed. Returning `null` for "already fine" and for "repair failed" is
 * why the caller pushes issues here rather than after: this is the only place
 * that knows which happened.
 */
async function maybeRepair<T>(
  section: FullExamSection,
  regenerate: (issues: string[]) => Promise<T[]>,
  validate: (value: T) => { ok: boolean; issues: string[] },
  initial: { ok: boolean; issues: string[] },
  sink: FullExamResult["issues"]
): Promise<T | null> {
  if (initial.ok) return null;

  const repaired = await repairGeneration<T>(
    regenerate,
    validate,
    initial.issues,
    { emptyIssue: "no content returned", noun: section }
  );
  if (!repaired.candidates) {
    sink.push({ section, messages: initial.issues });
    return null;
  }
  console.warn(`[generate] ${section} failed validation, repaired on one retry: ${initial.issues[0]}`);
  return repaired.candidates[0];
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
  // A spent budget is a whole-run condition, not a per-section fault. Reporting
  // it once per remaining section would give the teacher three identical lines
  // and hide which section actually ran out of time.
  if (isBudgetError(res.reason)) {
    // Only the first one: the sections after it will trip the same check
    // instantly, and three identical lines hide which part ran out of time.
    if (!issues.some((i) => i.messages[0]?.startsWith(BUDGET_PREFIX))) {
      issues.push({ section, messages: [msg(res.reason)] });
    }
    return null;
  }
  issues.push({ section, messages: [`Could not generate this section: ${msg(res.reason)}`] });
  return null;
}

/**
 * Marks a run-level (not section-level) failure. Matching on the message prefix
 * is deliberate: it is the one string the budget error is built from, and it
 * keeps the whole-run/section distinction out of `FullExamIssue`, which the API
 * contract already returns verbatim to the teacher.
 */
const BUDGET_PREFIX = "The time budget for this run is spent";

function isBudgetError(e: unknown): boolean {
  return e instanceof ChainError && e.failure === "budget";
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
  // and is watching it spin. Four sequential sections plus a bounded repair each,
  // on a chain that advances on throttles, can otherwise spend minutes before
  // admitting failure — and since the run is all-or-nothing, every one of those
  // minutes produces nothing at all. Measured live 2026-10-13: a single run
  // reached 199s of chain-walking on blocked/overloaded models.
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

  let primary: GeneratedTextCandidate | undefined;
  // The alternatives offered in the replacement panel. Tracked separately from
  // `primary` so a repair attempt swaps both together: keeping alternatives from
  // a rejected attempt alongside a repaired primary would offer the teacher
  // passages that already failed validation.
  let alternatives: GeneratedTextCandidate[] = [];
  try {
    const textCandidates = await withRetry(() => generateTextCandidates(baseCtx));
    let first = textCandidates[0];
    let check = first ? validatePassage(first) : { ok: false, issues: ["no passage returned"] };

    // Code-side trim, BEFORE any model call is spent on fixing it. An
    // over-length passage is computable, so it is computed (trim.ts) rather
    // than re-rolled; a model asked twice tends to overshoot twice. Only a
    // pure length failure is trimmed, and the trimmed text is re-validated
    // against every other rule, so a trim that breaks anchoring or the
    // paragraph count is discarded rather than shipped.
    if (!check.ok && first && isOnlyLengthIssue(check.issues)) {
      const trimmed = trimPassageToBand(first.text, { length: baseCtx.length });
      if (trimmed.trimmed) {
        const recheck = validatePassage({ ...first, text: trimmed.text });
        if (recheck.ok) {
          console.warn(
            `[generate] passage was ${trimmed.wordsBefore} words (band max ` +
              `${Math.ceil(baseCtx.length * 1.2)}); trimmed to ${trimmed.wordsAfter}`
          );
          first = { ...first, text: trimmed.text };
          check = recheck;
        }
      }
    }

    if (check.ok) {
      primary = first;
      alternatives = textCandidates.slice(1);
    } else {
      // The prompt already states the paragraph count and the one-topic rule, so
      // a miss here is usually a near miss worth one corrective call.
      const repaired = await withRetry(() =>
        repairGeneration(
          (issues) => generateTextCandidates(repairContext(baseCtx, issues)),
          validatePassage,
          check.issues,
          { emptyIssue: "no passage returned", noun: "passage" }
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

  // Each section gets ONE repair attempt when validation fails, exactly like the
  // passage. Re-validates with the IDENTICAL opts -- including `groundingText` --
  // because a "repaired" section that was checked more loosely than the original
  // would let exactly the defect we are repairing through.
  //
  // Bounded at one per section, and only on the failure path: at most three
  // extra calls for a whole exam. The ORIGINAL issues are returned when the
  // repair fails, never the repair's own, so the teacher sees the real reason.
  const p1Opts = { guide: ctx.guide, groundingText } as const;
  const p1Check = (tasks: GeneratedTask[]) =>
    validateCandidate("PART_ONE", tasks, ctx.guide.marks.partOne, p1Opts);
  const p1Validation = partOneSets
    ? await maybeRepair(
        "PART_ONE",
        (rIssues) => generatePartOneCandidates(repairContext(ctx, rIssues)),
        (sets) => p1Check(sets),
        p1Check(partOneSets[0]),
        issues
      )
    : null;
  if (p1Validation) partOneSets![0] = p1Validation;

  const teOpts = { guide: ctx.guide, groundingText } as const;
  const teCheck = (tasks: GeneratedTask[]) =>
    validateCandidate("TEXT_EXPLORATION", tasks, ctx.guide.marks.textExploration, teOpts);
  const teValidation = explorationSets
    ? await maybeRepair(
        "TEXT_EXPLORATION",
        (rIssues) => generateTextExplorationCandidates(repairContext(ctx, rIssues)),
        (sets) => teCheck(sets),
        teCheck(explorationSets[0]),
        issues
      )
    : null;
  if (teValidation) explorationSets![0] = teValidation;

  if (writingCands) {
    const wOpts = { singleTopic: input.singleTopic } as const;
    // `payload` is `unknown` at the validator, so the shape stays the caller's
    // business: typing the parameter as the generator's own return type keeps the
    // repair generic without a cast.
    const wCheck = (cands: Awaited<ReturnType<typeof generateWritingCandidates>>[number]) =>
      validateCandidate("WRITING", cands, undefined, wOpts);
    const wValidation = await maybeRepair(
      "WRITING",
      (rIssues) => generateWritingCandidates(repairContext(ctx, rIssues)),
      (cands) => wCheck(cands),
      wCheck(writingCands[0]),
      issues
    );
    if (wValidation) writingCands[0] = wValidation;
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