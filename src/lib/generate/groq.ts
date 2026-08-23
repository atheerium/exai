// Groq generation provider.
//
// Same OpenAI-compatible chat-completions API shape as openai.ts, but routed
// through Groq's hosted inference. Configure with:
//   AI_PROVIDER=groq
//   GROQ_API_KEY=...
//   GROQ_MODEL=llama-3.3-70b-versatile   (optional)
//   GROQ_BASE_URL=https://api.groq.com/openai/v1   (optional)

import type { GeneratedTopic } from "@/types";
import type { GenContext } from "./index";
import { chat, basePrompt, parseTaskSets, keywordNote, type ProviderConfig } from "./provider";

function config(): ProviderConfig {
  return {
    apiKey: process.env.GROQ_API_KEY,
    baseUrl: (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    providerLabel: "groq",
  };
}

export async function generateTextCandidates(ctx: GenContext): Promise<{ title: string; text: string }[]> {
  const json = await chat(config(), {
    ...basePrompt(ctx),
    kind: "TEXT",
    request:
      'Write an original, level-appropriate reading passage of about ' + ctx.length +
      ' words on the topic.' + keywordNote(ctx) +
      ' Return exactly {"candidates":[{"title":"...","text":"..."}]} with 3 different candidates.',
  });
  const candidates = Array.isArray(json?.candidates) ? json.candidates : null;
  if (!candidates || candidates.length < 3) throw new Error("AI output missing text candidates.");
  return candidates
    .slice(0, 3)
    .map((c: any) => ({ title: String(c?.title ?? ""), text: String(c?.text ?? "") }));
}

export async function generatePartOneCandidates(ctx: GenContext) {
  const families = ctx.guide.partOne.map((f) => ({ family: f.family, marks: f.marks, instruction: f.instruction }));
  const json = await chat(config(), {
    ...basePrompt(ctx),
    kind: "PART_ONE",
    marksTotal: ctx.guide.marks.partOne,
    request:
      'Generate reading-comprehension tasks on the passage topic with EXACTLY the families, marks and instructions below. ' +
      'Set 0 must use exactly these families. Sets 1 and 2 must use DIFFERENT task types for the same skills/marks ' +
      '(e.g. MCQ instead of open questions, YES/NO/Not-Given instead of True/False, matching instead of paragraph ID, ordering instead of title choice). ' +
      'Return {"sets":[{"tasks":[{"prompt","instruction","answer","marks","skill":"READING","family":"..."}]}]} with 3 different sets of tasks.',
    families,
  });
  return parseTaskSets(json, ctx.guide.partOne.length, ctx.guide.marks.partOne);
}

export async function generateTextExplorationCandidates(ctx: GenContext) {
  const skills = ctx.guide.textExploration.skills.map((s) => ({
    skill: s.skill,
    marks: s.marks,
    instruction: s.instruction,
  }));
  const json = await chat(config(), {
    ...basePrompt(ctx),
    kind: "TEXT_EXPLORATION",
    marksTotal: ctx.guide.marks.textExploration,
    request:
      'Generate the five language tasks (vocabulary, morphology, phonology, grammar, discourse) with EXACTLY the skills, marks and instructions below. ' +
      'Set 0 must use the standard families. Sets 1 and 2 must use DIFFERENT task types for the same skills/marks ' +
      '(e.g. synonym match instead of meaning, prefix/suffix instead of word family, stress pattern instead of sound class, choose correct form instead of rewrite, jumbled sentences instead of gap fill). ' +
      'Return {"sets":[{"tasks":[{"prompt","instruction","answer","marks","skill","family":"..."}]}]} with 3 different sets of tasks.',
    skills,
  });
  return parseTaskSets(json, 5, ctx.guide.marks.textExploration);
}

export async function generateRewriteCandidates(
  ctx: GenContext,
  opts: { text: string; title?: string; target: "simpler" | "harder" }
): Promise<{ title: string; text: string }[]> {
  const direction =
    opts.target === "simpler"
      ? "Rewrite the passage to be SIMPLER: shorter sentences, fewer subordinate clauses, plainer vocabulary, same meaning and content."
      : "Rewrite the passage to be HARDER: richer vocabulary, more complex sentence structures, still appropriate for the grade.";
  const json = await chat(config(), {
    ...basePrompt(ctx),
    kind: "REWRITE",
    target: opts.target,
    request:
      direction +
      ' Keep the same title and topic. Return exactly {"candidates":[{"title":"...","text":"..."}]} with 3 different rewritten versions of about the same length.',
  });
  const candidates = Array.isArray(json?.candidates) ? json.candidates : null;
  if (!candidates || candidates.length < 3) throw new Error("AI output missing rewrite candidates.");
  return candidates
    .slice(0, 3)
    .map((c: any) => ({
      title: String(c?.title ?? opts.title ?? ""),
      text: String(c?.text ?? ""),
    }));
}

export async function generateWritingCandidates(
  ctx: GenContext
): Promise<{ guided: GeneratedTopic; free: GeneratedTopic | null }[]> {
  const w = ctx.guide.writing;
  if (w.singleTopic) {
    const json = await chat(config(), {
      ...basePrompt(ctx),
      kind: "WRITING",
      marksTotal: w.marks,
      request:
        'Write ONE integrated-situation writing topic for the BEM middle-school exam: Topic 1 GUIDED (same broad theme as the text, a situation, instructions and slash-separated key words). This is the ONLY topic; there is no free topic.' + keywordNote(ctx) +
        ' Return {"sets":[{"guided":{"kind":"GUIDED","title","situation","instruction","keywords","form","marks"}}]} with 3 different sets.',
    });
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

  const json = await chat(config(), {
    ...basePrompt(ctx),
    kind: "WRITING",
    marksTotal: w.marks,
    request:
      'Write two writing topics: Topic 1 GUIDED (same broad theme as the text, a situation, instructions and slash-separated key words) and Topic 2 FREE (different situation, no key words).' + keywordNote(ctx) +
      ' Return {"sets":[{"guided":{"kind":"GUIDED","title","situation","instruction","keywords","form","marks"},' +
      '"free":{"kind":"FREE","title","situation","instruction","form","marks"}}]} with 3 different sets.',
  });
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
