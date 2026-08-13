// Serialization between Prisma records and the DTO shapes the UI consumes.

import { prisma } from "@/lib/db";
import type { ExamDto, SectionDto, SourceDto, TaskDto, TopicDto, ExamConfigDto } from "@/types";

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
      table: t.tableData ? JSON.parse(t.tableData) : null,
      candidates: t.candidates ? JSON.parse(t.candidates) : [],
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
      candidates: t.candidates ? JSON.parse(t.candidates) : [],
    }));
}

export async function examToDto(exam: any): Promise<ExamDto> {
  const sections: SectionDto[] = (exam.sections ?? []).map((s: any) => {
    const content = s.content ? JSON.parse(s.content) : {};
    return {
      id: s.id,
      type: s.type,
      heading: s.heading,
      order: s.order,
      text: content.text ?? null,
      textTitle: content.title ?? null,
      previousText: content.previousText ?? null,
      previousTitle: content.previousTitle ?? null,
      candidates: content.candidates ?? [],
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
        unit: exam.config.unit,
        topic: exam.config.topic,
        customTopic: exam.config.customTopic,
        guideVersion: exam.config.guideVersion ?? null,
        language: exam.config.language ?? "en",
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

export async function loadExamDto(examId: string, userId: string): Promise<ExamDto> {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, userId },
    include: {
      config: true,
      sections: { include: { tasks: true, topics: true }, orderBy: { order: "asc" } },
      sources: true,
    },
  });
  if (!exam) throw new Error("NOT_FOUND");
  await prisma.exam.update({ where: { id: exam.id }, data: { lastOpenedAt: new Date() } });
  return examToDto(exam);
}

export { prisma };
