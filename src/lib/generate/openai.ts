// OpenAI-compatible generation provider.
//
// Implements the same facade as the mock provider (see index.ts), but calls a
// chat-completions API with JSON output and validates every response before it
// can reach the teacher. Configure with:
//   AI_PROVIDER=openai
//   OPENAI_API_KEY=...
//   OPENAI_MODEL=gpt-4o-mini          (optional)
//   OPENAI_BASE_URL=https://.../v1   (optional; OpenAI-compatible endpoint)

import type { GeneratedTask, GeneratedTopic } from "@/types";
import type { GenContext } from "./index";

const SYSTEM = [
  "You are Exaai, an assistant that helps Algerian English teachers create structured English exams.",
  "You always reply with valid JSON only, matching the exact schema requested by the user. Never include extra text, markdown, or explanation.",
  "Follow the official exam structure for the given grade exactly. Respect word counts, mark allocations, and skill categories.",
  "Do not invent marks that conflict with the requested totals.",
].join(" ");

async function chat(prompt: object): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured (AI_PROVIDER=openai).");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.7,
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
  if (!content) throw new Error("AI provider returned no content.");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("AI provider returned invalid JSON.");
  }
}

function basePrompt(ctx: GenContext) {
  return {
    level: ctx.guide.level,
    grade: ctx.guide.grade,
    stream: ctx.stream,
    unit: ctx.unit,
    topic: ctx.topic,
    lengthWords: ctx.length,
    guideVersion: ctx.guide.version,
  };
}

export async function generateTextCandidates(ctx: GenContext): Promise<{ title: string; text: string }[]> {
  const json = await chat({
    ...basePrompt(ctx),
    kind: "TEXT",
    request:
      'Write an original, level-appropriate reading passage of about ' + ctx.length +
      ' words on the topic. Return exactly {"candidates":[{"title":"...","text":"..."}]} with 3 different candidates.',
  });
  const candidates = Array.isArray(json?.candidates) ? json.candidates : null;
  if (!candidates || candidates.length < 3) throw new Error("AI output missing text candidates.");
  return candidates
    .slice(0, 3)
    .map((c: any) => ({ title: String(c?.title ?? ""), text: String(c?.text ?? "") }));
}

export async function generatePartOneCandidates(ctx: GenContext): Promise<GeneratedTask[][]> {
  const families = ctx.guide.partOne.map((f) => ({ family: f.family, marks: f.marks, instruction: f.instruction }));
  const json = await chat({
    ...basePrompt(ctx),
    kind: "PART_ONE",
    marksTotal: ctx.guide.marks.partOne,
    request:
      'Generate reading-comprehension tasks on the passage topic with EXACTLY the families, marks and instructions below. ' +
      'Return {"sets":[{"tasks":[{"prompt","instruction","answer","marks","skill":"READING"}]}]} with 3 different sets of tasks.',
    families,
  });
  return parseTaskSets(json, 4, ctx.guide.marks.partOne);
}

export async function generateTextExplorationCandidates(ctx: GenContext): Promise<GeneratedTask[][]> {
  const skills = ctx.guide.textExploration.skills.map((s) => ({
    skill: s.skill,
    marks: s.marks,
    instruction: s.instruction,
  }));
  const json = await chat({
    ...basePrompt(ctx),
    kind: "TEXT_EXPLORATION",
    marksTotal: ctx.guide.marks.textExploration,
    request:
      'Generate the five language tasks (vocabulary, morphology, phonology, grammar, discourse) with EXACTLY the skills, marks and instructions below. ' +
      'Return {"sets":[{"tasks":[{"prompt","instruction","answer","marks","skill"}]}]} with 3 different sets of tasks.',
    skills,
  });
  return parseTaskSets(json, 5, ctx.guide.marks.textExploration);
}

function parseTaskSets(json: any, count: number, marksTotal: number): GeneratedTask[][] {
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
    }));
  });
}

export async function generateWritingCandidates(
  ctx: GenContext
): Promise<{ guided: GeneratedTopic; free: GeneratedTopic }[]> {
  const w = ctx.guide.writing;
  const json = await chat({
    ...basePrompt(ctx),
    kind: "WRITING",
    marksTotal: w.marks,
    request:
      'Write two writing topics: Topic 1 GUIDED (same broad theme as the text, a situation, instructions and slash-separated key words) and Topic 2 FREE (different situation, no key words). ' +
      'Return {"sets":[{"guided":{"kind":"GUIDED","title","situation","instruction","keywords","form","marks"},' +
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
