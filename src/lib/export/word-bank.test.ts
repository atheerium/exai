// Word banks must never be printed as questions.
//
// Teacher report (2026-10-13), on GAP_FILL ("Fill in the gaps with words from
// the list given"):
//
//   5. Fill in the gaps with words from the list given.
//
//   a) List: ["brain's", "scarcity", "ethical", "researchers", "manipulation"]
//   b) _____ have discovered that the way messages are framed can ...
//   c) This effect illustrates how emotional triggers and perceived _____ ...
//   d) It also raises _____ questions about consumer autonomy.
//
// Two faults in one: the bank became question a) (so the letters all shifted),
// and the raw JSON array printed on the paper. The model chose that shape
// because NOTHING in the prompt ever specified one -- it had produced
// `researcher - eating - intake` on other runs. So the parser, not the prompt,
// is what guarantees the fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWordBank, parseTaskBody } from "./paper";

/** The exact prompt from the report. */
const REPORTED =
  'List: ["brain\'s", "scarcity", "ethical", "researchers", "manipulation"]\n' +
  "_____ have discovered that the way messages are framed can dramatically shape consumer choices.\n" +
  "This effect illustrates how emotional triggers and perceived _____ work together.\n" +
  "It also raises _____ questions about consumer autonomy.";

const BANK = ["brain's", "scarcity", "ethical", "researchers", "manipulation"];

test("the reported JSON bank is extracted, not lettered", () => {
  const { words, rest } = extractWordBank(REPORTED);
  assert.deepEqual(words, BANK);
  assert.doesNotMatch(rest, /brain's/, "the bank line must be gone from the prompt");
});

test("the three sentences become a), b), c) — the bank is not question a)", () => {
  const { rest } = extractWordBank(REPORTED);
  const { items } = parseTaskBody(rest);
  assert.equal(items.length, 3, "one item per sentence, not four");
  assert.deepEqual(items.map((i) => i.label), ["a)", "b)", "c)"]);
  assert.match(items[0].text, /have discovered/);
  assert.doesNotMatch(items[0].text, /List:/);
});

test("no JSON punctuation reaches the paper", () => {
  const { rest } = extractWordBank(REPORTED);
  const { lead, items } = parseTaskBody(rest);
  const printed = [...lead, ...items.map((i) => i.text)].join("\n");
  assert.doesNotMatch(printed, /[\[\]"]/);
});

test("gaps survive extraction", () => {
  const { rest } = extractWordBank(REPORTED);
  const { items } = parseTaskBody(rest);
  // `_____` is a leading blank, not a trailing one, so `GAP` (which anchors at
  // the end of the line) does not strip it and the student keeps the marker.
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => !/^\s*$/.test(i.text)));
});

// ---- The other shapes the model has produced ------------------------------

test("the hyphen shape still works", () => {
  const { words, rest } = extractWordBank(
    "researcher - eating - intake\nResearchers need to eat well."
  );
  assert.deepEqual(words, ["researcher", "eating", "intake"]);
  assert.doesNotMatch(rest, /researcher - eating/);
});

test("apostrophes are allowed in a hyphen bank", () => {
  // `brain's` failed the old ASCII-only matcher, which is one of the three
  // reasons the reported line was not recognised as a bank.
  const { words } = extractWordBank("brain's - scarcity - ethics");
  assert.deepEqual(words, ["brain's", "scarcity", "ethics"]);
});

test("an unbracketed prefixed list works", () => {
  const { words } = extractWordBank("List: because, and, when, but\nA ___ B");
  assert.deepEqual(words, ["because", "and", "when", "but"]);
});

test("Words: and Word bank: prefixes work too", () => {
  assert.deepEqual(extractWordBank("Words: [one, two, three]").words, ["one", "two", "three"]);
  assert.deepEqual(extractWordBank("Word bank: [one, two, three]").words, ["one", "two", "three"]);
});

test("unquoted bracketed lists work", () => {
  assert.deepEqual(extractWordBank("List: [one, two, three]").words, ["one", "two", "three"]);
});

test("only the first bank is taken", () => {
  const { words } = extractWordBank("List: [a, b, c]\nList: [d, e, f]");
  assert.deepEqual(words, ["a", "b", "c"]);
});

// ---- What must NOT be mistaken for a bank ---------------------------------

test("a sentence containing commas is never swallowed", () => {
  const prompt = "The archaeologists, working in teams, mapped the site carefully.";
  const { words, rest } = extractWordBank(prompt);
  assert.deepEqual(words, []);
  assert.equal(rest, prompt);
});

test("a one-word line is not a bank", () => {
  // "Word: excavation" is a morphology field label. Treating it as a bank would
  // DELETE a real line from the paper.
  const { words, rest } = extractWordBank("Word: excavation\nDerived form: ______");
  assert.deepEqual(words, []);
  assert.match(rest, /excavation/);
});

test("an intra-word hyphen list is left alone", () => {
  // `well-being - state-of-the-art` is indistinguishable from a separator, so it
  // is not guessed at.
  const { words } = extractWordBank("well-being - open-minded - far-reaching");
  assert.deepEqual(words, []);
});

test("a bank just below the top is still found", () => {
  // The model puts the bank after the sentences sometimes too. Extracting it
  // there still beats printing `a) List: [...]`.
  const { words } = extractWordBank("A ___ B\nList: [a, b, c]");
  assert.deepEqual(words, ["a", "b", "c"]);
});

test("a list past the scan window is left alone", () => {
  // Four leading non-empty lines: the bank is now deep in the prompt and belongs
  // to whatever item it sits in.
  const { words } = extractWordBank("One\nTwo\nThree\nList: [a, b, c]");
  assert.deepEqual(words, []);
});

test("an empty prompt yields no bank and does not throw", () => {
  assert.deepEqual(extractWordBank("").words, []);
});
// ---- Placement and the block contract --------------------------------------

test("the bank is part of the task, not a separate block", async () => {
  // It has to be: the official paper puts the words between the instruction and
  // the sentences, which is unreachable for a top-level block emitted after the
  // whole task. Three surfaces previously disagreed about this — the bank printed
  // in the PDF and the preview and nowhere at all in the DOCX.
  const { buildPaper } = await import("./paper");
  const { assembleDocument } = await import("./assemble");
  const doc = assembleDocument({
    id: "e1",
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
    sections: [
      {
        id: "s1",
        type: "TEXT_EXPLORATION",
        order: 0,
        heading: "B/ Text exploration.",
        marksLabel: "(07 pts)",
        candidates: [],
        text: null,
        tasks: [
          {
            id: "t1",
            family: "GAP_FILL",
            skill: "DISCOURSE",
            instruction: "Fill in the gaps with words from the list given.",
            prompt: REPORTED,
            answer: "",
            marks: 1,
          },
        ],
        topics: [],
      },
    ],
    sources: [],
    lastOpenedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as any);

  const blocks = buildPaper(doc).blocks;
  // Written as a string comparison on purpose: `b.kind === "wordList"` no longer
  // compiles, because the kind is gone from the union. That is the guarantee --
  // there is no block left for a renderer to forget.
  assert.ok(
    !blocks.map((b) => String(b.kind)).includes("wordList"),
    "the standalone block must not come back"
  );
  const task = blocks.find((b) => b.kind === "task");
  assert.ok(task && task.kind === "task");
  assert.deepEqual(task.task.wordList, BANK);
  // The bank must not also survive as a lead line or an item, or it prints twice.
  assert.deepEqual(task.task.lead, []);
  assert.equal(task.task.items.length, 3);
});
