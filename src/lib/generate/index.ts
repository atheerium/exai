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
import { checkTaskLinkage, checkTopicAnchoring, type LinkableTask } from "./grounding";
import { taskHasTable } from "@/lib/export/tables";
// The word-bank reader lives with the layout that prints it, so the shape the
// parser accepts and the shape the paper renders cannot drift. `export/paper.ts`
// imports only `assemble`, `referents` and `tables`, none of which import back
// into `generate/`, so this is not a cycle.
import { extractWordBank } from "@/lib/export/paper";
// `gapCount` measures the gap markers in the task text; `extractWordBank` strips
// the `List: [...]` line first, so the bracketed list is never mistaken for a gap.
import { gapCount } from "@/lib/export/gaps";
import type { GenerationRequest } from "@/types";
import * as mock from "./mock";
import { createCompatibleGenerators } from "./provider";
import {
  chainFromEnv,
  classifyFailure,
  resolveChain,
  shouldAdvance,
  ChainError,
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
   * previous reply, verbatim. Undefined on a first call.
   *
   * Re-rolling the same prompt at the same temperature tends to reproduce the
   * same mistake, so one corrective call is allowed. See `repairGeneration` in
   * full-exam.ts for why it is bounded at one attempt.
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
 * 120s is the point past which a browser fetch is likely to be abandoned or
 * timed out by an intermediary anyway, so spending longer buys nothing: the exam
 * is all-or-nothing and would be discarded either way. `AI_RUN_BUDGET_MS`
 * overrides it for a paid provider or a higher TPM quota; a malformed or
 * non-positive value falls back to the default rather than disabling the budget,
 * because an accidental `0` would read as "no limit" and silently restore the
 * hang.
 */
const DEFAULT_RUN_BUDGET_MS = 120_000;

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
 * Human-readable names for the stages of a full exam, used in the deadline
 * error. The teacher needs to know WHICH part gave up, not that "something
 * timed out" — the whole exam is all-or-nothing, so a bare timeout would read as
 * a total failure with no cause.
 */
function stageName(ctx?: Pick<GenContext, "runDeadlineMs" | "repairOf" | "groundingText">): string {
  if (ctx?.repairOf) return "a repair attempt";
  if (ctx?.groundingText) return "a question section";
  return "the passage";
}

/** Throws when the budget is gone, naming the stage and what was skipped. */
function assertDeadline(
  ctx: Pick<GenContext, "runDeadlineMs" | "repairOf" | "groundingText"> | undefined,
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
 * Run one generation across the configured chain, advancing only when the next
 * entry could plausibly do better (see `shouldAdvance`).
 *
 * Validation failures deliberately do NOT advance: a different model has no more
 * knowledge of this exam's guide rules, so retrying elsewhere just spends the
 * fallback quota to arrive at the same 422.
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
      "[generate] No live provider configured (no GROQ_API_KEY / OPENROUTER_API_KEY / NVIDIA_API_KEY). " +
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

  let lastError: unknown;
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    // Skip an entry already known to be blocked in this process. Re-dialing a
    // model the provider has refused costs a round trip on EVERY section of
    // EVERY exam: measured live 2026-10-11, three of five default entries were
    // blocked at project level and turned a 6s failure into a 199s one.
    const entryKey = `${cfg.providerLabel}:${cfg.model}`;
    if (blockedEntries.has(entryKey)) continue;

    // Checked BEFORE dialling, not after: the point is not to spend the
    // remaining budget on a call that cannot finish. Only the full-exam flow sets
    // a deadline, so per-section generation is unaffected.
    assertDeadline(ctx, entryKey, remainingEntries(configs, i));

    try {
      const out = await run(createCompatibleGenerators(() => cfg));
      lastServingEntry = entryKey;
      return out;
    } catch (e) {
      lastError = e;
      const failure = classifyFailure(e);
      if (failure === "unavailable") {
        blockedEntries.add(entryKey);
        console.warn(
          `[generate] ${entryKey} is unavailable for this key; skipping it for the rest of this process. ` +
            "Enable it in the provider's project settings to use it again."
        );
      }
      if (!shouldAdvance(failure) || i === configs.length - 1) throw e;
      console.warn(
        `[generate] ${entryKey} failed (${failure}); trying next chain entry.`,
        (e as Error)?.message?.slice(0, 140)
      );
    }
  }
  throw lastError;
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
        const actual = t.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).length;
        if (actual !== opts.paragraphCount) {
          issues.push(`Generated text has ${actual} paragraph(s) instead of ${opts.paragraphCount}.`);
        }
      }
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
      if (!(t.prompt ?? "").trim()) {
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
          }
          // Sentence rephrasing: a complete `A)` sentence and a `B)` stem ending
          // in a dotted blank. Equivalence of meaning is prompt-enforced; the
          // shape is not.
          if (rule.family === "REWRITE" && task.prompt && !hasRewritePair(task.prompt)) {
            issues.push(
              `Task ${i + 1} is a sentence-rephrasing exercise: its prompt must present a complete sentence labelled "A)" and an incomplete sentence labelled "B)" that ends in a dotted blank (..........) for the student to complete.`
            );
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
