// Shared helpers for OpenAI-compatible generation providers (OpenAI, Groq).
//
// Both providers use the same chat-completions API shape; only the env vars
// and default base URL differ. This module centralises the chat helper,
// prompt builder, and response parser so each provider file stays thin.

import type { GeneratedSource, GeneratedTask, GeneratedTextCandidate, GeneratedTopic } from "@/types";
import type { GenContext } from "./index";

const SYSTEM = [
  "You are Exaai, an assistant that helps Algerian English teachers create structured English exams.",
  "You always reply with valid JSON only, matching the exact schema requested by the user. Never include extra text, markdown, or explanation.",
  "Follow the official exam structure for the given grade exactly. Respect word counts, mark allocations, and skill categories.",
  "Do not invent marks that conflict with the requested totals.",
].join(" ");

export interface ProviderConfig {
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  providerLabel: string;
  /**
   * Cap on reasoning tokens, for providers that expose a reasoning model.
   *
   * This is not an optimisation, it is a correctness requirement. Measured on
   * Groq 2026-10-11 with `openai/gpt-oss-120b` and `response_format:
   * json_object`: without it the model spends the entire `max_tokens` budget on
   * reasoning and returns an EMPTY content string, which Groq reports as
   * "Failed to validate JSON" — 0/6 requests succeeded. With `low` it returned
   * valid JSON 6/6, using ~25 reasoning tokens. The same model without
   * `response_format` consumed 398 reasoning tokens for a 122-token answer.
   *
   * Providers that reject the field must not send it — see `supportsReasoning`.
   */
  reasoningEffort?: "low" | "medium" | "high";
  /** Generous by default: a task prompt asks for 3 candidate sets. */
  maxTokens?: number;
}

export async function chat(
  config: ProviderConfig,
  prompt: object,
  opts: { temperature?: number } = {}
): Promise<any> {
  if (!config.apiKey) throw new Error(`${config.providerLabel.toUpperCase()}_API_KEY is not configured (AI_PROVIDER=${config.providerLabel}).`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  // `fetch` is inside the try so a transport-level rejection (DNS, refused
  // connection, the abort itself) still reaches `finally` and clears the timer.
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        // Prose wants variance; structured tasks want determinism. The callers
        // pass the value explicitly rather than baking one constant, because a
        // task that must produce `a) b) c)` on every retry should not sample.
        temperature: opts.temperature ?? 0.7,
        max_tokens: config.maxTokens ?? 4000,
        // Only sent when the provider config asks for it; several OpenAI-compatible
        // endpoints reject the unknown field outright.
        ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI provider error ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      // A reasoning model that exhausted max_tokens on reasoning returns an empty
      // content rather than an error. Say so, because the fix (raise
      // max_tokens, or set reasoning_effort) is completely different from a
      // provider outage.
      const reasoning = data?.usage?.completion_tokens_details?.reasoning_tokens;
      throw new Error(
        reasoning
          ? `AI provider returned no content (model used ${reasoning} reasoning tokens; raise max_tokens or set reasoning_effort).`
          : "AI provider returned no content."
      );
    }
    return parseLooseJson(content);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse a model reply that is *usually* pure JSON.
 *
 * Measured on the free tier, `response_format: json_object` is honoured by Groq
 * and NVIDIA but not reliably elsewhere: Gemma on OpenRouter wraps its object in
 * a ```json fence even with the header set, and some models prepend prose. Those
 * replies are semantically fine, so we salvage the JSON rather than failing a
 * whole exam — while still failing loudly when there is genuinely no JSON in
 * there.
 */
export function parseLooseJson(content: string): any {
  const raw = content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // fall through to the salvage paths
  }

  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    // fall through
  }

  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(candidate.slice(first, last + 1));
    } catch {
      // fall through to the error below
    }
  }

  throw new Error("AI provider returned invalid JSON.");
}

/** Temperatures by section: prose varies, structure must not. */
export const TEMPERATURE = {
  /** Passage prose: variety between candidates is desirable. */
  prose: 0.7,
  /** Tasks, topics, tables, labels: the same input must yield the same shape. */
  structured: 0.2,
} as const;

/**
 * One-topic-across-all-paragraphs instruction for the passage (user report,
 * 2026-10-11: a generated passage opened on advertising, moved to ancient
 * monuments, then music, then archaeologists — every paragraph a different
 * subject).
 *
 * This is a prompt instruction; the *mechanical* half of the guarantee is
 * `checkTopicAnchoring` in grounding.ts, which rejects any paragraph that does
 * not mention the topic or a teacher keyword. Prompt alone is not trusted.
 */
function coherenceNote(ctx: GenContext): string {
  const paragraphs = ctx.paragraphCount ?? 3;
  return (
    ` Write EXACTLY ${paragraphs} paragraph${paragraphs === 1 ? "" : "s"}, separated by a blank line. ` +
    `Every paragraph must stay on the topic "${ctx.topic}" or one named aspect of it: ` +
    "do NOT switch to a different subject partway through, and do not introduce facts from an unrelated field. " +
    "Open by introducing the topic, develop one aspect per paragraph, and close without introducing new facts. " +
    (ctx.teacherKeywords
      ? `Each paragraph must also relate to at least one of these teacher keywords: ${ctx.teacherKeywords}. `
      : "")
  );
}

export function basePrompt(ctx: GenContext): Record<string, unknown> {
  const base: Record<string, unknown> = {
    level: ctx.guide.level,
    grade: ctx.guide.grade,
    stream: ctx.stream,
    unit: ctx.unit,
    topic: ctx.topic,
    lengthWords: ctx.length,
    language: ctx.language,
    guideVersion: ctx.guide.version,
  };
  if (ctx.teacherKeywords) base.teacherKeywords = ctx.teacherKeywords;
  if (ctx.difficulty) base.difficulty = ctx.difficulty;
  return base;
}

export /**
 * The passage-grounding clause appended to task prompts.
 *
 * Only emitted when `ctx.groundingText` exists, i.e. when the caller has a real
 * passage in hand. Without one the model is left free to use theme-level
 * material, which is the pre-existing (per-part) behaviour.
 *
 * These are instructions, not guarantees. `generate/grounding.ts` mechanically
 * enforces the lexically checkable subset afterwards; the requirement that a
 * task is *semantically* answerable rests on the model obeying this text.
 *
 * NOTE: the instruction is worthless on its own. The passage must also be in
 * the payload (see `passageField`) — the clause names it by field so the two
 * cannot drift apart silently again.
 */
function groundingRule(ctx: GenContext): string {
  if (!ctx.groundingText) return "";
  return (
    'Every task MUST be answerable from the "passage" field alone: ' +
    "vocabulary and morphology targets must appear verbatim in it, referent targets (they, it, this, the former) must occur in it, " +
    "and comprehension items must concern facts the passage actually states rather than general knowledge about the topic. " +
    "Do NOT invent words or events that the passage does not contain. "
  );
}

/**
 * The passage itself, as a payload field, when one exists.
 *
 * Sending the rule without this is the bug this helper exists to prevent: the
 * model would be told to ground on a passage it cannot see, then its output
 * would fail `checkTaskLinkage` and the all-or-nothing full-exam run would
 * return 422 with nothing written.
 */
function passageField(ctx: GenContext): Record<string, unknown> {
  return ctx.groundingText ? { passage: ctx.groundingText } : {};
}

/**
 * Format rules the model kept breaking (user instruction, 2026-10-11). Kept in
 * the prompt as well as in code because the prompt is what the model actually
 * reads; `export/tables.ts` is the enforcing authority, so a model that ignores
 * this still fails validation rather than printing a stray chart.
 */
const PART_ONE_TABLE_RULE =
  " Part One tasks NEVER carry a table, even when the rules above say tableRequired: " +
  "print the sentences and let the answer key live on a separate sheet. ";

/** Tables are allowlisted: morphology and phonology classification only. */
const PART_TWO_TABLE_RULE =
  " Only morphology (roots, prefixes, suffixes) and phonology classification tasks carry a table; " +
  "vocabulary matching, discourse gap-fill and grammar tasks must NOT have one. ";

/** Official choice labels are lowercase letters with a closing parenthesis. */
const CHOICE_LABEL_RULE =
  ' Multiple-choice options are labelled with a lowercase letter and a closing parenthesis -- "a)" "b)" "c)" "d)" -- one per line, never "a." or "A.". ';

const PARAGRAPH_NOTE =
  " Write the passage as 3-5 coherent paragraphs separated by blank lines (\\n\\n).";

export const SOURCE_NOTE =
  ' A source citation is obligatory: include a "source" object with title, author, publication, url and adaptationNote for every candidate. If the passage is fully original, say so in adaptationNote and leave url null.';

export function difficultyNote(ctx: GenContext): string {
  if (!ctx.difficulty) return "";
  return ` Target difficulty: ${ctx.difficulty}. Adjust vocabulary difficulty and grammar-structure complexity accordingly, while staying appropriate for the grade.`;
}

export function parseSource(raw: any): GeneratedSource | null {
  if (!raw || typeof raw !== "object") return null;
  const title = raw.title ? String(raw.title) : "";
  const adaptationNote = raw.adaptationNote ? String(raw.adaptationNote) : "";
  if (!title && !adaptationNote) return null;
  return {
    title: title || "Source",
    author: raw.author ? String(raw.author) : null,
    publication: raw.publication ? String(raw.publication) : null,
    url: raw.url ? String(raw.url) : null,
    adaptationNote: adaptationNote || "Adapted for classroom use.",
    isExternal: !!(raw.url || raw.publication || raw.author),
  };
}

export function parseTaskSets(json: any, count: number, marksTotal: number): GeneratedTask[][] {
  const sets = Array.isArray(json?.sets) ? json.sets : null;
  if (!sets || sets.length < 3) throw new Error("AI output missing task sets.");
  return sets.slice(0, 3).map((set: any) => {
    const tasks = Array.isArray(set?.tasks) ? set.tasks : [];
    if (tasks.length !== count) throw new Error(`AI output has ${tasks.length} tasks (expected ${count}).`);
    const total = tasks.reduce((s: number, t: any) => s + Number(t?.marks ?? 0), 0);
    if (Math.abs(total - marksTotal) > 0.05) throw new Error(`AI task marks total ${total} (expected ${marksTotal}).`);
    return tasks.map((t: any) => ({
      prompt: String(t?.prompt ?? ""),
      instruction: String(t?.instruction ?? ""),
      answer: t?.answer ? String(t.answer) : undefined,
      marks: Number(t?.marks ?? 0),
      skill: t?.skill ? String(t.skill) : undefined,
      family: t?.family ? String(t.family) : undefined,
      table: t?.table && typeof t.table === "object" && Array.isArray(t.table.headers) && Array.isArray(t.table.rows)
        ? { headers: t.table.headers.map((h: any) => String(h)), rows: t.table.rows.map((r: any) => Array.isArray(r) ? r.map((c: any) => String(c)) : [String(r)]) }
        : undefined,
    }));
  });
}

export function keywordNote(ctx: GenContext): string {
  return ctx.teacherKeywords ? ` Incorporate these teacher keywords where appropriate: ${ctx.teacherKeywords}.` : "";
}

/**
 * Build the five generation functions shared by every OpenAI-compatible
 * provider. OpenAI and Groq speak the same chat-completions dialect and differ
 * only in credentials/base URL/model, so the prompts and response parsing live
 * here once instead of being copied per provider file (which is how they drifted
 * before). Provider modules stay a `config()` plus five re-exports.
 *
 * `config` is called per request, not once, so runtime env changes (and the
 * missing-key error path) still behave as if the provider read the environment
 * each time.
 */
export function createCompatibleGenerators(config: () => ProviderConfig) {
  async function generateTextCandidates(ctx: GenContext): Promise<GeneratedTextCandidate[]> {
    const json = await chat(
      config(),
      {
        ...basePrompt(ctx),
        kind: "TEXT",
        paragraphCount: ctx.paragraphCount,
        request:
          'Write an original, level-appropriate reading passage of about ' + ctx.length +
          ' words on the topic "' + ctx.topic + '".' +
          keywordNote(ctx) + difficultyNote(ctx) + PARAGRAPH_NOTE + coherenceNote(ctx) + SOURCE_NOTE +
          ' Return exactly {"candidates":[{"title":"...","text":"...","source":{"title":"...","author":"...","publication":"...","url":"...","adaptationNote":"..."}}]} with 3 different candidates.',
      },
      { temperature: TEMPERATURE.prose }
    );
    const candidates = Array.isArray(json?.candidates) ? json.candidates : null;
    if (!candidates || candidates.length < 3) throw new Error("AI output missing text candidates.");
    return candidates
      .slice(0, 3)
      .map((c: any) => ({ title: String(c?.title ?? ""), text: String(c?.text ?? ""), source: parseSource(c?.source) }));
  }

  async function generatePartOneCandidates(ctx: GenContext) {
    const families = ctx.guide.partOne.map((f) => ({
      family: f.family,
      marks: f.marks,
      instruction: f.exactWording ?? f.instruction,
      exactWording: f.exactWording,
      tableRequired: f.tableRequired,
      itemCount: f.itemCount,
      constraints: f.constraints,
    }));
    const json = await chat(config(), {
      ...basePrompt(ctx),
      ...passageField(ctx),
      kind: "PART_ONE",
      marksTotal: ctx.guide.marks.partOne,
      request:
        'Generate reading-comprehension tasks on the passage topic with EXACTLY the families, marks, instructions, item counts, and table requirements below. ' +
        groundingRule(ctx) +
        'Set 0 must use exactly these families. Sets 1 and 2 must use DIFFERENT task types for the same skills/marks ' +
        '(e.g. MCQ instead of open questions, YES/NO/Not-Given instead of True/False, matching instead of paragraph ID, ordering instead of title choice). ' +
        'For tasks with tableRequired=true, include a "table" field with headers and rows. ' +
        PART_ONE_TABLE_RULE +
        'The exam paper carries no answers: every table cell the student must fill in must be an EMPTY string, and the correct value goes only in the "answer" field. ' +
        CHOICE_LABEL_RULE +
        'Return {"sets":[{"tasks":[{"prompt","instruction","answer","marks","skill":"READING","family":"...","table":{"headers":[],"rows":[[]]}}]}]} with 3 different sets of tasks.',
      families,
      },
      { temperature: TEMPERATURE.structured }
    );
    return parseTaskSets(json, ctx.guide.partOne.length, ctx.guide.marks.partOne);
  }

  async function generateTextExplorationCandidates(ctx: GenContext) {
    const skills = ctx.guide.textExploration.skills.map((s) => ({
      skill: s.skill,
      marks: s.marks,
      instruction: s.instruction,
      tableRequired: s.tableRequired,
    }));
    const json = await chat(
      config(),
      {
        ...basePrompt(ctx),
        ...passageField(ctx),
        kind: "TEXT_EXPLORATION",
      marksTotal: ctx.guide.marks.textExploration,
      request:
        'Generate the five language tasks (vocabulary, morphology, phonology, grammar, discourse) with EXACTLY the skills, marks, instructions, and table requirements below. ' +
        'Stay appropriate to level, skill and Ministry requirements. ' +
        groundingRule(ctx) +
        'Set 0 must use the standard families. Sets 1 and 2 must use DIFFERENT task types for the same skills/marks ' +
        '(e.g. synonym match instead of meaning, prefix/suffix instead of word family, stress pattern instead of sound class, choose correct form instead of rewrite, jumbled sentences instead of gap fill). ' +
        'For tasks with tableRequired=true, include a "table" field with headers and rows. ' +
        PART_TWO_TABLE_RULE +
        'The exam paper carries no answers: every table cell the student must fill in must be an EMPTY string, and the correct value goes only in the "answer" field. ' +
        CHOICE_LABEL_RULE +
        'Return {"sets":[{"tasks":[{"prompt","instruction","answer","marks","skill","family":"...","table":{"headers":[],"rows":[[]]}}]}]} with 3 different sets of tasks.',
      skills,
        },
        { temperature: TEMPERATURE.structured }
      );
    return parseTaskSets(json, 5, ctx.guide.marks.textExploration);
  }

  async function generateRewriteCandidates(
    ctx: GenContext,
    opts: { text: string; title?: string; target: "simpler" | "harder" }
  ): Promise<GeneratedTextCandidate[]> {
    const direction =
      opts.target === "simpler"
        ? "Rewrite the passage to be SIMPLER: shorter sentences, fewer subordinate clauses, plainer vocabulary, same meaning and content."
        : "Rewrite the passage to be HARDER: richer vocabulary, more complex sentence structures, still appropriate for the grade.";
    const json = await chat(
      config(),
      {
        ...basePrompt(ctx),
        kind: "REWRITE",
        target: opts.target,
        paragraphCount: ctx.paragraphCount,
        request:
          direction + PARAGRAPH_NOTE +
          ` Keep the same number of paragraphs (${ctx.paragraphCount ?? 3}) and the same topic.` + coherenceNote(ctx) +
          ' Keep the same title and topic. Return exactly {"candidates":[{"title":"...","text":"..."}]} with 3 different rewritten versions of about the same length.',
      },
      { temperature: TEMPERATURE.prose }
    );
    const candidates = Array.isArray(json?.candidates) ? json.candidates : null;
    if (!candidates || candidates.length < 3) throw new Error("AI output missing rewrite candidates.");
    return candidates
      .slice(0, 3)
      .map((c: any) => ({
        title: String(c?.title ?? opts.title ?? ""),
        text: String(c?.text ?? ""),
      }));
  }

  async function generateWritingCandidates(
    ctx: GenContext
  ): Promise<{ guided: GeneratedTopic; free: GeneratedTopic | null }[]> {
    const w = ctx.guide.writing;
    if (w.singleTopic) {
      const json = await chat(
        config(),
        {
          ...basePrompt(ctx),
          kind: "WRITING",
          marksTotal: w.marks,
          request:
            'Write ONE integrated-situation writing topic for the BEM middle-school exam: Topic 1 GUIDED (same broad theme as the text, a situation, instructions and slash-separated key words). This is the ONLY topic; there is no free topic.' + keywordNote(ctx) +
            ' Return {"sets":[{"guided":{"kind":"GUIDED","title","situation","instruction","keywords","form","marks"}}]} with 3 different sets.',
        },
        { temperature: TEMPERATURE.structured }
      );
      const sets = Array.isArray(json?.sets) ? json.sets : null;
      if (!sets || sets.length < 3) throw new Error("AI output missing writing sets.");
      return sets.slice(0, 3).map((set: any) => {
        const g = set?.guided;
        if (!g) throw new Error("AI output missing guided topic.");
        return {
          guided: {
            kind: "GUIDED",
            title: String(g.title ?? "Topic 1"),
            situation: String(g.situation ?? ""),
            instruction: String(g.instruction ?? w.instruction ?? w.guidedInstruction),
            keywords: g.keywords ? String(g.keywords) : undefined,
            form: String(g.form ?? w.forms[0]),
            marks: Number(g.marks ?? w.marks),
          },
          free: null,
        };
      });
    }

    const json = await chat(
      config(),
      {
        ...basePrompt(ctx),
        kind: "WRITING",
        marksTotal: w.marks,
        request:
          'Write two writing topics: Topic 1 GUIDED (same broad theme as the text, a situation, instructions and slash-separated key words) and Topic 2 FREE (different situation, no key words).' + keywordNote(ctx) +
          ' Return {"sets":[{"guided":{"kind":"GUIDED","title","situation","instruction","keywords","form","marks"},' +
          '"free":{"kind":"FREE","title","situation","instruction","form","marks"}}]} with 3 different sets.',
      },
      { temperature: TEMPERATURE.structured }
    );
    const sets = Array.isArray(json?.sets) ? json.sets : null;
    if (!sets || sets.length < 3) throw new Error("AI output missing writing sets.");
    return sets.slice(0, 3).map((set: any) => {
      const g = set?.guided;
      const f = set?.free;
      if (!g || !f) throw new Error("AI output missing guided/free topics.");
      return {
        guided: {
          kind: "GUIDED",
          title: String(g.title ?? "Topic 1"),
          situation: String(g.situation ?? ""),
          instruction: String(g.instruction ?? w.guidedInstruction),
          keywords: g.keywords ? String(g.keywords) : undefined,
          form: String(g.form ?? w.forms[0]),
          marks: Number(g.marks ?? w.marks),
        },
        free: {
          kind: "FREE",
          title: String(f.title ?? "Topic 2"),
          situation: String(f.situation ?? ""),
          instruction: String(f.instruction ?? w.freeInstruction),
          form: String(f.form ?? "a paragraph"),
          marks: Number(f.marks ?? w.marks),
        },
      };
    });
  }

  return {
    generateTextCandidates,
    generatePartOneCandidates,
    generateTextExplorationCandidates,
    generateRewriteCandidates,
    generateWritingCandidates,
  };
}
