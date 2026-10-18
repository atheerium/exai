// Version history (PRD 15.3, US-024). A revision is a JSON snapshot of the
// exam's configuration, sections (with tasks/topics) and sources, so an
// earlier state can be restored without losing the exam identity.

import { prisma, type DbClient } from "@/lib/db";

const MAX_REVISIONS = 50;

export interface RevisionSnapshot {
  title: string;
  config: {
    level: string;
    grade: string;
    stream?: string | null;
    length: number;
    /**
     * Passages are 3 or 4 paragraphs (teacher choice). Part of the config, so a
     * snapshot that omits it restores every exam at the schema default of 3 and
     * silently discards a 4-paragraph choice.
     */
    paragraphCount?: number;
    unit: string;
    topic: string;
    customTopic: boolean;
    guideVersion?: string | null;
    language?: string;
    teacherKeywords?: string | null;
    difficulty?: string | null;
  } | null;
  sections: {
    type: string;
    heading?: string | null;
    order: number;
    content?: string | null;
    tasks: {
      skill?: string | null;
      prompt: string;
      instruction?: string | null;
      answer?: string | null;
      marks: number;
      order: number;
      manualEdited: boolean;
      /**
       * Task family and table payload. Both are optional because revisions
       * captured before 2026-10-18 predate them; a restore must tolerate that
       * (the column default applies) rather than fail.
       *
       * `tableData` is not decoration: a MORPHOLOGY or PHONOLOGY task IS its
       * chart. Omitting it restored a morphology instruction with no chart,
       * which is a defect `validateCandidate` rejects at generation time.
       */
      family?: string | null;
      tableData?: string | null;
      candidates?: string | null;
    }[];
    topics: {
      kind: string;
      title?: string | null;
      situation?: string | null;
      instruction?: string | null;
      keywords?: string | null;
      form?: string | null;
      marks: number;
      order: number;
      manualEdited: boolean;
      candidates?: string | null;
    }[];
  }[];
  sources: {
    title?: string | null;
    author?: string | null;
    publication?: string | null;
    url?: string | null;
    accessedAt?: string | null;
    adaptationNote?: string | null;
    isExternal: boolean;
  }[];
}

export async function captureRevision(examId: string, label: string, client?: DbClient): Promise<void> {
  const db = client ?? prisma;
  const exam = await db.exam.findUnique({
    where: { id: examId },
    include: {
      config: true,
      sections: { include: { tasks: true, topics: true }, orderBy: { order: "asc" } },
      sources: true,
    },
  });
  if (!exam) return;

  const snapshot: RevisionSnapshot = {
    title: exam.title,
    config: exam.config
      ? {
          level: exam.config.level,
          grade: exam.config.grade,
          stream: exam.config.stream,
          length: exam.config.length,
          paragraphCount: exam.config.paragraphCount,
          unit: exam.config.unit,
          topic: exam.config.topic,
          customTopic: exam.config.customTopic,
          guideVersion: exam.config.guideVersion,
          language: exam.config.language,
          teacherKeywords: exam.config.teacherKeywords,
          difficulty: exam.config.difficulty,
        }
      : null,
    sections: exam.sections.map((s) => ({
      type: s.type,
      heading: s.heading,
      order: s.order,
      content: s.content,
      tasks: s.tasks.map((t) => ({
        skill: t.skill,
        prompt: t.prompt,
        instruction: t.instruction,
        answer: t.answer,
        marks: t.marks,
        order: t.order,
        manualEdited: t.manualEdited,
        family: t.family,
        tableData: t.tableData,
        candidates: t.candidates,
      })),
      topics: s.topics.map((t) => ({
        kind: t.kind,
        title: t.title,
        situation: t.situation,
        instruction: t.instruction,
        keywords: t.keywords,
        form: t.form,
        marks: t.marks,
        order: t.order,
        manualEdited: t.manualEdited,
        candidates: t.candidates,
      })),
    })),
    sources: exam.sources.map((s) => ({
      title: s.title,
      author: s.author,
      publication: s.publication,
      url: s.url,
      accessedAt: s.accessedAt,
      adaptationNote: s.adaptationNote,
      isExternal: s.isExternal,
    })),
  };

  await db.examRevision.create({ data: { examId, label, snapshot: JSON.stringify(snapshot) } });

  // Cap history depth (PRD OD-11: configurable retention).
  const excess = await db.examRevision.count({ where: { examId } });
  if (excess > MAX_REVISIONS) {
    const oldest = await db.examRevision.findMany({
      where: { examId },
      orderBy: { createdAt: "asc" },
      take: excess - MAX_REVISIONS,
      select: { id: true },
    });
    await db.examRevision.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
  }
}

export async function restoreRevision(examId: string, revisionId: string): Promise<void> {
  const revision = await prisma.examRevision.findFirst({ where: { id: revisionId, examId } });
  if (!revision) throw new Error("NOT_FOUND");
  const snap = JSON.parse(revision.snapshot) as RevisionSnapshot;

  await prisma.$transaction(
    async (tx) => {
    await tx.examSection.deleteMany({ where: { examId } });
    await tx.source.deleteMany({ where: { examId } });

    if (snap.config) {
      await tx.examConfig.upsert({
        where: { examId },
        update: snap.config,
        create: { examId, ...snap.config },
      });
    }

    for (const sec of snap.sections) {
      const created = await tx.examSection.create({
        data: { examId, type: sec.type, heading: sec.heading, order: sec.order, content: sec.content ?? "{}" },
      });
      for (const t of sec.tasks) {
        await tx.task.create({ data: { sectionId: created.id, ...t } });
      }
      for (const t of sec.topics) {
        await tx.topic.create({ data: { sectionId: created.id, ...t } });
      }
    }

    for (const src of snap.sources) {
      await tx.source.create({ data: { examId, ...src } });
    }

    await tx.exam.update({ where: { id: examId }, data: { title: snap.title || "Untitled exam" } });
    },
    { timeout: 30000, maxWait: 10000 }
  );
}
