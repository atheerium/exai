// Serialization between Prisma records and the DTO shapes the UI consumes.

import { prisma, type DbClient } from "@/lib/db";
import type { ExamDto, SectionDto, SourceDto, TaskDto, TopicDto, ExamConfigDto } from "@/types";
import { DEFAULT_PARAGRAPH_COUNT } from "@/lib/generate";

/** Schema for the JSON stored in ExamSection.content */
interface SectionContent {
  text?: string | null;
  title?: string | null;
  previousText?: string | null;
  previousTitle?: string | null;
  /** Teacher opted in to printing the passage title (user rule 2026-10-11). */
  showTitle?: boolean;
  candidates?: unknown[];
  sourceIndex?: number | null;
}

/**
 * Safely parse JSON string, returning defaultValue on parse error.
 * Prevents crashes from corrupted data in the database.
 */
export function safeParse<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json);
  } catch {
    // Log in development, but don't expose error details in production
    if (process.env.NODE_ENV !== "production") {
      console.warn("Failed to parse JSON:", json.substring(0, 100) + (json.length > 100 ? "..." : ""));
    }
    return defaultValue;
  }
}

function parseTasks(tasks: {
  id: string;
  skill: string | null;
  prompt: string;
  instruction: string | null;
  answer: string | null;
  marks: number;
  order: number;
  manualEdited: boolean;
  family: string | null;
  tableData: string | null;
  candidates: string | null;
}[]): TaskDto[] {
  return tasks
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      skill: t.skill,
      prompt: t.prompt,
      instruction: t.instruction,
      answer: t.answer,
      marks: t.marks,
      order: t.order,
      manualEdited: t.manualEdited,
      family: t.family ?? null,
      table: safeParse(t.tableData, null),
      candidates: safeParse(t.candidates, []),
    }));
}

function parseTopics(topics: {
  id: string;
  kind: string;
  title: string | null;
  situation: string | null;
  instruction: string | null;
  keywords: string | null;
  form: string | null;
  marks: number;
  order: number;
  manualEdited: boolean;
  candidates: string | null;
}[]): TopicDto[] {
  return topics
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      id: t.id,
      kind: t.kind as "GUIDED" | "FREE",
      title: t.title,
      situation: t.situation,
      instruction: t.instruction,
      keywords: t.keywords,
      form: t.form,
      marks: t.marks,
      order: t.order,
      manualEdited: t.manualEdited,
      candidates: safeParse(t.candidates, []),
    }));
}

export async function examToDto(exam: any): Promise<ExamDto> {
  const sections: SectionDto[] = (exam.sections ?? []).map((s: any) => {
    const content = safeParse<SectionContent>(s.content, {});
    return {
      id: s.id,
      type: s.type,
      heading: s.heading,
      order: s.order,
      text: content.text ?? null,
      textTitle: content.title ?? null,
      showTitle: content.showTitle === true,
      previousText: content.previousText ?? null,
      previousTitle: content.previousTitle ?? null,
      candidates: content.candidates ?? [],
      sourceIndex: content.sourceIndex ?? null,
      tasks: parseTasks(s.tasks ?? []),
      topics: parseTopics(s.topics ?? []),
    };
  });

  const sources: SourceDto[] = (exam.sources ?? []).map((src: any) => ({
    title: src.title,
    author: src.author,
    publication: src.publication,
    url: src.url,
    accessedAt: src.accessedAt,
    adaptationNote: src.adaptationNote,
    isExternal: src.isExternal,
  }));

  const config: ExamConfigDto | null = exam.config
    ? {
        id: exam.config.id,
        level: exam.config.level,
        grade: exam.config.grade,
        stream: exam.config.stream,
        length: exam.config.length,
      paragraphCount: exam.config.paragraphCount ?? DEFAULT_PARAGRAPH_COUNT,
        unit: exam.config.unit,
        topic: exam.config.topic,
        customTopic: exam.config.customTopic,
        guideVersion: exam.config.guideVersion ?? null,
        language: exam.config.language ?? "en",
        teacherKeywords: exam.config.teacherKeywords ?? null,
        difficulty: exam.config.difficulty ?? null,
      }
    : null;

  return {
    id: exam.id,
    title: exam.title,
    status: exam.status,
    config,
    sections,
    sources,
    lastOpenedAt: exam.lastOpenedAt.toISOString(),
    updatedAt: exam.updatedAt.toISOString(),
    createdAt: exam.createdAt.toISOString(),
  };
}

export async function loadExamDto(examId: string, userId: string, client?: DbClient): Promise<ExamDto> {
  const db = client ?? prisma;
  const exam = await db.exam.findFirst({
    where: { id: examId, userId },
    include: {
      config: true,
      sections: { include: { tasks: true, topics: true }, orderBy: { order: "asc" } },
      sources: true,
    },
  });
  if (!exam) throw new Error("NOT_FOUND");
  return examToDto(exam);
}

export async function touchLastOpened(examId: string, userId: string, client?: DbClient): Promise<void> {
  const db = client ?? prisma;
  await db.exam.update({ where: { id: examId, userId }, data: { lastOpenedAt: new Date() } });
}

export { prisma };
