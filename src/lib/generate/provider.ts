// Shared helpers for OpenAI-compatible generation providers (OpenAI, Groq).
//
// Both providers use the same chat-completions API shape; only the env vars
// and default base URL differ. This module centralises the chat helper,
// prompt builder, and response parser so each provider file stays thin.

import type { GeneratedSource, GeneratedTask } from "@/types";
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
}

export async function chat(config: ProviderConfig, prompt: object): Promise<any> {
  if (!config.apiKey) throw new Error(`${config.providerLabel.toUpperCase()}_API_KEY is not configured (AI_PROVIDER=${config.providerLabel}).`);

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
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

export const PARAGRAPH_NOTE =
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
