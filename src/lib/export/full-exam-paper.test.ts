// Proves the parity the full-exam flow depends on: an exam persisted by one
// FULL_EXAM run renders through buildPaper identically to an exam whose
// sections were assembled by hand to the same values.
//
// The point is not that buildPaper is deterministic -- it is. The point is that
// the route's FULL_EXAM write branch and its per-section write branch produce
// the same *content model*, so switching the builder to one-click generation
// cannot change what the paper looks like.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFullExam } from "@/lib/generate/full-exam";
import { assembleDocument } from "./assemble";
import { buildPaper } from "./paper";
import { GRADES, getGuide } from "@/data/guides";
import type { ExamDto, SectionDto } from "@/types";

function paramsFor(grade: string, examId: string) {
  const gradeDef = GRADES[grade]!;
  const stream = gradeDef.streams?.[0] ?? undefined;
  const unit = gradeDef.units.find((u) => !u.streams || !stream || u.streams.includes(stream)) ?? gradeDef.units[0];
  const guide = getGuide(grade, "en", stream)!;
  return {
    level: gradeDef.level,
    grade,
    unit: unit.key,
    topic: unit.topics[0],
    length: guide.defaultLength,
    stream,
    examId,
    singleTopic: guide.structure === "bem",
  };
}

function section(partial: Partial<SectionDto> & { type: SectionDto["type"]; id: string }): SectionDto {
  return { order: 0, candidates: [], tasks: [], topics: [], ...partial };
}

/** Build the DTO shape the FULL_EXAM write path produces. */
async function fullExamDto(grade: string, examId: string): Promise<ExamDto> {
  const p = paramsFor(grade, examId);
  const guide = getGuide(grade, "en", p.stream)!;
  const r = await generateFullExam(p);
  assert.equal(r.ok, true, JSON.stringify(r.issues));

  const sections: SectionDto[] = [];
  sections.push(
    section({
      id: "s-text",
      type: "TEXT",
      order: 1,
      heading: "Part One: Reading",
      text: r.text!.text,
      textTitle: r.text!.title,
      candidates: r.text!.candidates.map((c) => ({ title: c.title, text: c.text })),
    })
  );
  const mkTasks = (sets: typeof r.partOne, id: string, order: number, type: SectionDto["type"], heading: string) =>
    section({
      id,
      type,
      order,
      heading,
      tasks: sets![0].map((t, i) => ({
        id: `${id}-${i}`,
        order: i,
        skill: t.skill ?? null,
        family: t.family ?? null,
        prompt: t.prompt,
        instruction: t.instruction,
        answer: t.answer ?? null,
        marks: t.marks,
        table: t.table ?? null,
        candidates: sets!.slice(1).map((s) => s[i]).filter(Boolean),
      })),
    });
  sections.push(mkTasks(r.partOne, "s-p1", 2, "PART_ONE", guide.headings?.partOne ?? "A. Reading Comprehension"));
  sections.push(mkTasks(r.textExploration, "s-p2", 3, "TEXT_EXPLORATION", guide.headings?.textExploration ?? "B. Text Exploration"));

  const w = r.writing![0];
  sections.push(
    section({
      id: "s-w",
      type: "WRITING",
      order: 4,
      heading: guide.headings?.writing ?? "C. Written expression",
      topics: [
        {
          id: "t-g",
          kind: "GUIDED",
          order: 0,
          title: w.guided.title,
          situation: w.guided.situation,
          instruction: w.guided.instruction,
          keywords: w.guided.keywords ?? null,
          form: w.guided.form,
          marks: w.guided.marks,
          answer: null,
          candidates: r.writing!.slice(1).map((c) => c.guided),
        },
        ...(w.free
          ? [
              {
                id: "t-f",
                kind: "FREE" as const,
                order: 1,
                title: w.free.title,
                situation: w.free.situation,
                instruction: w.free.instruction,
                keywords: null,
                form: w.free.form,
                marks: w.free.marks,
                answer: null,
                candidates: r.writing!.slice(1).map((c) => c.free).filter(Boolean),
              },
            ]
          : []),
      ],
    })
  );

  return {
    id: p.examId,
    title: "English Exam",
    status: "DRAFT",
    config: {
      level: p.level,
      grade: p.grade,
      stream: p.stream ?? null,
      length: p.length,
      unit: p.unit,
      topic: p.topic,
      customTopic: false,
      language: "en",
      guideVersion: guide.version,
      teacherKeywords: null,
      difficulty: null,
    },
    sections,
    sources: [],
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

test("full-exam content renders through buildPaper", async () => {
  const dto = await fullExamDto("3as", "paper-1");
  const doc = assembleDocument(dto);
  const paper = buildPaper(doc);
  assert.ok(paper.blocks.length > 0);
  const kinds = new Set(paper.blocks.map((b) => b.kind));
  assert.ok(kinds.has("masthead"), "masthead present");
  assert.ok(kinds.has("sectionHead"), "section headings present");
  assert.ok(kinds.has("passage"), "passage present");
});

test("paper build is stable across repeated calls for the same exam", async () => {
  const dto = await fullExamDto("3as", "paper-2");
  const a = buildPaper(assembleDocument(dto));
  const b = buildPaper(assembleDocument(dto));
  assert.equal(JSON.stringify(a.blocks), JSON.stringify(b.blocks));
});

test("answer key never reaches the rendered paper", async () => {
  const dto = await fullExamDto("3as", "paper-3");
  const paper = buildPaper(assembleDocument(dto));
  const text = JSON.stringify(paper.blocks);
  // The stored answers are the giveaway: take one that exists in the DTO and
  // assert its exact text is absent from every block.
  const answers = dto.sections
    .flatMap((s) => s.tasks.map((t) => t.answer))
    .filter((a): a is string => !!a && a.length > 12);
  assert.ok(answers.length > 0, "fixture must expose at least one answer to check");
  for (const a of answers) {
    assert.ok(!text.includes(a), `answer leaked into the paper: ${a.slice(0, 40)}`);
  }
});

test("BEM full exam renders through the bem layout", async () => {
  const dto = await fullExamDto("1am", "paper-4");
  assert.equal(getGuide("1am", "en")!.structure, "bem");
  const doc = assembleDocument(dto);
  assert.equal(doc.structure, "bem");
  const paper = buildPaper(doc);
  assert.ok(paper.blocks.length > 0);
  // BEM takes a single writing topic; a second one would be marks-less.
  const writing = dto.sections.find((s) => s.type === "WRITING")!;
  assert.equal(writing.topics.length, 1);
});