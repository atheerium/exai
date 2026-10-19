import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPaper, letterLabel, parseTaskBody, emphasisFrom, extractWordBank, highlightRuns, WORD_BANK_SEPARATOR } from "./paper";
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
          // Opt in so the fixture exercises the printed-title path; production
          // sections default to no title (user rule 2026-10-11).
          showTitle: true,
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
  // No dotted leader: the official row is "a) them (§1)   b) their (§2)".
  assert.equal(task.task.items[0].gap, false);
});

test("buildPaper links bare referent options to the passage", () => {
  const doc = assembleDocument(
    exam({
      sections: [
        section({
          id: "s-text",
          type: "TEXT",
          text:
            "They met early. The plan was simple.\n\n" +
            "Nothing changed that day.\n\n" +
            "This mattered to it in the end.",
          sourceIndex: 0,
        }),
        section({
          id: "s-p1",
          type: "PART_ONE",
          tasks: [
            {
              id: "t1",
              // The live model returns bare targets, not `"they" (underlined)`.
              prompt: "they\nthis\nit",
              instruction: "Who or what do the underlined words refer to in the text?",
              marks: 3,
              order: 0,
              manualEdited: false,
              family: "COHESIVE_MARKERS",
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
  assert.deepEqual(
    task.task.items.map((i) => ({ text: i.text, ref: i.ref, referent: i.referent, gap: i.gap })),
    [
      { text: "they", ref: "(§1)", referent: true, gap: false },
      { text: "this", ref: "(§3)", referent: true, gap: false },
      { text: "it", ref: "(§3)", referent: true, gap: false },
    ]
  );

  const passage = built.blocks.find((b) => b.kind === "passage");
  assert.ok(passage && passage.kind === "passage");
  assert.deepEqual(passage.emphasisMarks, [
    { word: "they", paragraph: 1, occurrence: 0 },
    { word: "this", paragraph: 3, occurrence: 0 },
    { word: "it", paragraph: 3, occurrence: 0 },
  ]);
});

test("buildPaper links a multi-word noun-phrase referent", () => {
  const doc = assembleDocument(
    exam({
      sections: [
        section({
          id: "s-text",
          type: "TEXT",
          text: "Something happened.\n\nStudents discussed the problem again.",
          sourceIndex: 0,
        }),
        section({
          id: "s-p1",
          type: "PART_ONE",
          tasks: [
            {
              id: "t1",
              prompt: "the problem",
              instruction: "Who or what do the underlined words refer to in the text?",
              marks: 1,
              order: 0,
              manualEdited: false,
              family: "COHESIVE_MARKERS",
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
  assert.equal(task.task.items[0].ref, "(§2)");
  assert.equal(task.task.items[0].referent, true);

  const passage = built.blocks.find((b) => b.kind === "passage");
  assert.ok(passage && passage.kind === "passage");
  assert.deepEqual(passage.emphasisMarks, [
    { word: "the problem", paragraph: 2, occurrence: 0 },
  ]);
});

test("highlightRuns marks exactly one occurrence, phrase-aware", () => {
  assert.deepEqual(highlightRuns("it is it", [{ word: "it", paragraph: 2, occurrence: 1 }]), [
    { text: "it is ", mark: false },
    { text: "it", mark: true },
  ]);
  assert.deepEqual(highlightRuns("they chose the former way", [{ word: "the former", paragraph: 1, occurrence: 0 }]), [
    { text: "they chose ", mark: false },
    { text: "the former", mark: true },
    { text: " way", mark: false },
  ]);
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

// ---- The three official Part B structures (EXAM.md 10.6a) --------------------
//
// These are layout rules, and `paper.test.ts` is the executable version of
// EXAM.md, so this is where a change to one of them must fail first.

const tabularPaper = (skill: string, table: { headers: string[]; rows: string[][] }, prompt = "List: [watched, agreed]") =>
  buildPaper(
    assembleDocument(
      exam({
        sections: [
          section({
            id: "s",
            type: "TEXT_EXPLORATION",
            tasks: [{ ...taskWithTable(skill, table), prompt }],
          }),
        ],
      })
    )
  );

test("each table is tagged with the official structure its headers name", () => {
  const cases: [string, string[], string | null][] = [
    ["MORPHOLOGY", ["prefix", "root", "suffix"], "affix"],
    ["MORPHOLOGY", ["Verb", "Noun", "Adjective"], "derivation"],
    ["PHONOLOGY", ["/t/", "/d/", "/ɪd/"], "phonology"],
    ["PHONOLOGY", ["/s/", "/z/", "/ɪz/"], "phonology"],
    ["VOCABULARY", ["Word", "Meaning"], null],
  ];
  for (const [skill, headers, kind] of cases) {
    const block = tabularPaper(skill, { headers, rows: [["", "", ""]] }).blocks.find((b) => b.kind === "table");
    if (kind === null) continue;
    assert.ok(block && block.kind === "table", `${skill} ${headers.join("|")} renders`);
    assert.equal(block.table.kind, kind, `${headers.join("|")} is a ${kind} chart`);
  }
});

test("a tabular task prints no lettered items; its words are in the cells or the bank", () => {
  // The words of a chart task live in the table cells or the centred word bank.
  // Printing `a) "watched" ..........` above a chart that already shows the words
  // duplicates the row and turns a chart task back into a list.
  const chart = tabularPaper("PHONOLOGY", { headers: ["/t/", "/d/", "/ɪd/"], rows: [["", "", ""]] });
  const task = chart.blocks.find((b) => b.kind === "task");
  assert.ok(task && task.kind === "task");
  assert.equal(task.task.items.length, 0, "no lettered items beside the chart");
  assert.deepEqual(task.task.wordList, ["watched", "agreed"], "the bank survives for printing");

  const plain = buildPaper(
    assembleDocument(
      exam({
        sections: [
          section({
            id: "s",
            type: "TEXT_EXPLORATION",
            tasks: [{ ...taskWithTable("VOCABULARY", { headers: [], rows: [] }), prompt: "1. One\n2. Two" }],
          }),
        ],
      })
    )
  );
  const plainTask = plain.blocks.find((b) => b.kind === "task");
  assert.equal(plainTask && plainTask.kind === "task" ? plainTask.task.items.length : -1, 2);
});

test("a word bank prints with a spaced en dash on every surface", () => {
  // ONEC typography (user instruction 2026-10-13). The parser accepts `-` and
  // `–` on input because the separator arrives from a model; the printed form
  // does not vary, or each surface would pick its own.
  assert.equal(WORD_BANK_SEPARATOR, " – ");
  assert.deepEqual(["watched", "agreed", "needed"].join(WORD_BANK_SEPARATOR), "watched – agreed – needed");
  for (const input of ["watched - agreed - needed", "watched – agreed – needed", "List: [watched, agreed, needed]"]) {
    // The pipeline order matters: the bank is extracted BEFORE the body is
    // parsed, because once the line is an item it already has a letter.
    const bank = extractWordBank(input);
    assert.deepEqual(bank.words, ["watched", "agreed", "needed"], `parsed: ${input}`);
    assert.equal(parseTaskBody(bank.rest).items.length, 0, "the bank is never lettered as an item");
  }
});

test("an intra-word hyphen is still left alone in a bank line", () => {
  // Whitespace around each separator is what makes the shape unambiguous; a bank
  // containing `well-being` must not be split into four words.
  assert.deepEqual(extractWordBank("well-being - open-minded - far-reaching").words, []);
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
// --- Item labels across every generated shape (teacher report, 2026-10-12) ---
//
// The report was "only question 1 has letters". Cause: parseTaskBody only
// recognised lines that ALREADY began with a number or letter, so a task the
// model emitted as bare lines rendered as lead-in text with no labels. The
// labels are ours to print, so the model's choice of prefix must not decide.

test("bare lines are items, so unprefixed tasks still get letters", () => {
  const { lead, items } = parseTaskBody(
    "What does the passage say about daily life?\n" +
      "What evidence suggests an interconnected civilisation?\n" +
      "How does the passage describe trade?"
  );
  assert.equal(lead.length, 0);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)", "c)"]);
  assert.equal(items[0].text, "What does the passage say about daily life?");
});

test("blank-line separated blocks are one item each", () => {
  // The morphology/phonology shape, captured verbatim from a live run.
  const { lead, items } = parseTaskBody(
    "Word: excavation\nDerived form: \n\nWord: collaborative\nDerived form: \n\nWord: linked\nDerived form: "
  );
  assert.equal(lead.length, 0);
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)", "c)"]);
  // Field labels stay attached to their value rather than becoming items.
  assert.match(items[0].text, /^Word: excavation/);
  assert.match(items[0].text, /Derived form:/);
});

test("a sentence-rephrasing exercise prints two bold labels A) and B)", () => {
  // Teacher report 2026-10-19: the pair rendered as plain "A: ..." / "B: ..."
  // lead-in lines. It is one exercise in the official STEM form: A is complete,
  // B is the start of the paraphrase ending in a dotted blank, and both labels
  // are an UPPERCASE letter with a closing parenthesis.
  const { lead, items } = parseTaskBody(
    "Sentence A: Scholars highlight workshops, which demonstrate a trade network.\n" +
      "Sentence B: Workshops ..........\n" +
      "Rewrite sentence B so that it means the same as sentence A.",
    "Rewrite sentence B so that it means the same as sentence A.",
    "REWRITE"
  );
  assert.deepEqual(lead, []);
  assert.deepEqual(items.map((i) => i.label), ["A)", "B)"]);
  assert.equal(items.length, 2);
  assert.match(items[0].text, /^Scholars highlight workshops/);
  // B is a stem: the dots are stripped and the renderers re-draw the leader.
  assert.equal(items[1].text, "Workshops");
  assert.equal(items[1].gap, true);
});

test("a rephrasing pair is reprinted in the fixed A) form whatever the model emitted", () => {
  const instruction = "Rewrite sentence B so that it means the same as sentence A.";
  for (const prompt of [
    "A) One idea here.\nB) The same idea ..........",
    "A. One idea here.\nB. The same idea ..........",
    "A: One idea here.\nB: The same idea ..........",
  ]) {
    const { items } = parseTaskBody(prompt, instruction);
    assert.deepEqual(items.map((i) => i.label), ["A)", "B)"], prompt);
    assert.deepEqual(items.map((i) => i.text), ["One idea here.", "The same idea"]);
    assert.equal(items[1].gap, true, prompt);
  }
});

test("a grammar prompt with no A/B pair still uses the generic letters", () => {
  const { items } = parseTaskBody(
    "1. Technology helps students learn faster.\n2. Schools change quickly.",
    "Rewrite sentence B so that it means the same as sentence A."
  );
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)"]);
});

test("a lead-in still wins when prefixed items follow it", () => {
  const { lead, items } = parseTaskBody("Match each idea.\n1. One\n2. Two");
  assert.deepEqual(lead, ["Match each idea."]);
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)"]);
});

test("numbered items inside a blank-line block still split", () => {
  const { items } = parseTaskBody("1. First thing.\n2. Second thing.\n\n1. Third thing.");
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)", "c)"]);
});

test("referent items keep their paragraph reference when unprefixed", () => {
  const { items } = parseTaskBody(
    'Who does "they" refer to?\nWho does "it" refer to in that example (§2)?'
  );
  assert.equal(items.length, 2);
  assert.equal(items[1].ref, "(§2)");
});

test("a repeated field-label list without blank lines is still one item per entry", () => {
  // The same morphology shape as above, but the generator omitted the blank
  // lines. It must NOT collapse into a single exercise: "Word:" opens a
  // question and "Derived form:" completes it.
  const { items } = parseTaskBody(
    "Word: excavation\nDerived form: \nWord: collaborative\nDerived form: \nWord: linked\nDerived form: "
  );
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)", "c)"]);
  assert.match(items[1].text, /^Word: collaborative/);
  assert.match(items[1].text, /Derived form:/);
});

test("a markdown table skeleton is not mistaken for field/value pairs", () => {
  // Captured live: "Base Word | Derived Form\n--- | ---\ncommunal | communalism".
  const { items } = parseTaskBody("Base Word | Derived Form\n--- | ---\ncommunal | communalism");
  assert.equal(items.length, 2, "the header and the data row");
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)"]);
});
