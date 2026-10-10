import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleDocument } from "./assemble";
import { getGuide } from "@/data/guides";
import type { ExamDto, SectionDto } from "@/types";

function section(partial: Partial<SectionDto> & { type: SectionDto["type"]; id: string }): SectionDto {
  return {
    order: 0,
    candidates: [],
    tasks: [],
    topics: [],
    ...partial,
  };
}

function exam(partial: Partial<ExamDto>): ExamDto {
  return {
    id: "exam-1",
    title: "English Exam",
    status: "ACTIVE",
    config: null,
    sections: [],
    sources: [],
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function secondaryConfig(grade: string, stream?: string) {
  return {
    level: "secondary",
    grade,
    stream: stream ?? null,
    length: 150,
    unit: "u1",
    topic: "t1",
    customTopic: false,
    language: "en",
  };
}

test("assembleDocument falls back to a BAC umbrella layout when there is no config", () => {
  const doc = assembleDocument(exam({ title: "Draft exam" }));
  assert.equal(doc.structure, "bac");
  assert.equal(doc.title, "Draft exam");
  assert.equal(doc.sections.length, 4);
  assert.equal(doc.sections[0].heading, "Part One: Reading.");
});

test("assembleDocument names the grade and unit in the metadata block", () => {
  const doc = assembleDocument(exam({ config: secondaryConfig("1as") }));
  assert.ok(doc.meta.some((m) => m === "Grade: 1AS"));
  assert.ok(doc.meta.some((m) => m === "Level: Secondary school"));
  assert.ok(doc.meta.some((m) => m.startsWith("Unit: ")));
  assert.ok(doc.meta.some((m) => m === "Language: English"));
});

test("assembleDocument labels middle school in the metadata when the level says so", () => {
  const doc = assembleDocument(
    exam({ config: { ...secondaryConfig("1am"), level: "middle" } })
  );
  assert.ok(doc.meta.some((m) => m === "Level: Middle school"));
});

test("assembleDocument omits stream, duration and guide lines when they are absent", () => {
  const doc = assembleDocument(exam({ config: secondaryConfig("1as") }));
  assert.equal(doc.meta.some((m) => m.startsWith("Stream: ")), false);
  assert.equal(doc.meta.some((m) => m.startsWith("Guide: ")), false);
});

test("assembleDocument surfaces the guide version when the config carries one", () => {
  const doc = assembleDocument(
    exam({ config: { ...secondaryConfig("1as"), guideVersion: "2024.1" } })
  );
  assert.ok(doc.meta.includes("Guide: 2024.1"));
});

test("assembleDocument gives the BAC umbrella the sum of Part One and text exploration marks", () => {
  const guide = getGuide("1as", "en");
  const doc = assembleDocument(exam({ config: secondaryConfig("1as") }));
  const expected = String(guide.marks.partOne + guide.marks.textExploration).padStart(2, "0");
  assert.equal(doc.sections[0].marksLabel, `(${expected} pts)`);
});

test("assembleDocument zero-pads the per-section marks in the BAC layout", () => {
  const guide = getGuide("1as", "en");
  const doc = assembleDocument(exam({ config: secondaryConfig("1as") }));
  assert.equal(doc.sections[1].marksLabel, `(${String(guide.marks.partOne).padStart(2, "0")} pts)`);
  assert.equal(doc.sections[2].marksLabel, `(${String(guide.marks.textExploration).padStart(2, "0")} pts)`);
  assert.equal(doc.sections[3].marksLabel, `(${String(guide.marks.writing).padStart(2, "0")} pts)`);
});

test("assembleDocument keeps the passage and its citation on the umbrella section only", () => {
  const doc = assembleDocument(
    exam({
      config: secondaryConfig("1as"),
      sources: [{ title: "The Last Lesson", isExternal: false }],
      sections: [section({ id: "s-text", type: "TEXT", text: "The body", textTitle: "A short text" })],
    })
  );
  assert.equal(doc.sections[0].text?.body, "The body");
  assert.equal(doc.sections[0].text?.title, "A short text");
  assert.equal(doc.sections[0].sourceNote, "Adapted from The Last Lesson");
  assert.equal(doc.sections[1].text, undefined);
});

test("assembleDocument credits the source the teacher selected via sourceIndex", () => {
  const doc = assembleDocument(
    exam({
      config: secondaryConfig("1as"),
      sources: [{ title: "First source", isExternal: false }, { title: "Chosen source", isExternal: false }],
      sections: [section({ id: "s-text", type: "TEXT", text: "Body", sourceIndex: 1 })],
    })
  );
  assert.equal(doc.sections[0].sourceNote, "Adapted from Chosen source");
});

test("assembleDocument renders no passage block when the text section is empty", () => {
  const doc = assembleDocument(
    exam({
      config: secondaryConfig("1as"),
      sections: [section({ id: "s-text", type: "TEXT", text: null })],
    })
  );
  assert.equal(doc.sections[0].text, undefined);
  assert.equal(doc.sections[0].sourceNote, undefined);
});

test("assembleDocument routes comprehension and exploration tasks to their own sections", () => {
  const doc = assembleDocument(
    exam({
      config: secondaryConfig("1as"),
      sections: [
        section({ id: "s-p1", type: "PART_ONE", tasks: [{ id: "t1", prompt: "What is...", marks: 2, order: 0, manualEdited: false, candidates: [] }] }),
        section({
          id: "s-p2",
          type: "TEXT_EXPLORATION",
          tasks: [{ id: "t2", prompt: "Explain...", marks: 3, order: 0, manualEdited: false, candidates: [], table: { headers: ["H"], rows: [["v"]] } }],
        }),
      ],
    })
  );
  assert.equal(doc.sections[1].tasks.length, 1);
  assert.equal(doc.sections[1].tasks[0].prompt, "What is...");
  assert.equal(doc.sections[2].tasks.length, 1);
  assert.deepEqual(doc.sections[2].tasks[0].table, { headers: ["H"], rows: [["v"]] });
});

test("assembleDocument asks the candidate to pick a topic only when two exist", () => {
  const oneTopic = exam({
    config: secondaryConfig("1as"),
    sections: [section({ id: "s-w", type: "WRITING", topics: [{ id: "tp1", kind: "GUIDED", marks: 7, order: 0, manualEdited: false, candidates: [] }] })],
  });
  assert.equal(assembleDocument(oneTopic).sections[3].intro, undefined);

  const twoTopics = exam({
    config: secondaryConfig("1as"),
    sections: [
      section({
        id: "s-w",
        type: "WRITING",
        topics: [
          { id: "tp1", kind: "GUIDED", marks: 7, order: 0, manualEdited: false, candidates: [] },
          { id: "tp2", kind: "FREE", marks: 7, order: 1, manualEdited: false, candidates: [] },
        ],
      }),
    ],
  });
  assert.equal(assembleDocument(twoTopics).sections[3].intro, "Choose ONE of the following topics");
});

test("assembleDocument titles untitled writing topics by their kind", () => {
  const doc = assembleDocument(
    exam({
      config: secondaryConfig("1as"),
      sections: [
        section({
          id: "s-w",
          type: "WRITING",
          topics: [
            { id: "tp1", kind: "GUIDED", marks: 7, order: 0, manualEdited: false, candidates: [] },
            { id: "tp2", kind: "FREE", marks: 7, order: 1, manualEdited: false, candidates: [] },
          ],
        }),
      ],
    })
  );
  assert.equal(doc.sections[3].topics[0].title, "Topic 1");
  assert.equal(doc.sections[3].topics[1].title, "Topic 2");
});

test("assembleDocument defaults an unset topic form rather than emitting undefined", () => {
  const doc = assembleDocument(
    exam({
      config: secondaryConfig("1as"),
      sections: [section({ id: "s-w", type: "WRITING", topics: [{ id: "tp1", kind: "GUIDED", marks: 7, order: 0, manualEdited: false, candidates: [] }] })],
    })
  );
  assert.equal(doc.sections[3].topics[0].form, "a paragraph");
});

function middleConfig(grade: string) {
  return {
    level: "middle",
    grade,
    stream: null,
    length: 120,
    unit: "u1",
    topic: "t1",
    customTopic: false,
    language: "en",
  };
}

test("assembleDocument uses the three-section BEM layout for middle school", () => {
  const doc = assembleDocument(exam({ config: middleConfig("1am") }));
  assert.equal(doc.structure, "bem");
  assert.equal(doc.sections.length, 3);
  assert.deepEqual(doc.sections.map((s) => s.heading), [
    "A. Reading Comprehension",
    "B. Mastery of Language",
    "Part Two — Written Expression",
  ]);
});

test("assembleDocument labels middle school in the metadata block", () => {
  const doc = assembleDocument(exam({ config: middleConfig("1am") }));
  assert.ok(doc.meta.includes("Level: Middle school"));
  assert.ok(doc.meta.includes("Grade: 1AM"));
});

test("assembleDocument totals middle school marks from the guide", () => {
  const guide = getGuide("1am", "en");
  const doc = assembleDocument(exam({ config: middleConfig("1am") }));
  assert.equal(doc.sections[0].marksLabel, `${guide.marks.partOne} pts`);
  assert.equal(doc.sections[1].marksLabel, `${guide.marks.textExploration} pts`);
  assert.equal(doc.sections[2].marksLabel, `${guide.marks.writing} pts`);
});

test("assembleDocument keeps the passage inside the reading section for BEM", () => {
  const doc = assembleDocument(
    exam({
      config: middleConfig("1am"),
      sources: [{ title: "A Tale", adaptationNote: "retold", isExternal: false }],
      sections: [section({ id: "s-text", type: "TEXT", text: "Body", sourceIndex: 0 })],
    })
  );
  assert.equal(doc.sections[0].text?.body, "Body");
  assert.equal(doc.sections[0].sourceNote, "A Tale — retold");
  assert.equal(doc.sections[1].text, undefined);
});

test("assembleDocument omits the choose-one-topic intro for single-topic writing", () => {
  const doc = assembleDocument(
    exam({
      config: middleConfig("1am"),
      sections: [section({ id: "s-w", type: "WRITING", topics: [{ id: "tp1", kind: "GUIDED", marks: 6, order: 0, manualEdited: false, candidates: [] }] })],
    })
  );
  assert.equal(doc.sections[2].intro, undefined);
});

test("assembleDocument always credits Exaai as the generator", () => {
  assert.equal(assembleDocument(exam({})).generatedBy, "Generated with Exaai");
});

test("assembleDocument produces a document whose section count is stable for a given grade", () => {
  const first = assembleDocument(exam({ config: secondaryConfig("1as") }));
  const second = assembleDocument(exam({ config: secondaryConfig("1as") }));
  assert.equal(first.sections.length, second.sections.length);
  assert.deepEqual(first.sections.map((s) => s.heading), second.sections.map((s) => s.heading));
});