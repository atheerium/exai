import { test } from "node:test";
import assert from "node:assert/strict";
import { getGuide } from "../../data/guides";
import {
  generateText,
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
  const long = generateText(ctx({ length: 250 }), 0);
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
