import { test } from "node:test";
import assert from "node:assert/strict";
import { getGuide, GUIDES } from "../../data/guides";
import { candidateCount } from "./candidates";
import { isBlankCell, tableKindFromHeaders } from "@/lib/export/tables";
import { extractWordBank } from "@/lib/export/paper";
import { countSentences, gapCount, hasClusteredGaps } from "@/lib/export/gaps";
import { validateCandidate } from "./index";
import {
  generateText,
  generateTextCandidates,
  generatePartOne,
  generateTextExploration,
  generateWriting,
  textAlternatives,
  taskAlternatives,
  topicAlternatives,
  generateRewriteCandidates,
  countWords,
  type MockContext,
} from "./mock";

function ctx(overrides: Partial<MockContext> = {}): MockContext {
  return {
    grade: "3as",
    unit: "Education, teaching and learning",
    topic: "The future of education",
    length: 150,
    guide: getGuide("3as"),
    themeKey: "school",
    seed: "exam123:3as:u-education:The future of education",
    ...overrides,
  };
}

test("generateText produces a passage near the requested length", () => {
  const short = generateText(ctx({ length: 150 }), 0);
  const long = generateText(ctx({ length: 200 }), 0);
  assert.ok(short.words >= 125 && short.words <= 200, `short words ${short.words}`);
  assert.ok(long.words >= 200, `long words ${long.words}`);
  assert.ok(short.title.includes("Future"));
  assert.ok(short.text.length > 100);
});

test("generateText variants differ (alternatives are not identical)", () => {
  const a = generateText(ctx(), 0);
  const b = generateText(ctx(), 1);
  const c = generateText(ctx(), 2);
  const bodies = [a.text, b.text, c.text];
  assert.equal(new Set(bodies).size, 3, "all three variant texts should differ");
});

test("generateText is split into 3-5 paragraphs", () => {
  for (const variant of [0, 1, 2]) {
    const t = generateText(ctx(), variant);
    const paragraphs = t.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    assert.ok(paragraphs.length >= 3 && paragraphs.length <= 5, `expected 3-5 paragraphs, got ${paragraphs.length}`);
    for (const p of paragraphs) assert.ok(p.length > 0, "paragraphs must not be empty");
  }
});

test("generateTextCandidates each carry a source citation", () => {
  const cands = generateTextCandidates(ctx());
  assert.equal(cands.length, candidateCount());
  for (const c of cands) {
    assert.ok(c.title.length > 0);
    assert.ok(c.text.length > 0);
    assert.ok(c.source, "every candidate must carry a source");
    assert.ok(c.source!.title.length > 0);
  }
});

test("difficulty 'simpler' shortens and 'harder' lengthens the passage", () => {
  const base = generateText(ctx(), 0);
  const simpler = generateText(ctx({ difficulty: "simpler" }), 0);
  const harder = generateText(ctx({ difficulty: "harder" }), 0);
  assert.ok(
    countWords(simpler.text) <= countWords(base.text) + 2,
    `simpler should not be longer: ${countWords(simpler.text)} vs ${countWords(base.text)}`
  );
  assert.ok(
    countWords(harder.text) >= countWords(base.text),
    `harder should not be shorter: ${countWords(harder.text)} vs ${countWords(base.text)}`
  );
});

test("textAlternatives returns requested count", () => {
  assert.equal(textAlternatives(ctx(), 3).length, 3);
});

test("generatePartOne yields tasks totalling the guide's partOne marks with prompts and instructions", () => {
  for (const variant of [0, 1, 2]) {
    const g = ctx();
    const tasks = generatePartOne(g, variant);
    assert.equal(tasks.length, g.guide.partOne.length);
    assert.ok(Math.abs(tasks.reduce((s, t) => s + t.marks, 0) - g.guide.marks.partOne) < 1e-9);
    for (const t of tasks) {
      assert.ok(t.prompt.length > 0);
      assert.ok(t.instruction.length > 0);
      assert.ok(t.marks > 0);
    }
  }
});

test("generateTextExploration covers all five skills and totals the guide's textExploration marks", () => {
  for (const variant of [0, 1, 2]) {
    const g = ctx();
    const tasks = generateTextExploration(g, variant);
    assert.equal(tasks.length, 5);
    const skills = new Set(tasks.map((t) => t.skill));
    assert.deepEqual(
      [...skills].sort(),
      ["DISCOURSE", "GRAMMAR", "MORPHOLOGY", "PHONOLOGY", "VOCABULARY"]
    );
    assert.ok(Math.abs(tasks.reduce((s, t) => s + t.marks, 0) - g.guide.marks.textExploration) < 1e-9);
  }
});

test("generateWriting produces guided (with keywords) and free (without) topics", () => {
  for (const variant of [0, 1, 2]) {
    const g = ctx();
    const result = generateWriting(g, variant);
    const { guided, free } = result;
    assert.equal(guided.kind, "GUIDED");
    assert.ok(guided.keywords && guided.keywords.includes("/"), "guided topic must have slash keywords");
    assert.ok(guided.situation.length > 20);
    if (free) {
      assert.equal(free.kind, "FREE");
      assert.equal(guided.marks, g.guide.writing.marks);
      assert.equal(free.marks, g.guide.writing.marks);
      assert.ok(!free.keywords, "free topic must not carry keywords");
      assert.ok(free.situation.length > 20);
    }
  }
});

test("taskAlternatives and topicAlternatives return N candidate sets", () => {
  assert.equal(taskAlternatives(ctx(), "PART_ONE", 3).length, 3);
  assert.equal(taskAlternatives(ctx(), "TEXT_EXPLORATION", 3).length, 3);
  assert.equal(topicAlternatives(ctx(), 3).length, 3);
});

test("rewrite simplifies or hardens the passage (US-023)", () => {
  const base = generateText(ctx(), 0).text;

  const simpler = generateRewriteCandidates(ctx(), { text: base, title: "T", target: "simpler" });
  assert.equal(simpler.length, 3);
  for (const c of simpler) {
    assert.ok(c.text.length > 50);
    assert.notEqual(c.text, base, "simpler output must differ");
    assert.ok(countWords(c.text) <= countWords(base) + 2, `simpler not shorter: ${countWords(c.text)} vs ${countWords(base)}`);
  }

  const harder = generateRewriteCandidates(ctx(), { text: base, title: "T", target: "harder" });
  assert.equal(harder.length, 3);
  for (const c of harder) {
    assert.notEqual(c.text, base, "harder output must differ");
    assert.ok(countWords(c.text) >= countWords(base), `harder not longer: ${countWords(c.text)} vs ${countWords(base)}`);
  }
});

test("rewrite is deterministic for a fixed seed and variant", () => {
  const base = generateText(ctx(), 0).text;
  const a = generateRewriteCandidates(ctx(), { text: base, target: "simpler" });
  const b = generateRewriteCandidates(ctx(), { text: base, target: "simpler" });
  assert.deepEqual(a, b);
});

test("generation is deterministic for a fixed seed and variant", () => {
  const a = generateText(ctx(), 0);
  const b = generateText(ctx(), 0);
  assert.equal(a.text, b.text);
  const p1a = generatePartOne(ctx(), 0);
  const p1b = generatePartOne(ctx(), 0);
  assert.deepEqual(p1a, p1b);
});

test("BEM middle school (4am) generates singleTopic writing with full 6 marks", () => {
  const bemGuide = getGuide("4am");
  assert.equal(bemGuide.structure, "bem");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const { guided, free } = generateWriting(g, 0);
  assert.equal(guided.kind, "GUIDED");
  assert.equal(guided.marks, 6);
  assert.equal(free, null);
  assert.ok(guided.keywords && guided.keywords.includes("/"), "BEM guided topic must have slash keywords");
  assert.ok(guided.situation.length > 20);
});

test("BEM writing candidates all have free: null", () => {
  const bemGuide = getGuide("4am");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const cands = [generateWriting(g, 0), ...topicAlternatives(g, 2)];
  assert.equal(cands.length, 3);
  for (const c of cands) {
    assert.equal(c.free, null);
    assert.equal(c.guided.kind, "GUIDED");
    assert.equal(c.guided.marks, 6);
  }
});

test("BEM text exploration heading is 'B. Mastery of Language' and totals 7", () => {
  const bemGuide = getGuide("4am");
  assert.equal(bemGuide.textExploration.heading, "B. Mastery of Language");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const tasks = generateTextExploration(g, 0);
  assert.equal(tasks.length, 5);
  const total = tasks.reduce((s, t) => s + t.marks, 0);
  assert.ok(Math.abs(total - 7) < 1e-9, `BEM textExploration total should be 7, got ${total}`);
});

test("BEM partOne rules produce exactly 7 marks", () => {
  const bemGuide = getGuide("4am");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const tasks = generatePartOne(g, 0);
  const total = tasks.reduce((s, t) => s + t.marks, 0);
  assert.ok(Math.abs(total - 7) < 1e-9, `BEM partOne total should be 7, got ${total}`);
});

test("Bac secondary (2as) generates two writing topics (guided + free)", () => {
  const bacGuide = getGuide("2as");
  assert.equal(bacGuide.structure, "bac");
  const g = ctx({ grade: "2as", guide: bacGuide, seed: "exam-bac:2as:u-signs:Fashion" });
  const result = generateWriting(g, 0);
  assert.equal(result.guided.kind, "GUIDED");
  assert.ok(result.free !== null, "Bac should produce a free topic");
  if (result.free) {
    assert.equal(result.free.kind, "FREE");
    assert.equal(result.guided.marks, bacGuide.writing.marks);
    assert.equal(result.free.marks, bacGuide.writing.marks);
  }
});

test("PartOneRule enhanced fields: exactWording, itemCount, tableRequired are populated", () => {
  const bemGuide = getGuide("4am");
  for (const rule of bemGuide.partOne) {
    assert.ok(rule.exactWording && rule.exactWording.length > 0, `rule ${rule.family} missing exactWording`);
    assert.ok(typeof rule.itemCount === "number" && rule.itemCount > 0, `rule ${rule.family} missing itemCount`);
    assert.ok(typeof rule.tableRequired === "boolean", `rule ${rule.family} missing tableRequired`);
  }
  const bacGuide = getGuide("2as");
  for (const rule of bacGuide.partOne) {
    assert.ok(rule.exactWording && rule.exactWording.length > 0, `rule ${rule.family} missing exactWording`);
    assert.ok(typeof rule.itemCount === "number" && rule.itemCount > 0, `rule ${rule.family} missing itemCount`);
    assert.ok(typeof rule.tableRequired === "boolean", `rule ${rule.family} missing tableRequired`);
  }
});

test("generatePartOnePrimary uses exactWording for instruction", () => {
  const bemGuide = getGuide("4am");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const tasks = generatePartOne(g, 0);
  for (const task of tasks) {
    const rule = bemGuide.partOne.find((r) => r.family === task.family);
    assert.ok(rule, `rule for ${task.family} not found`);
    const expectedInstruction = rule.exactWording ?? rule.instruction;
    assert.equal(task.instruction, expectedInstruction, `task ${task.family} instruction should match exactWording`);
  }
});

test("generatePartOnePrimary generates correct itemCount for each task family", () => {
  const bemGuide = getGuide("4am");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const tasks = generatePartOne(g, 0);
  for (const task of tasks) {
    const rule = bemGuide.partOne.find((r) => r.family === task.family);
    assert.ok(rule, `rule for ${task.family} not found`);
    const expectedCount = rule.itemCount;
    if (task.family === "QUESTIONS") {
      const questionLines = task.prompt.split("\n").filter((l) => l.trim().match(/^\d+\./));
      assert.equal(questionLines.length, expectedCount, `QUESTIONS should have ${expectedCount} items`);
    } else if (task.family === "TRUE_FALSE") {
      const statementLines = task.prompt.split("\n").filter((l) => l.trim().match(/^\d+\./));
      assert.equal(statementLines.length, expectedCount, `TRUE_FALSE should have ${expectedCount} items`);
    } else if (task.family === "PARAGRAPH_ID") {
      const ideaLines = task.prompt.split("\n").filter((l) => l.trim().match(/^[A-Z]\./));
      assert.equal(ideaLines.length, expectedCount, `PARAGRAPH_ID should have ${expectedCount} items`);
    } else if (task.family === "COHESIVE_MARKERS") {
      const wordLines = task.prompt.split("\n").filter((l) => l.trim().match(/^\d+\./));
      assert.equal(wordLines.length, expectedCount, `COHESIVE_MARKERS should have ${expectedCount} items`);
    } else if (task.family === "TITLE_OR_IDEA") {
      assert.equal(expectedCount, 1, `TITLE_OR_IDEA should have 1 item`);
      const lines = task.prompt.split("\n").filter((l) => l.trim());
      const choices = lines.filter((l) => /^\d+[\.\)]/.test(l) || /^[A-Z][\.\)]/.test(l) || /^- /.test(l));
      const counted = choices.length > 0 ? choices.length : lines.length;
      assert.equal(counted, 1, `TITLE_OR_IDEA prompt should count as 1 item, got ${counted}`);
    }
  }
});

test("generatePartOnePrimary generates tables for tableRequired tasks", () => {
  const bemGuide = getGuide("4am");
  const g = ctx({ grade: "4am", guide: bemGuide, seed: "exam-bem:4am:u-family:My family" });
  const tasks = generatePartOne(g, 0);
  for (const task of tasks) {
    const rule = bemGuide.partOne.find((r) => r.family === task.family);
    assert.ok(rule, `rule for ${task.family} not found`);
    if (rule.tableRequired) {
      assert.ok(task.table, `task ${task.family} should have a table`);
      assert.ok(task.table!.headers.length > 0, `table should have headers`);
      assert.ok(task.table!.rows.length > 0, `table should have rows`);
      assert.equal(task.table!.rows.length, rule.itemCount, `table should have ${rule.itemCount} rows`);
    } else {
      assert.ok(!task.table, `task ${task.family} should not have a table`);
    }
  }
});

test("Bac foreign_languages stream has correct itemCounts per stream variant", () => {
  const flGuide = getGuide("2as", "en", "Lettres et Langues Étrangères");
  const trueFalseRule = flGuide.partOne.find((r) => r.family === "TRUE_FALSE");
  const questionsRule = flGuide.partOne.find((r) => r.family === "QUESTIONS");
  const paragraphRule = flGuide.partOne.find((r) => r.family === "PARAGRAPH_ID");
  const cohesiveRule = flGuide.partOne.find((r) => r.family === "COHESIVE_MARKERS");
  const titleRule = flGuide.partOne.find((r) => r.family === "TITLE_OR_IDEA");
  assert.equal(trueFalseRule?.itemCount, 4);
  assert.equal(questionsRule?.itemCount, 4);
  assert.equal(paragraphRule?.itemCount, 4);
  // The referent task always prints THREE options (user format rule,
  // 2026-10-19), on one line. Do not raise this to 4.
  assert.equal(cohesiveRule?.itemCount, 3);
  assert.equal(titleRule?.itemCount, 1);
});

test("Bac literature_philosophy stream has correct itemCounts per stream variant", () => {
  const lpGuide = getGuide("2as", "en", "Lettres et Philosophie");
  const trueFalseRule = lpGuide.partOne.find((r) => r.family === "TRUE_FALSE");
  const questionsRule = lpGuide.partOne.find((r) => r.family === "QUESTIONS");
  const paragraphRule = lpGuide.partOne.find((r) => r.family === "PARAGRAPH_ID");
  const cohesiveRule = lpGuide.partOne.find((r) => r.family === "COHESIVE_MARKERS");
  assert.equal(trueFalseRule?.itemCount, 4);
  assert.equal(questionsRule?.itemCount, 3);
  assert.equal(paragraphRule?.itemCount, 4);
  assert.equal(cohesiveRule?.itemCount, 3);
  assert.ok(!lpGuide.partOne.find((r) => r.family === "TITLE_OR_IDEA"), "literature_philosophy should not have TITLE_OR_IDEA");
});

test("Bac sciences stream has correct itemCounts per stream variant", () => {
  const scGuide = getGuide("2as", "en", "Sciences Expérimentales");
  const trueFalseRule = scGuide.partOne.find((r) => r.family === "TRUE_FALSE");
  const questionsRule = scGuide.partOne.find((r) => r.family === "QUESTIONS");
  const paragraphRule = scGuide.partOne.find((r) => r.family === "PARAGRAPH_ID");
  const cohesiveRule = scGuide.partOne.find((r) => r.family === "COHESIVE_MARKERS");
  assert.equal(trueFalseRule?.itemCount, 4);
  assert.equal(questionsRule?.itemCount, 3);
  assert.equal(paragraphRule?.itemCount, 4);
  assert.equal(cohesiveRule?.itemCount, 3);
  assert.ok(!scGuide.partOne.find((r) => r.family === "TITLE_OR_IDEA"), "sciences should not have TITLE_OR_IDEA");
});

test("tableRequired follows the table allowlist, not the old blanket default", () => {
  // User rule 2026-10-11: tables only for tabular Part Two tasks (morphology,
  // phonology). Part A never carries one; vocabulary and discourse never do.
  const bemGuide = getGuide("4am");
  const skill = (name: string) => bemGuide.textExploration.skills.find((s) => s.skill === name);
  assert.equal(skill("MORPHOLOGY")?.tableRequired, true, "affix tables stay");
  assert.equal(skill("PHONOLOGY")?.tableRequired, true, "classification tables stay");
  assert.equal(skill("VOCABULARY")?.tableRequired, false, "no vocabulary matching chart");
  assert.equal(skill("DISCOURSE")?.tableRequired, false, "no gap-fill chart");
  for (const rule of bemGuide.partOne) {
    assert.equal(rule.tableRequired, false, `Part One ${rule.family} must not require a table`);
  }
});

test("generated tables carry no answers for every grade and variant", () => {
  // The student-facing paper must never ship the answer key inside a table cell.
  //
  // Two printed cells are legitimately non-blank on a derivation chart: row 0 is
  // the SOLVED EXAMPLE the instruction points at ("Complete the chart as shown in
  // the example"), and the column holding the given word in each test row. The
  // dotted lines count as blank: they are a rule to write on, not a value.
  for (const grade of Object.keys(GUIDES)) {
    for (let variant = 0; variant < 3; variant++) {
      const c = ctx({ grade, guide: getGuide(grade), seed: `exam:${grade}:u:t` });
      const tasks = [...generatePartOne(c, variant), ...generateTextExploration(c, variant)];
      for (const task of tasks) {
        if (!task.table) continue;
        const label = `${grade} v${variant} ${task.family ?? task.skill}`;
        const derivation = tableKindFromHeaders(task.table.headers) === "derivation";
        task.table.rows.forEach((row, ri) => {
          if (derivation && ri === 0) return;
          const filled = row.filter((cell) => !isBlankCell(cell));
          assert.ok(
            filled.length <= 1,
            `${label}: at most one given cell per row, got ${JSON.stringify(row)}`
          );
        });
      }
    }
  }
});

test("every generated chart is one of the three official B structures", () => {
  // The mock is the offline test double: if it drifts from the shape the live
  // providers stamp, every test that exercises a validator rule through it
  // silently stops covering that rule.
  const c = ctx({ grade: "2as", guide: getGuide("2as"), seed: "exam:2as:u:t" });
  const charts = generateTextExploration(c, 0).filter((t) => t.table);
  assert.ok(charts.length > 0, "the Part Two section must carry charts");
  for (const task of charts) {
    const kind = tableKindFromHeaders(task.table!.headers);
    assert.ok(kind, `${task.skill} table must match an official structure`);
    assert.equal(task.table!.headers.length, 3, "three equal columns");
    if (kind !== "derivation") {
      // Affix and phonology: exactly ONE empty row to sort into. Students do not
      // write into a multi-row grid on these papers.
      assert.deepEqual(task.table!.rows, [["", "", ""]], `${task.skill}: one empty row`);
    } else {
      assert.equal(task.table!.rows[0].filter(Boolean).length, 3, "row 0 is the solved example");
    }
  }
});


// --- Passage shape: paragraph count and topic anchoring ---------------------
//
// The mock is the offline test double, so it has to honour the same contract the
// real provider does. If it drifts, every test that exercises the validator via
// the mock silently stops covering the rule.

test("mock passages honour the teacher's paragraph count exactly", () => {
  for (const count of [3, 4] as const) {
    const text = generateText(ctx({ paragraphCount: count }), 0).text;
    const actual = text.split(/\n{2,}/).filter((p) => p.trim()).length;
    assert.equal(actual, count, `asked for ${count} paragraphs`);
  }
});

test("mock passages name their topic in every paragraph", () => {
  // The theme corpus is topic-neutral, so without anchoring three of four
  // paragraphs read as an unrelated essay stapled to the topic.
  const topic = "digital literacy";
  const text = generateText(ctx({ topic }), 0).text;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  assert.ok(paragraphs.length >= 3);
  for (const [i, p] of paragraphs.entries()) {
    assert.match(
      p.toLocaleLowerCase(),
      new RegExp(topic, "i"),
      `paragraph ${i + 1} does not mention the topic`
    );
  }
});

test("mock topic anchoring keeps the passage inside the length band", () => {
  // Anchors add words after the trim, so the trim reserves room for them. This
  // asserts the reservation works rather than trusting the constant.
  for (const count of [3, 4] as const) {
    const text = generateText(ctx({ paragraphCount: count }), 0).text;
    const words = text.split(/\s+/).filter(Boolean).length;
    const max = Math.ceil(150 * 1.2);
    assert.ok(words <= max, `anchored ${count}-paragraph passage has ${words} words, ceiling ${max}`);
  }
});

// --- Gap fill: one word per gap, exactly four (user instruction, 2026-10-19) --

test("every grade's primary GAP_FILL mock carries 4 gaps and 4 unique bank words", () => {
  // The count is the contract the validator enforces: the printed word list
  // carries exactly one word per gap. The mock is the offline test double, so it
  // must honour the same shape the real providers are asked for (a live run
  // printed 3 words above a 4-gap paragraph).
  for (const grade of Object.keys(GUIDES)) {
    const guide = getGuide(grade);
    const c = ctx({ grade, guide, seed: `exam:${grade}:u:t` });
    const tasks = generateTextExploration(c, 0);
    const task = tasks.find((t) => t.skill === "DISCOURSE");
    assert.ok(task, `${grade}: primary DISCOURSE task must exist`);
    const { words, rest } = extractWordBank(task!.prompt);
    assert.equal(words.length, 4, `${grade}: bank must carry 4 words, got ${words.length}`);
    assert.equal(
      new Set(words.map((w) => w.toLowerCase())).size,
      4,
      `${grade}: bank words must be unique, got ${words.join(", ")}`
    );
    assert.equal(gapCount(rest), 4, `${grade}: task must carry 4 gaps, got ${gapCount(rest)}`);
    // The paragraph shape, not just the count (teacher report 2026-10-20):
    // four blanks in a row is still four gaps, so the mock must distribute them
    // through a multi-sentence paragraph like the real providers are asked to.
    assert.equal(hasClusteredGaps(rest), false, `${grade}: gaps must be distributed, not listed`);
    assert.ok(countSentences(rest) >= 2, `${grade}: the gap-fill body must be a multi-sentence paragraph`);
    // And the guide validator accepts exactly the shape the mock produced.
    const v = validateCandidate("TEXT_EXPLORATION", tasks, guide.marks.textExploration, { guide });
    assert.ok(v.ok, `${grade}: ${v.issues.join("; ")}`);
  }
});
