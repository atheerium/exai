import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaper, letterLabel, parseTaskBody, emphasisFrom } from "./paper";
import { assembleDocument } from "./assemble";
import { getGuide } from "@/data/guides";
import type { ExamDto, SectionDto } from "@/types";

function section(partial: Partial<SectionDto> & { type: SectionDto["type"]; id: string }): SectionDto {
  return { order: 0, candidates: [], tasks: [], topics: [], ...partial };
}

function exam(partial: Partial<ExamDto>): ExamDto {
  return {
    id: "exam-1",
    title: "English Exam",
    status: "ACTIVE",
    config: {
      level: "secondary",
      grade: "3as",
      stream: "Foreign Languages",
      length: 150,
      unit: "Health",
      topic: "Diet",
      customTopic: false,
      language: "en",
    },
    sections: [],
    sources: [],
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("letterLabel enumerates a..z then rolls over to aa", () => {
  assert.equal(letterLabel(0), "a)", "lowercase letter + paren (user rule 2026-10-11)");
  assert.equal(letterLabel(25), "z)");
  assert.equal(letterLabel(26), "aa)");
});

test("parseTaskBody relabels numbered items as letters", () => {
  const { items } = parseTaskBody("1. First thing\n2. Second thing\n3. Third thing");
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)", "c)"]);
  assert.deepEqual(items.map((i) => i.text), ["First thing", "Second thing", "Third thing"]);
});

test("parseTaskBody keeps already-lettered items and strips their old labels", () => {
  const { items } = parseTaskBody("A. Alpha\nB. Beta");
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)"]);
  assert.deepEqual(items.map((i) => i.text), ["Alpha", "Beta"]);
});

test("parseTaskBody separates the lead-in line from the items", () => {
  const { lead, items } = parseTaskBody(
    "Read the text and match each idea with the paragraph where it is mentioned.\nA. One\nB. Two"
  );
  assert.deepEqual(lead, ["Read the text and match each idea with the paragraph where it is mentioned."]);
  assert.equal(items.length, 2);
});

test("parseTaskBody drops a lead-in that merely repeats the task instruction", () => {
  const instruction = "Say whether the following statements are true or false.";
  const { lead, items } = parseTaskBody(`${instruction}\n1. One\n2. Two`, instruction);
  assert.deepEqual(lead, []);
  assert.equal(items.length, 2);
});

test("parseTaskBody keeps a lead-in that differs from the instruction", () => {
  const { lead } = parseTaskBody("Match each idea with a paragraph.\nA. One", "Who or what do these refer to?");
  assert.deepEqual(lead, ["Match each idea with a paragraph."]);
});

test("parseTaskBody flags and strips a dotted answer gap", () => {
  const { items } = parseTaskBody("1. Revise → ..........\n2. Curious  ..........");
  assert.equal(items[0].gap, true);
  assert.equal(items[0].text, "Revise");
  assert.equal(items[1].gap, true);
  assert.equal(items[1].text, "Curious");
});

test("parseTaskBody treats a plain sentence as a gap-free item", () => {
  const { items } = parseTaskBody("1. School clubs only waste time.");
  assert.equal(items[0].gap, false);
  assert.equal(items[0].text, "School clubs only waste time.");
});

test("emphasisFrom collects quoted underlined target words", () => {
  const { items } = parseTaskBody('1. "Organise" (underlined)\n2. "Curiosity" (underlined)');
  assert.deepEqual(emphasisFrom(items), ["Organise", "Curiosity"]);
});

const paper = buildPaper(
  assembleDocument(
    exam({
      sections: [
        section({
          id: "s-text",
          type: "TEXT",
          text: "First paragraph here.\n\nSecond paragraph here. They said which was fair.",
          textTitle: "The title",
          sourceIndex: 0,
        }),
        section({
          id: "s-p1",
          type: "PART_ONE",
          tasks: [
            {
              id: "t1",
              prompt: '1. "They" (underlined)\n2. "which" (underlined)',
              instruction: "Who or what do the underlined words refer to in the text?",
              marks: 2,
              order: 0,
              manualEdited: false,
              family: "COHESIVE_MARKERS",
              candidates: [],
            },
          ],
        }),
      ],
      sources: [
        {
          title: "https://example.com",
          author: null,
          publication: null,
          url: "https://example.com",
          adaptationNote: null,
          isExternal: true,
        },
      ],
    })
  )
);

test("buildPaper emits a masthead first and a colophon last", () => {
  assert.equal(paper.blocks[0].kind, "masthead");
  assert.equal(paper.blocks[paper.blocks.length - 1].kind, "colophon");
});

test("buildPaper splits the passage into separate paragraphs", () => {
  const passage = paper.blocks.find((b) => b.kind === "passage");
  assert.ok(passage && passage.kind === "passage");
  assert.deepEqual(passage.paragraphs, ["First paragraph here.", "Second paragraph here. They said which was fair."]);
  assert.equal(passage.title, "The title");
});

test("buildPaper underlines only referent target words in the passage block", () => {
  const passage = paper.blocks.find((b) => b.kind === "passage");
  assert.ok(passage && passage.kind === "passage");
  assert.deepEqual(passage.emphasis, ["They", "which"]);
});

test("buildPaper prints the paragraph reference beside each referent item", () => {
  const task = paper.blocks.find((b) => b.kind === "task");
  assert.ok(task && task.kind === "task");
  assert.deepEqual(task.task.items.map((i) => i.ref), ["(§2)", "(§2)"]);
  assert.equal(task.task.items[0].text, "They");
  assert.equal(task.task.items[0].gap, true);
});

test("buildPaper rejects a content word used as a referent target", () => {
  const doc = assembleDocument(
    exam({
      sections: [
        section({
          id: "s-text",
          type: "TEXT",
          text: "Honest friends build trust over time.",
          sourceIndex: 0,
        }),
        section({
          id: "s-p1",
          type: "PART_ONE",
          tasks: [
            {
              id: "t1",
              prompt: '1. "Honest" (underlined)',
              instruction: "Who or what do the underlined words refer to in the text?",
              marks: 2,
              order: 0,
              manualEdited: false,
              candidates: [],
            },
          ],
        }),
      ],
    })
  );
  const built = buildPaper(doc);
  const task = built.blocks.find((b) => b.kind === "task");
  assert.ok(task && task.kind === "task");
  // The item keeps its original text but is not treated as a referent, so no
  // paragraph reference is invented for it.
  assert.equal(task.task.items[0].referent, false);
  assert.equal(task.task.items[0].ref, null);
  const passage = built.blocks.find((b) => b.kind === "passage");
  assert.ok(passage && passage.kind === "passage");
  assert.deepEqual(passage.emphasis, []);
});

test("buildPaper letter the items of a numbered comprehension task", () => {
  const task = paper.blocks.find((b) => b.kind === "task");
  assert.ok(task && task.kind === "task");
  assert.equal(task.task.number, 1);
  assert.deepEqual(task.task.items.map((i) => i.label), ["a)", "b)"]);
  assert.equal(task.task.instruction, "Who or what do the underlined words refer to in the text?");
});

test("buildPaper numbers BAC tasks sequentially across sections", () => {
  const doc = assembleDocument(
    exam({
      sections: [
        section({
          id: "s-p1",
          type: "PART_ONE",
          tasks: [
            { id: "a", prompt: "1. One", instruction: "First", marks: 1, order: 0, manualEdited: false, candidates: [] },
            { id: "b", prompt: "1. Two", instruction: "Second", marks: 1, order: 1, manualEdited: false, candidates: [] },
          ],
        }),
        section({
          id: "s-p2",
          type: "TEXT_EXPLORATION",
          tasks: [
            { id: "c", prompt: "1. Three", instruction: "Third", marks: 1, order: 0, manualEdited: false, candidates: [] },
          ],
        }),
      ],
    })
  );
  const numbers = buildPaper(doc)
    .blocks.filter((b) => b.kind === "task")
    .map((b) => (b.kind === "task" ? b.task.number : 0));
  assert.deepEqual(numbers, [1, 2, 1]);
});

test("buildPaper carries the BAC structure so renderers can add the Arabic header", () => {
  assert.equal(paper.structure, "bac");
  const bemGuide = getGuide("4am");
  assert.equal(bemGuide.structure, "bem");
});

const taskWithTable = (skill: string | null, table: { headers: string[]; rows: string[][] }) => ({
  id: "t",
  prompt: "1. One",
  instruction: "Fill",
  marks: 2,
  order: 0,
  manualEdited: false,
  candidates: [],
  skill,
  table,
});

test("Part One never renders a table, even when the stored task carries one", () => {
  // User rule 2026-10-11: True/False and paragraph matching print sentences
  // only. Exams saved before the rule still hold a table in the DTO, so this is
  // a render-time strip, not a data migration.
  const paper = buildPaper(
    assembleDocument(
      exam({
        sections: [
          section({
            id: "s",
            type: "PART_ONE",
            tasks: [taskWithTable(null, { headers: ["Statement", "Answer"], rows: [["A statement", "True"]] })],
          }),
        ],
      })
    )
  );
  assert.equal(paper.blocks.some((b) => b.kind === "table"), false);
  assert.ok(paper.blocks.some((b) => b.kind === "task"), "the task itself still renders");
});

test("Part Two renders a table only for the tabular skills", () => {
  const build = (skill: string) =>
    buildPaper(
      assembleDocument(
        exam({
          sections: [
            section({
              id: "s",
              type: "TEXT_EXPLORATION",
              tasks: [taskWithTable(skill, { headers: ["prefix", "root", "suffix"], rows: [["", "", ""]] })],
            }),
          ],
        })
      )
    );

  for (const skill of ["MORPHOLOGY", "PHONOLOGY"]) {
    const p = build(skill);
    const table = p.blocks.find((b) => b.kind === "table");
    assert.ok(table && table.kind === "table", `${skill} keeps its table`);
    assert.deepEqual(table.table.headers, ["prefix", "root", "suffix"]);
  }

  for (const skill of ["VOCABULARY", "DISCOURSE", "GRAMMAR", "READING"]) {
    assert.equal(build(skill).blocks.some((b) => b.kind === "table"), false, `${skill} must not render a table`);
  }
});

test("buildPaper ignores a table with no headers", () => {
  const paper = buildPaper(
    assembleDocument(
      exam({
        sections: [
          section({
            id: "s",
            type: "TEXT_EXPLORATION",
            tasks: [taskWithTable("MORPHOLOGY", { headers: [], rows: [] })],
          }),
        ],
      })
    )
  );
  assert.equal(paper.blocks.some((b) => b.kind === "table"), false);
});

test("buildPaper turns writing keywords into a notes list with a heading", () => {
  const doc = assembleDocument(
    exam({
      sections: [
        section({
          id: "s-w",
          type: "WRITING",
          topics: [
            {
              id: "w1",
              kind: "GUIDED",
              title: "Topic 1",
              situation: "A situation.",
              instruction: "Write about it.",
              keywords: "alpha, beta/gamma",
              marks: 6,
              order: 0,
              manualEdited: false,
              candidates: [],
            },
          ],
        }),
      ],
    })
  );
  const topic = buildPaper(doc).blocks.find((b) => b.kind === "topic");
  assert.ok(topic && topic.kind === "topic");
  assert.equal(topic.topic.label, "Topic One:");
  assert.deepEqual(topic.topic.notes, ["alpha", "beta", "gamma"]);
  assert.equal(topic.topic.noteHeading, "Make the best use of the following notes:");
});

test("buildPaper never leaks an answer string into the rendered blocks", () => {
  const doc = assembleDocument(
    exam({
      sections: [
        section({
          id: "s",
          type: "PART_ONE",
          tasks: [
            {
              id: "t",
              prompt: "1. One\n2. Two",
              instruction: "Answer the following questions according to the text.",
              answer: "1. secret answer",
              marks: 2,
              order: 0,
              manualEdited: false,
              candidates: [],
            },
          ],
        }),
      ],
    })
  );
  const serialised = JSON.stringify(buildPaper(doc).blocks);
  assert.equal(serialised.includes("secret answer"), false);
});