// Generation service facade (PRD sections 16, 17).
//
// The UI/API layer talks to this facade. Providers are pluggable: the default
// "mock" provider is deterministic and needs no credentials; set
// AI_PROVIDER=openai to route through OpenAI, AI_PROVIDER=groq for Groq
// (see openai.ts / groq.ts). Validation happens before candidates are
// presented to the teacher (structural, numeric, curriculum).
//
// Teacher keywords (optional): when provided via the ExamConfig, they bias
// generation toward specific themes or vocabulary.

import {
  resolveRules,
  normaliseParagraphCount,
  ALLOWED_PARAGRAPH_COUNTS,
  DEFAULT_PARAGRAPH_COUNT,
} from "@/lib/guide";
import { countWords } from "./rng";
import { checkParagraphBalance, splitPassageParagraphs } from "./paragraph-balance";
import { checkTaskLinkage, checkTopicAnchoring, type LinkableTask } from "./grounding";
import { taskHasTable } from "@/lib/export/tables";
// The word-bank reader lives with the layout that prints it, so the shape the
// parser accepts and the shape the paper renders cannot drift. `export/paper.ts`
// imports only `assemble`, `referents` and `tables`, none of which import back
// into `generate/`, so this is not a cycle.
import { extractWordBank } from "@/lib/export/paper";
// `gapCount` measures the gap markers in the task text; `extractWordBank` strips
// the `List: [...]` line first, so the bracketed list is never mistaken for a gap.
import { countSentences, gapCount, hasClusteredGaps } from "@/lib/export/gaps";
import type { GenerationRequest } from "@/types";
import * as mock from "./mock";
import { createCompatibleGenerators } from "./provider";
import {
  chainFromEnv,
  classifyFailure,
  resolveChain,
  shouldAdvance,
  ChainError,
  type ResolvedChainEntry,
} from "./chain";
import type { GeneratedSource, GeneratedTask, GeneratedText, GeneratedTextCandidate, GeneratedTopic } from "@/types";

export type { GeneratedSource, GeneratedTask, GeneratedText, GeneratedTextCandidate, GeneratedTopic };

export interface GenContext {
  grade: string;
  unit: string;
  topic: string;
  length: number;
  guide: ReturnType<typeof resolveRules>["guide"];
  themeKey: string;
  seed: string;
  stream?: string | null;
  language: string;
  teacherKeywords?: string | null;
  difficulty?: string | null;
  /**
   * The passage already generated for this exam. Set by the full-exam flow so
   * task material is drawn from the printed text; absent for per-part
   * generation, which keeps the theme-level behaviour.
   */
  groundingText?: string | null;
  /**
   * Paragraphs in the passage. Teacher choice, default 3 (user instruction,
   * 2026-11); offered as 3 or 4 because the arc is lead → aspects → close.
   */
  paragraphCount?: number;
  /**
   * Set only on a repair attempt: the validator's own complaints about the
   * previous reply, verbatim — or, for an unreadable reply, the parser's reason.
   * Undefined on a first call.
   *
   * Re-rolling the same prompt at the same temperature tends to reproduce the
   * same mistake, so one corrective call is allowed. `runChainLadder` in
   * `index.ts` owns the ordering and the bound; `provider.ts` must append
   * `repairNote(ctx)` to every request string or this field is inert.
   */
  repairOf?: string;
  /**
   * Epoch ms after which this run must not start another generation.
   *
   * Set ONLY by `generateFullExam`, and named by the stage in the thrown error.
   * Per-section generation is left unbounded: it is one call, the teacher is
   * waiting on a single button, and the transport's own 30s cap already applies.
   * A full exam is four sequential sections with a bounded repair each, so a
   * chain that keeps advancing on throttles can spend minutes producing nothing.
   */
  runDeadlineMs?: number;
}

export function buildContext(input: {
  level: string;
  grade: string;
  stream?: string | null;
  length: number;
  unit: string;
  topic: string;
  examId: string;
  language?: string;
  teacherKeywords?: string | null;
  difficulty?: string | null;
  groundingText?: string | null;
  paragraphCount?: number | null;
  /**
   * Epoch ms after which no further generation may START. Carried straight
   * through to the returned context; see `GenContext.runDeadlineMs`.
   */
  runDeadlineMs?: number;
}): GenContext {
  const rules = resolveRules({
    level: input.level,
    grade: input.grade,
    stream: input.stream,
    length: input.length,
    unit: input.unit,
    topic: input.topic,
    language: input.language,
  });
  return {
    grade: rules.grade,
    unit: rules.unitLabel,
    topic: rules.topic,
    length: rules.length,
    guide: rules.guide,
    themeKey: rules.themeKey,
    seed: `${input.examId}:${rules.grade}:${input.unit}:${input.topic}`,
    stream: rules.stream,
    language: rules.language,
    teacherKeywords: input.teacherKeywords ?? null,
    difficulty: input.difficulty ?? null,
    groundingText: input.groundingText ?? null,
    paragraphCount: normaliseParagraphCount(input.paragraphCount),
    runDeadlineMs: input.runDeadlineMs,
  };
}

/**
 * How long one full-exam run may take, in ms.
 *
 * Raised from 120s to 180s on 2026-10-26, when every section gained a corrective
 * call that is itself transport-retried: a throttled free tier can legitimately
 * spend 80s producing a *valid* exam (measured: 3as took 79.7s under a run of
 * 429s and still passed). Cutting that off at 120s would discard good work. Both
 * generation routes declare `maxDuration = 300`, so the platform still waits.
 *
 * `AI_RUN_BUDGET_MS` overrides it for a paid provider or a higher TPM quota; a
 * malformed or non-positive value falls back to the default rather than
 * disabling the budget, because an accidental `0` would read as "no limit" and
 * silently restore the hang.
 */
const DEFAULT_RUN_BUDGET_MS = 180_000;

export function runBudgetMs(): number {
  const raw = Number(process.env.AI_RUN_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RUN_BUDGET_MS;
}

/**
 * Paragraph counts a teacher may pick. Owned by `guide.ts` and re-exported here
 * so generator code has a single import site; see that file for why it lives
 * there rather than here.
 */
export { ALLOWED_PARAGRAPH_COUNTS, DEFAULT_PARAGRAPH_COUNT, normaliseParagraphCount };

export function providerName(): string {
  return process.env.AI_PROVIDER || "mock";
}

/** Which entry of the chain served the last successful call, for the ops log. */
let lastServingEntry = "mock";

/**
 * `provider:model` pairs this key has been refused, per process.
 *
 * Keyed by the PAIR, not the model alone: a block is scoped to a project on one
 * provider, and the same model may serve fine through another provider. Losing
 * the list on restart is deliberate — it is a per-process optimisation, not a
 * source of truth, and a redeploy is the documented way to retry a model that has
 * since been enabled.
 */
const blockedEntries = new Set<string>();

export function servingProvider(): string {
  return lastServingEntry;
}

/**
 * The mock provider's functions are synchronous (they read a local corpus), so
 * the chain adapter accepts either shape and normalises to a promise.
 */
type MaybePromise<T> = T | Promise<T>;

type GeneratorImpl = {
  generateTextCandidates: (ctx: GenContext) => MaybePromise<GeneratedTextCandidate[]>;
  generatePartOneCandidates: (ctx: GenContext) => MaybePromise<GeneratedTask[][]>;
  generateTextExplorationCandidates: (ctx: GenContext) => MaybePromise<GeneratedTask[][]>;
  generateWritingCandidates: (ctx: GenContext) => MaybePromise<{ guided: GeneratedTopic; free: GeneratedTopic | null }[]>;
  generateRewriteCandidates: (
    ctx: GenContext,
    opts: { text: string; title?: string; target: "simpler" | "harder" }
  ) => MaybePromise<GeneratedTextCandidate[]>;
};

/**
 * The stage information a deadline error is built from.
 *
 * Deliberately narrower than `GenContext`: `withChain` (per-section generation)
 * carries no context at all, and the chain walker must accept both shapes.
 */
export type LadderStage = {
  runDeadlineMs?: number;
  repairOf?: string;
  groundingText?: string | null;
};

/**
 * Human-readable names for the stages of a full exam, used in the deadline
 * error. The teacher needs to know WHICH part gave up, not that "something
 * timed out" — the whole exam is all-or-nothing, so a bare timeout would read as
 * a total failure with no cause.
 */
function stageName(ctx?: LadderStage): string {
  if (ctx?.repairOf) return "a repair attempt";
  if (ctx?.groundingText) return "a question section";
  return "the passage";
}

/** Throws when the budget is gone, naming the stage and what was skipped. */
function assertDeadline(
  ctx: LadderStage | undefined,
  entryKey: string,
  skipped: string[]
): void {
  const deadlineMs = ctx?.runDeadlineMs;
  if (!deadlineMs) return;
  if (Date.now() < deadlineMs) return;
  const suffix = skipped.length
    ? ` ${skipped.length} chain entr${skipped.length === 1 ? "y was" : "ies were"} left untried.`
    : "";
  // No duration is printed: `runDeadlineMs` is an absolute timestamp, so any
  // number derived from it here would be nonsense to the teacher reading it.
  throw new ChainError(
    "budget",
    entryKey,
    "",
    `The time budget for this run is spent: ${stageName(ctx)} could not be started.${suffix}`
  );
}

/** Names of the entries after index `i`, for the deadline message. */
function remainingEntries(configs: { providerLabel: string; model: string }[], i: number): string[] {
  return configs.slice(i + 1).map((c) => `${c.providerLabel}:${c.model}`);
}

/**
 * Outcome of one walk over the chain.
 *
 * `issues` is non-empty only when a model ANSWERED and the answer was wrong;
 * `error` is set when the failure was transport-shaped. Keeping the two apart is
 * what lets each caller report in its own terms without re-deriving the cause.
 */
export type LadderResult<T> =
  | { ok: true; value: T; entry: string; repaired: boolean }
  | { ok: false; issues: string[]; error?: unknown };

/**
 * How long to wait before re-dialling the same entry once.
 *
 * Transport failures only. The free tiers answer 429/503 under shared load and
 * the identical request often succeeds seconds later, so one short retry on the
 * entry that is already warm is worth more than advancing to a colder model.
 * A validation failure is NOT retried this way: re-rolling the same prompt at
 * the same temperature reproduces the same mistake, so it gets a corrective call
 * carrying the validator's own words instead.
 */
const RETRY_DELAY_MS = 500;

/** A spent run budget is terminal: the next entry would be refused too. */
function isBudgetError(e: unknown): boolean {
  return e instanceof ChainError && e.failure === "budget";
}

/**
 * Walk the chain until an entry produces a reply that passes `validate`.
 *
 * Per entry, in this order:
 *   1. one attempt, with ONE transport retry on the same entry;
 *   1b. an unreadable reply (`content`: invalid JSON, empty content, a task object
 *      with no `prompt`) skips straight to step 3, because re-rolling an identical
 *      prompt reproduces a shape error;
 *   2. `validate` the reply;
 *   3. ONE corrective call on the SAME entry carrying the validator's issues (or
 *      the parser's reason) verbatim — one, because a prompt that must satisfy a
 *      validator becomes a conversation, and a conversation costs more tokens than
 *      it saves on a free tier;
 *   4. only after that fails, advance to the next entry.
 *
 * Ordering matters and is the reason this exists. Validating OUTSIDE the chain —
 * which is what the code did until 2026-10-26 — means the first model to answer
 * wins even when its answer is wrong, so one bad model (measured: Nemotron 3.5
 * Lightning, 1 paragraph / ~60 words on every run) fails every exam while a good
 * model sits unused behind it. Repairing before advancing also avoids spending a
 * cold model's quota on a near miss the warm one can fix.
 *
 * `validate` returning `ok` unconditionally reduces this to "first entry that
 * answers", which is what per-section generation wants.
 */
export async function runChainLadder<T, C extends LadderStage = LadderStage>(opts: {
  configs: ResolvedChainEntry[];
  ctx: C;
  attempt: (cfg: ResolvedChainEntry, ctx: C) => Promise<T>;
  validate: (value: T) => { ok: boolean; issues: string[] };
  /** Applied to a successful reply before validation (the passage trim). */
  normalise?: (value: T, ctx: C) => T;
  /** Injected by tests so the retry delay is not paid by the suite. */
  sleep?: (ms: number) => Promise<void>;
  /** Entries already refused by this process; mutated when one is refused again. */
  blocked?: Set<string>;
}): Promise<LadderResult<T>> {
  const blocked = opts.blocked ?? new Set<string>();
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const repairCtx = (ctx: C, issues: string[]): C =>
    ({ ...ctx, repairOf: issues.join(" | ") }) as C;

  let lastIssues: string[] = [];
  let lastError: unknown;
  let answered = false;

  /**
   * One dial of one entry, with one transport retry on ITSELF.
   *
   * Returns a discriminated result instead of throwing, because the three
   * outcomes lead to three different places: a readable reply goes to the
   * validator, an unreadable shape is worth one corrective call, and a transport
   * failure means "advance".
   *
   * The retry is here rather than around each call site so the CORRECTIVE call
   * gets it too. Measured live 2026-10-26 (2as): the repair hit a 429, the ladder
   * advanced instead of re-dialling, and the exam failed on a gap-fill count that
   * the warm model would have fixed — the one call most likely to be throttled is
   * the second one, because it follows a full request.
   */
  type Dial =
    | { kind: "ok"; value: T }
    | { kind: "shape"; issue: string }
    | { kind: "advance" }
    | { kind: "fatal"; error: unknown };

  const dial = async (cfg: ResolvedChainEntry, stage: C, entryKey: string, remaining: string[]): Promise<Dial> => {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      // Checked BEFORE dialling, not after: the point is not to spend the
      // remaining budget on a call that cannot finish.
      assertDeadline(stage, entryKey, remaining);
      try {
        return { kind: "ok", value: await opts.attempt(cfg, stage) };
      } catch (e) {
        if (isBudgetError(e)) throw e;
        lastError = e;
        const failure = classifyFailure(e);
        if (failure === "unavailable") {
          blocked.add(entryKey);
          console.warn(
            `[generate] ${entryKey} is unavailable for this key; skipping it for the rest of this process. ` +
              "Enable it in the provider's project settings to use it again."
          );
          return { kind: "advance" };
        }
        // A credential problem is not something the rest of the chain survives.
        if (!shouldAdvance(failure)) return { kind: "fatal", error: e };
        // The model answered; the answer could not be parsed. Re-rolling the
        // identical prompt reproduces it, so hand it to the corrective call.
        if (failure === "content") {
          return { kind: "shape", issue: e instanceof Error ? e.message : String(e) };
        }
        if (tryNo === 0) {
          console.warn(
            `[generate] ${entryKey} failed (${failure}); retrying it once.`,
            (e as Error)?.message?.slice(0, 140)
          );
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    return { kind: "advance" };
  };

  for (let i = 0; i < opts.configs.length; i++) {
    const cfg = opts.configs[i];
    const entryKey = `${cfg.providerLabel}:${cfg.model}`;
    // Skip an entry already known to be blocked in this process. Re-dialing a
    // model the provider has refused costs a round trip on EVERY section of
    // EVERY exam: measured live 2026-10-11, three of five default entries were
    // blocked at project level and turned a 6s failure into a 199s one.
    if (blocked.has(entryKey)) continue;
    const remaining = remainingEntries(opts.configs, i);

    // ---- first attempt ------------------------------------------------------
    const first = await dial(cfg, opts.ctx, entryKey, remaining);
    if (first.kind === "fatal") return { ok: false, issues: [], error: first.error };
    if (first.kind === "advance") continue;

    // ---- the exam's own rules ----------------------------------------------
    let value: T | null = null;
    let issues: string[];
    if (first.kind === "shape") {
      console.warn(
        `[generate] ${entryKey} returned an unusable shape; asking it once more with the parser's reason.`,
        first.issue.slice(0, 140)
      );
      issues = [first.issue];
    } else {
      value = opts.normalise ? opts.normalise(first.value, opts.ctx) : first.value;
      const check = opts.validate(value);
      if (check.ok) return { ok: true, value, entry: entryKey, repaired: false };
      answered = true;
      issues = check.issues;
    }
    lastIssues = issues;

    // ---- one corrective call on the SAME entry ------------------------------
    const repairedCtx = repairCtx(opts.ctx, issues);
    const second = await dial(cfg, repairedCtx, entryKey, remaining);
    if (second.kind === "fatal") return { ok: false, issues: lastIssues, error: second.error };
    if (second.kind === "ok") {
      const repaired = opts.normalise ? opts.normalise(second.value, opts.ctx) : second.value;
      if (opts.validate(repaired).ok) {
        console.warn(`[generate] ${entryKey} was corrected on one retry: ${issues[0]}`);
        return { ok: true, value: repaired, entry: entryKey, repaired: true };
      }
    }
    console.warn(`[generate] ${entryKey} missed twice; trying the next chain entry.`);
    // The ORIGINAL issues are what the teacher should see if every entry fails:
    // a downstream symptom of a retry is not the real reason.

  }

  if (answered) return { ok: false, issues: lastIssues, error: lastError };
  return {
    ok: false,
    issues: [],
    error:
      lastError ??
      new ChainError(
        "unavailable",
        "chain",
        "",
        "Every entry in the chain was skipped: all are unavailable for this key."
      ),
  };
}

/**
 * Run one generation across the configured chain, advancing only when the next
 * entry could plausibly do better (see `shouldAdvance`).
 *
 * No validation here: the per-section routes present the reply to the teacher
 * as a proposal to edit, so "the first model that answers" is the contract.
 * `generateValidated` is the variant that also enforces the exam's rules.
 */
async function withChain<T>(
  run: (impl: GeneratorImpl) => Promise<T>,
  ctx?: Pick<GenContext, "runDeadlineMs">
): Promise<T> {
  const entries = chainFromEnv();
  if (entries.length === 0) {
    // No provider key at all: run offline rather than fail, but SAY so. The mock
    // writes generic test-double text, and a teacher seeing it has no way to
    // know the difference without a log line. This is the one case where mock
    // output is expected rather than a misconfiguration.
    console.warn(
      "[generate] No live provider configured (no NVIDIA_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY). " +
        "Using the offline mock provider: passages are template-generated and will read as generic."
    );
    return run(mock);
  }

  const { configs, skipped } = resolveChain(entries);
  if (configs.length === 0) {
    const detail = skipped.map((s) => `${s.entry.provider}: ${s.reason}`).join("; ");
    // Never silently mock: the key is there, so the operator believes they have
    // a model, and mock text would look like success while being a test double.
    throw new ChainError(
      "auth",
      "chain",
      entries.map((e) => e.model).join(","),
      `No usable provider in the configured chain (${detail || "chain was empty"}).`
    );
  }

  const result = await runChainLadder<T, Pick<GenContext, "runDeadlineMs">>({
    configs,
    ctx: ctx ?? {},
    attempt: async (cfg) => run(createCompatibleGenerators(() => cfg)),
    // Per-section generation has no rules to enforce here.
    validate: () => ({ ok: true, issues: [] }),
    blocked: blockedEntries,
  });

  if (result.ok) {
    lastServingEntry = result.entry;
    return result.value;
  }
  if (result.error) throw result.error;
  throw new ChainError(
    "validation",
    "chain",
    configs.map((c) => c.model).join(","),
    result.issues.join("; ") || "No provider produced a usable reply."
  );
}

/**
 * The same walk, but the exam's rules are enforced INSIDE it: a reply that fails
 * `validate` gets one corrective call on the same entry and then the next entry
 * gets a turn.
 *
 * This is the function that makes "generation does not fail because one model is
 * bad" true. Nothing in the full-exam flow may call the `generate*Candidates`
 * facade directly for a section it validates, or that section silently returns to
 * first-answer-wins.
 */
export async function generateValidated<T>(opts: {
  ctx: GenContext;
  run: (impl: GeneratorImpl, ctx: GenContext) => MaybePromise<T>;
  validate: (value: T) => { ok: boolean; issues: string[] };
  normalise?: (value: T, ctx: GenContext) => T;
}): Promise<LadderResult<T>> {
  const entries = chainFromEnv();
  if (entries.length === 0) {
    console.warn(
      "[generate] No live provider configured (no NVIDIA_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY). " +
        "Using the offline mock provider: passages are template-generated and will read as generic."
    );
    const raw = await opts.run(mock, opts.ctx);
    const value = opts.normalise ? opts.normalise(raw, opts.ctx) : raw;
    const check = opts.validate(value);
    return check.ok
      ? { ok: true, value, entry: "mock", repaired: false }
      : { ok: false, issues: check.issues };
  }

  const { configs, skipped } = resolveChain(entries);
  if (configs.length === 0) {
    const detail = skipped.map((s) => `${s.entry.provider}: ${s.reason}`).join("; ");
    throw new ChainError(
      "auth",
      "chain",
      entries.map((e) => e.model).join(","),
      `No usable provider in the configured chain (${detail || "chain was empty"}).`
    );
  }

  const result = await runChainLadder<T, GenContext>({
    configs,
    ctx: opts.ctx,
    attempt: async (cfg, ctx) => opts.run(createCompatibleGenerators(() => cfg), ctx),
    validate: opts.validate,
    normalise: opts.normalise,
    blocked: blockedEntries,
  });
  if (result.ok) lastServingEntry = result.entry;
  return result;
}


// Each generation returns candidates (a primary + N alternatives). The caller
// persists candidates so the replacement panel can offer them (PRD 15.3).

export async function generateTextCandidates(ctx: GenContext): Promise<GeneratedTextCandidate[]> {
  return withChain((i) => Promise.resolve(i.generateTextCandidates(ctx)), ctx);
}

export async function generatePartOneCandidates(ctx: GenContext): Promise<GeneratedTask[][]> {
  return withChain((i) => Promise.resolve(i.generatePartOneCandidates(ctx)), ctx);
}

export async function generateTextExplorationCandidates(ctx: GenContext): Promise<GeneratedTask[][]> {
  return withChain((i) => Promise.resolve(i.generateTextExplorationCandidates(ctx)), ctx);
}

export async function generateWritingCandidates(
  ctx: GenContext
): Promise<{ guided: GeneratedTopic; free: GeneratedTopic | null }[]> {
  return withChain((i) => Promise.resolve(i.generateWritingCandidates(ctx)), ctx);
}

export async function generateRewriteCandidates(
  ctx: GenContext,
  opts: { text: string; title?: string; target: "simpler" | "harder" }
): Promise<GeneratedTextCandidate[]> {
  return withChain((i) => Promise.resolve(i.generateRewriteCandidates(ctx, opts)), ctx);
}

/**
 * A sentence-rephrasing task must present the official stem pair: a complete
 * `A)` sentence and a `B)` stem ending in a dotted blank.
 *
 * Only the SHAPE is checked. Whether the stem really completes to the same
 * meaning is a semantic judgement and stays prompt-enforced (`REWRITE_RULE` in
 * `provider.ts`). But the observed failures were structural: a list with no A/B
 * at all, then a complete B that already printed the answer. A dotted B is
 * exactly computable and gives the bounded repair pass something actionable.
 */
function hasRewritePair(prompt: string): boolean {
  return (
    /^(?:Sentence\s+)?A\s*[).:]\s*\S/im.test(prompt) &&
    /^(?:Sentence\s+)?B\s*[).:]\s*\S.*(?:\.{3,}|…)\s*$/im.test(prompt)
  );
}

function countItems(task: GeneratedTask): number {
  if (task.table && task.table.rows.length > 0) return task.table.rows.length;
  const prompt = (task.prompt ?? "").trim();
  if (!prompt) return 0;
  const lines = prompt.split("\n").map((l) => l.trim()).filter(Boolean);
  // If prompt contains numbered lines (e.g. "1. ..."), count those; else count lines
  const numbered = lines.filter((l) => /^\d+[\.\)]/.test(l) || /^[A-Z][\.\)]/.test(l) || /^- /.test(l));
  return numbered.length > 0 ? numbered.length : lines.length;
}

export function validateCandidate(
  type: GenerationRequest["type"],
  payload: unknown,
  expectedMarks?: number,
  opts?: {
    singleTopic?: boolean;
    guide?: ReturnType<typeof resolveRules>["guide"] | null;
    length?: number;
    /**
     * The passage the tasks must be answerable from. When set, the
     * mechanically checkable linkage rules run: vocabulary/morphology targets
     * and referent targets have to occur in this text, and answer cells have to
     * be empty. See `generate/grounding.ts` for exactly what is and is not
     * guaranteed — semantic answerability is NOT checked.
     */
    groundingText?: string;
    /** Exact paragraph count the teacher asked for (default 3). */
    paragraphCount?: number;
    /** Passage topic, for per-paragraph topic anchoring. */
    topic?: string;
    /** Teacher keywords that can also anchor a paragraph. */
    teacherKeywords?: string | null;
  }
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (type === "TEXT") {
    const t = payload as GeneratedText;
    if (!t.title) issues.push("Generated text has no title.");
    if (!t.text) {
      issues.push("Generated text has no text.");
    } else {
      const words = countWords(t.text);
      if (words < 10) issues.push("Generated text is too short.");
      if (opts?.length) {
        const minWords = Math.floor(opts.length * 0.8);
        const maxWords = Math.ceil(opts.length * 1.2);
        if (words < minWords || words > maxWords) {
          issues.push(`Generated text word count ${words} is outside the expected range (${minWords}-${maxWords} for length ${opts.length}).`);
        }
      }
      // Paragraph count is a teacher choice (default 3), so it is checked
      // exactly rather than as a band: a 4-paragraph passage when the teacher
      // asked for 3 is a different artefact, not a near miss.
      if (opts?.paragraphCount) {
        const actual = splitPassageParagraphs(t.text).length;
        if (actual !== opts.paragraphCount) {
          issues.push(`Generated text has ${actual} paragraph(s) instead of ${opts.paragraphCount}.`);
        }
      }
      // A paragraph that is one short sentence is a fragment, not a paragraph:
      // the reported 2026-10-20 passage had 58 / 54 / 16 words and passed every
      // other check. The floor is computed from the actual text, so it also
      // covers a passage that is merely shorter than the teacher asked for.
      issues.push(...checkParagraphBalance(t.text));
      // Topicality and cohesion are ADVISORY. Two mechanical attempts were made
      // and both rejected good passages — including a coherent one held together
      // by pronoun chains, and passages that say "prehistoric" rather than the
      // curriculum label's "ancient". Logged, not enforced: see grounding.ts for
      // the measurements. Hard failures here mean only word count, paragraph
      // count and schema, which are all exactly computable.
      if (opts?.topic) {
        for (const advisory of checkTopicAnchoring(t.text, {
          topic: opts.topic,
          keywords: opts.teacherKeywords,
        })) {
          console.warn(`[generate] passage: ${advisory}`);
        }
      }
    }
  }
  if (type === "PART_ONE" || type === "TEXT_EXPLORATION") {
    const tasks = payload as GeneratedTask[];
    if (!tasks || tasks.length === 0) issues.push("No tasks were generated.");
    // An empty prompt passes every other check (0 marks contribution, no table
    // to inspect, no targets to ground) and renders as a blank question on the
    // paper. Observed live: the model answered the morphology task with a
    // {word, derivedForm} shape, so `prompt` came back "".
    tasks.forEach((t, i) => {
      // A TABULAR task legitimately carries no prose: its words live in the table
      // cells and the paper prints the instruction plus the chart (see
      // `tabularTaskPrintsItems`). Measured live 2026-10-26: morphology returned a
      // correct chart with an empty `prompt` and this check rejected the whole
      // section, on two different models. The instruction is required alongside
      // the chart, or the paper prints a bare table nobody can act on.
      const tabular = !!t.table && t.table.headers.length > 0 && t.table.rows.length > 0;
      const instruction = (t.instruction ?? "").trim();
      if (!(t.prompt ?? "").trim() && !(tabular && instruction)) {
        issues.push(`Task ${i + 1} has no content (empty prompt) and cannot be printed.`);
      }
    });
    const total = tasks.reduce((s, t) => s + t.marks, 0);
    const expected = expectedMarks ?? (type === "PART_ONE" ? 7 : 8);
    if (Math.abs(total - expected) > 0.05) {
      issues.push(`Section marks total ${total} instead of the required ${expected}.`);
    }
    // Exact wording + counts + tables from guide (Second Review: redesign AI-facing rules)
    const guide = opts?.guide ?? null;
    if (guide && tasks && tasks.length) {
      const rules = type === "PART_ONE" ? guide.partOne : guide.textExploration.skills;
      if (rules.length === tasks.length) {
        for (let i = 0; i < rules.length; i++) {
          const rule: any = rules[i];
          const task = tasks[i];
          // exactWording: primary tasks whose family matches the prescribed family must use exact wording verbatim
          if (rule.exactWording && task.family === rule.family && task.instruction !== rule.exactWording) {
            issues.push(`Task ${i + 1} instruction must use exact wording: "${rule.exactWording}"`);
          }
          // Tables: allowlisted by section and skill (user instruction
          // 2026-10-11). Both directions are enforced — a missing table where
          // one belongs, and a table where none does. The absent case is the
          // important one: it is what stops a future change from quietly
          // re-adding tables to tasks the official paper has none for.
          const wantsTable = taskHasTable(type, task);
          if (wantsTable) {
            if (!task.table || task.table.headers.length === 0 || task.table.rows.length === 0) {
              issues.push(`Task ${i + 1} requires a table but none was provided.`);
            }
          } else if (task.table) {
            issues.push(`Task ${i + 1} must not carry a table; only tabular Part Two tasks may.`);
          }
          // A word-bank task whose bank never arrived. Checked here rather than
          // at render time because a task can only be repaired from an issue
          // string: by the time the paper is built the run is already committed
          // and the teacher is looking at `List: ["brain's", ...]` printed as
          // question a). `extractWordBank` accepts every bank shape the model has
          // been seen to produce, so this is not a demand for one shape.
          if (rule.family === "GAP_FILL" && task.prompt) {
            const { words, rest } = extractWordBank(task.prompt);
            if (words.length === 0) {
              issues.push(
                `Task ${i + 1} refers to a list of words but no word list was provided; it must begin with one line like "List: [word1, word2, word3, word4]".`
              );
            } else {
              // The count is the contract (user instruction, 2026-10-19): the
              // list carries exactly one word per gap. Whether each word FITS its
              // gap in grammar and meaning is prompt-enforced only -- like
              // answerability, it is not mechanically checkable.
              const gaps = gapCount(rest);
              if (words.length !== gaps) {
                issues.push(
                  `Task ${i + 1} has ${gaps} gap(s) but ${words.length} word(s) in the list; the list must carry exactly one word per gap.`
                );
              }
              const seen = new Map<string, number>();
              for (const w of words) seen.set(w.toLowerCase(), (seen.get(w.toLowerCase()) ?? 0) + 1);
              const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([w]) => w);
              if (dupes.length > 0) {
                issues.push(`Task ${i + 1} repeats the word(s) ${dupes.join(", ")} in its word list; each word may be used only once.`);
              }
            }
            // The SHAPE, not just the count (teacher report 2026-10-20): a live
            // run emitted four blanks in a row in one sentence -- "how ___,
            // ___, ___, ___ shape our habits" -- which is a list of blanks, not
            // a gap-fill paragraph. Both properties are exactly computable;
            // whether each word fits its gap is not, and stays prompt-enforced.
            if (hasClusteredGaps(rest)) {
              issues.push(
                `Task ${i + 1} places gaps next to each other; each gap must sit inside its own phrase or sentence, with words between it and the next gap.`
              );
            }
            if (countSentences(rest) < 2) {
              issues.push(
                `Task ${i + 1} is a gap-fill paragraph: it must be at least two sentences, not one sentence holding every blank.`
              );
            }
          }
          // Sentence rephrasing: a complete `A)` sentence and a `B)` stem ending
          // in a dotted blank. Equivalence of meaning is prompt-enforced; the
          // shape is not.
          if (rule.family === "REWRITE" && task.prompt && !hasRewritePair(task.prompt)) {
            issues.push(
              `Task ${i + 1} is a sentence-rephrasing exercise: its prompt must present a complete sentence labelled "A)" and an incomplete sentence labelled "B)" that ends in a dotted blank (..........) for the student to complete.`
            );
          }
          // A "closest in meaning" vocabulary task must PRINT its items. Measured
          // live 2026-10-26 (1as): the model emitted `List: [exchange, ...]` plus
          // the instruction and no items at all — a question a student cannot
          // answer, and one that passed every other check. Numbered lines only:
          // `countItems` falls back to "every line", which a word bank satisfies.
          if ((rule.family ?? "").toUpperCase() === "MEANING") {
            const numbered = (task.prompt ?? "")
              .split("\n")
              .filter((line) => /^\s*\d+[.)]/.test(line)).length;
            if (numbered < 2) {
              issues.push(
                `Task ${i + 1} is a vocabulary task but prints ${numbered} numbered item(s); it needs at least 2 numbered definitions, each followed by a blank for the word the student finds in the passage.`
              );
            }
          }
          // itemCount where prescribed (Part One)
          if (rule.itemCount != null) {
            const actual = countItems(task);
            if (actual !== rule.itemCount) {
              issues.push(`Task ${i + 1} has ${actual} items (expected ${rule.itemCount}).`);
            }
          }
          // BAC Master Guide option-level constraints
          if (rule.constraints) {
            const c = rule.constraints;
            // Gap fill: exactly c.gapCount gaps. Measure only the task text --
            // the old regex also counted the `List: [...]` brackets as a gap, so
            // a 4-gap task with a 4-word bank read as 5.
            if (c.gapCount != null && task.prompt) {
              const gaps = gapCount(extractWordBank(task.prompt).rest);
              if (gaps !== c.gapCount) issues.push(`Task ${i + 1} gap count ${gaps} != ${c.gapCount}`);
            }
            // Dialogue: exactly c.utteranceCount missing utterances
            if (c.utteranceCount != null && task.prompt) {
              const blanks = (task.prompt.match(/A:|B:|___/g) || []).length;
              if (blanks < c.utteranceCount) issues.push(`Task ${i + 1} utterances below ${c.utteranceCount}`);
            }
            // Choice count (MCQ)
            if (c.choiceCount != null && task.prompt) {
              const choices = (task.prompt.match(/^[a-d]\)[^.]*$/gm) || []).length;
              if (choices !== c.choiceCount) issues.push(`Task ${i + 1} choice count ${choices} != ${c.choiceCount}`);
            }
            // Solved example row for morphology
            if (c.solvedExampleRow && task.prompt && !task.prompt.includes("Example")) {
              issues.push(`Task ${i + 1} requires solved example row.`);
            }
          }
          // placeholder hooks for future teacher inputs (no behavior change until supplied)
          // rule.taskSpecificRules / rule.teacherStandardRules are intentionally empty until teacher supplies values
        }
      }
    }

    // Linkage: every task must be answerable from the passage above it. Only
    // enforced when a passage is supplied, so existing per-part generation
    // keeps its current behaviour.
    if (opts?.groundingText) {
      for (const issue of checkTaskLinkage(tasks as unknown as LinkableTask[], opts.groundingText)) {
        issues.push(issue);
      }
    }
  }
  if (type === "WRITING") {
    const w = payload as { guided: GeneratedTopic; free: GeneratedTopic };
    if (opts?.singleTopic) {
      if (!w.guided) issues.push("The writing topic is required.");
    } else {
      if (!w.guided || !w.free) issues.push("Both writing topics are required.");
    }
  }
  return { ok: issues.length === 0, issues };
}
