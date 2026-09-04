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

import { resolveRules } from "@/lib/guide";
import type { GenerationRequest } from "@/types";
import * as mock from "./mock";
import * as openai from "./openai";
import * as groq from "./groq";
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
  };
}

export function providerName(): string {
  return process.env.AI_PROVIDER || "mock";
}

function impl() {
  const p = providerName();
  if (p === "openai") return openai;
  if (p === "groq") return groq;
  return mock;
}

// Each generation returns candidates (a primary + N alternatives). The caller
// persists candidates so the replacement panel can offer them (PRD 15.3).

export async function generateTextCandidates(ctx: GenContext): Promise<GeneratedTextCandidate[]> {
  return impl().generateTextCandidates(ctx);
}

export async function generatePartOneCandidates(ctx: GenContext): Promise<GeneratedTask[][]> {
  return impl().generatePartOneCandidates(ctx);
}

export async function generateTextExplorationCandidates(ctx: GenContext): Promise<GeneratedTask[][]> {
  return impl().generateTextExplorationCandidates(ctx);
}

export async function generateWritingCandidates(
  ctx: GenContext
): Promise<{ guided: GeneratedTopic; free: GeneratedTopic | null }[]> {
  return impl().generateWritingCandidates(ctx);
}

export async function generateRewriteCandidates(
  ctx: GenContext,
  opts: { text: string; title?: string; target: "simpler" | "harder" }
): Promise<GeneratedTextCandidate[]> {
  return impl().generateRewriteCandidates(ctx, opts);
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
  opts?: { singleTopic?: boolean; guide?: ReturnType<typeof resolveRules>["guide"] | null }
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (type === "TEXT") {
    const t = payload as GeneratedText;
    if (!t.text || t.text.trim().length < 50) issues.push("Generated text is too short.");
    if (!t.title) issues.push("Generated text has no title.");
    // paragraphs: at least one blank line separation expected
    if (t.text && !t.text.includes("\n\n") && t.text.split("\n").length < 2) {
      // soft check: we do not fail here, but mock/provider already produce paragraphs via PARAGRAPH_NOTE
    }
  }
  if (type === "PART_ONE" || type === "TEXT_EXPLORATION") {
    const tasks = payload as GeneratedTask[];
    if (!tasks || tasks.length === 0) issues.push("No tasks were generated.");
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
          // tableRequired
          if (rule.tableRequired && (!task.table || task.table.headers.length === 0 || task.table.rows.length === 0)) {
            issues.push(`Task ${i + 1} requires a table but none was provided.`);
          }
          // itemCount where prescribed (Part One)
          if (rule.itemCount != null) {
            const actual = countItems(task);
            if (actual !== rule.itemCount) {
              issues.push(`Task ${i + 1} has ${actual} items (expected ${rule.itemCount}).`);
            }
          }
          // placeholder hooks for future teacher inputs (no behavior change until supplied)
          // rule.taskSpecificRules / rule.teacherStandardRules are intentionally empty until teacher supplies values
        }
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
