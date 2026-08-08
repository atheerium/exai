// Generation service facade (PRD sections 16, 17).
//
// The UI/API layer talks to this facade. Providers are pluggable: the default
// "mock" provider is deterministic and needs no credentials; a real LLM
// provider can be enabled with AI_PROVIDER env var. Validation happens before
// candidates are presented to the teacher (structural, numeric, curriculum).

import { resolveRules } from "@/lib/guide";
import type { GenerationRequest } from "@/types";
import * as mock from "./mock";
import type { GeneratedTask, GeneratedText, GeneratedTopic } from "@/types";

export type { GeneratedTask, GeneratedText, GeneratedTopic };

export interface GenContext {
  grade: string;
  unit: string;
  topic: string;
  length: number;
  guide: ReturnType<typeof resolveRules>["guide"];
  themeKey: string;
  seed: string;
}

export function buildContext(input: {
  level: string;
  grade: string;
  stream?: string | null;
  length: number;
  unit: string;
  topic: string;
  examId: string;
}): GenContext {
  const rules = resolveRules({
    level: input.level,
    grade: input.grade,
    stream: input.stream,
    length: input.length,
    unit: input.unit,
    topic: input.topic,
  });
  return {
    grade: rules.grade,
    unit: rules.unitLabel,
    topic: rules.topic,
    length: rules.length,
    guide: rules.guide,
    themeKey: rules.themeKey,
    seed: `${input.examId}:${rules.grade}:${input.unit}:${input.topic}`,
  };
}

export function providerName(): string {
  return process.env.AI_PROVIDER || "mock";
}

// Each generation returns candidates (a primary + N alternatives). The caller
// persists candidates so the replacement panel can offer them (PRD 15.3).

export function generateTextCandidates(ctx: GenContext): { title: string; text: string }[] {
  const primary = mock.generateText(ctx, 0);
  return [primary, ...mock.textAlternatives(ctx, 2)];
}

export function generatePartOneCandidates(ctx: GenContext): GeneratedTask[][] {
  return [mock.generatePartOne(ctx, 0), ...mock.taskAlternatives(ctx, "PART_ONE", 2)];
}

export function generateTextExplorationCandidates(ctx: GenContext): GeneratedTask[][] {
  return [mock.generateTextExploration(ctx, 0), ...mock.taskAlternatives(ctx, "TEXT_EXPLORATION", 2)];
}

export function generateWritingCandidates(ctx: GenContext): { guided: GeneratedTopic; free: GeneratedTopic }[] {
  return [mock.generateWriting(ctx, 0), ...mock.topicAlternatives(ctx, 2)];
}

export function validateCandidate(type: GenerationRequest["type"], payload: unknown): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (type === "TEXT") {
    const t = payload as GeneratedText;
    if (!t.text || t.text.trim().length < 50) issues.push("Generated text is too short.");
    if (!t.title) issues.push("Generated text has no title.");
  }
  if (type === "PART_ONE" || type === "TEXT_EXPLORATION") {
    const tasks = payload as GeneratedTask[];
    if (!tasks || tasks.length === 0) issues.push("No tasks were generated.");
    const total = tasks.reduce((s, t) => s + t.marks, 0);
    const expected = type === "PART_ONE" ? 7 : 8;
    if (Math.abs(total - expected) > 0.05) {
      issues.push(`Section marks total ${total} instead of the required ${expected}.`);
    }
  }
  if (type === "WRITING") {
    const w = payload as { guided: GeneratedTopic; free: GeneratedTopic };
    if (!w.guided || !w.free) issues.push("Both writing topics are required.");
  }
  return { ok: issues.length === 0, issues };
}
