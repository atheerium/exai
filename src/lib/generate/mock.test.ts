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

test("generatePartOne yields 4 tasks totalling 7 marks with prompts and instructions", () => {
  for (const variant of [0, 1, 2]) {
    const tasks = generatePartOne(ctx(), variant);
    assert.equal(tasks.length, 4);
    assert.ok(Math.abs(tasks.reduce((s, t) => s + t.marks, 0) - 7) < 1e-9);
    for (const t of tasks) {
      assert.ok(t.prompt.length > 0);
      assert.ok(t.instruction.length > 0);
      assert.ok(t.marks > 0);
    }
  }
});

test("generateTextExploration covers all five skills and totals 8 marks", () => {
  for (const variant of [0, 1, 2]) {
    const tasks = generateTextExploration(ctx(), variant);
    assert.equal(tasks.length, 5);
    const skills = new Set(tasks.map((t) => t.skill));
    assert.deepEqual(
      [...skills].sort(),
      ["DISCOURSE", "GRAMMAR", "MORPHOLOGY", "PHONOLOGY", "VOCABULARY"]
    );
    assert.ok(Math.abs(tasks.reduce((s, t) => s + t.marks, 0) - 8) < 1e-9);
  }
});

test("generateWriting produces guided (with keywords) and free (without) topics", () => {
  for (const variant of [0, 1, 2]) {
    const { guided, free } = generateWriting(ctx(), variant);
    assert.equal(guided.kind, "GUIDED");
    assert.equal(free.kind, "FREE");
    assert.equal(guided.marks, 5);
    assert.equal(free.marks, 5);
    assert.ok(guided.keywords && guided.keywords.includes("/"), "guided topic must have slash keywords");
    assert.ok(!free.keywords, "free topic must not carry keywords");
    assert.ok(guided.situation.length > 20);
    assert.ok(free.situation.length > 20);
  }
});

test("taskAlternatives and topicAlternatives return N candidate sets", () => {
  assert.equal(taskAlternatives(ctx(), "PART_ONE", 3).length, 3);
  assert.equal(taskAlternatives(ctx(), "TEXT_EXPLORATION", 3).length, 3);
  assert.equal(topicAlternatives(ctx(), 3).length, 3);
});

test("generation is deterministic for a fixed seed and variant", () => {
  const a = generateText(ctx(), 0);
  const b = generateText(ctx(), 0);
  assert.equal(a.text, b.text);
  const p1a = generatePartOne(ctx(), 0);
  const p1b = generatePartOne(ctx(), 0);
  assert.deepEqual(p1a, p1b);
});
