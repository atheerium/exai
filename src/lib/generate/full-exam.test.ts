import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFullExam, FULL_EXAM_QUOTA_COST } from "./full-exam";
import { occursInPassage, extractTaskTargets } from "./grounding";
import { GRADES, GUIDES, getGuide } from "@/data/guides";
import type { GeneratedTask } from "@/types";

/** A valid (grade, unit, topic, length) tuple, read from the curriculum. */
function paramsFor(grade: string, examId: string) {
  const gradeDef = GRADES[grade]!;
  const guide = getGuide(grade, "en")!;
  const stream = gradeDef.streams?.[0] ?? undefined;
  // Units can be stream-restricted, so pick one valid for the resolved stream
  // rather than assuming units[0] applies.
  const unit =
    gradeDef.units.find((u) => !u.streams || !stream || u.streams.includes(stream)) ??
    gradeDef.units[0];
  // Marks are stream-dependent: getGuide must be called with the same stream
  // the exam will use, or the expectation is computed against a different
  // guide than the generator resolves.
  const resolved = getGuide(grade, "en", stream);
  return {
    level: gradeDef.level,
    grade,
    unit: unit.key,
    topic: unit.topics[0],
    length: resolved.defaultLength,
    stream,
    examId,
    singleTopic: resolved.structure === "bem",
  };
}

const BASE = {
  ...paramsFor("3as", "exam-fixed-1"),
};

test("full exam produces all four sections with correct per-guide marks", async () => {
  const r = await generateFullExam(BASE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const guide = getGuide("3as", "en", BASE.stream)!;
  const p1 = r.partOne![0].reduce((s, t) => s + t.marks, 0);
  const p2 = r.textExploration![0].reduce((s, t) => s + t.marks, 0);
  assert.equal(p1, guide.marks.partOne);
  assert.equal(p2, guide.marks.textExploration);
  assert.ok(r.text!.text.length > 0);
  assert.ok(r.writing!.length > 0);
});

test("vocabulary and morphology targets occur in the generated passage", async () => {
  const r = await generateFullExam(BASE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const passage = r.text!.text;
  for (const task of r.textExploration![0]) {
    const skill = (task.skill ?? "").toUpperCase();
    if (skill !== "VOCABULARY" && skill !== "MORPHOLOGY") continue;
    for (const target of extractTaskTargets(task)) {
      assert.ok(
        occursInPassage(passage, target),
        `${skill} target "${target}" is not in the passage`
      );
    }
  }
});

test("referent targets occur in the generated passage", async () => {
  const r = await generateFullExam(BASE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const passage = r.text!.text;
  for (const task of r.partOne![0]) {
    if ((task.family ?? "").toUpperCase().includes("COHESIVE")) {
      for (const target of extractTaskTargets(task)) {
        assert.ok(occursInPassage(passage, target), `referent "${target}" missing`);
      }
    }
  }
});

test("answer cells in task tables are empty", async () => {
  const r = await generateFullExam(BASE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const all = [...r.partOne![0], ...r.textExploration![0]];
  for (const task of all) {
    if (!task.table) continue;
    task.table.rows.forEach((row) => {
      row.slice(1).forEach((cell) => assert.equal(cell.trim(), "", "answer cell prefilled"));
    });
  }
});

test("generation is deterministic for the same exam id and config", async () => {
  const a = await generateFullExam(BASE);
  const b = await generateFullExam(BASE);
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.text!.text, b.text!.text);
  assert.deepEqual(
    a.partOne![0].map((t: GeneratedTask) => t.prompt),
    b.partOne![0].map((t: GeneratedTask) => t.prompt)
  );
});

test("a different exam id yields different passage material", async () => {
  const a = await generateFullExam(BASE);
  const b = await generateFullExam({ ...BASE, examId: "exam-fixed-2" });
  assert.equal(a.ok && b.ok, true);
  // Seeded on examId, so the passage differs; this guards against the
  // grounding refactor accidentally collapsing everything to one fixed text.
  assert.notEqual(a.text!.text, b.text!.text);
});

test("BEM guides produce one writing topic", async () => {
  // Take unit/topic/length from the curriculum rather than hardcoding: a unit
  // key that is not valid for a grade's stream throws, and the catalog is the
  // only source of truth for what is valid.
  const r = await generateFullExam({ ...paramsFor("1am", "bem-1"), singleTopic: true });
  assert.equal(getGuide("1am", "en")!.structure, "bem", "1am should be a BEM guide");
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(r.writing![0].singleTopic, true);
  assert.ok(r.writing![0].guided);
});

test("BAC and BEM both run clean across every grade", async () => {
  for (const grade of Object.keys(GRADES)) {
    const r = await generateFullExam(paramsFor(grade, `all-${grade}`));
    assert.equal(r.ok, true, `${grade}: ${JSON.stringify(r.issues)}`);
  }
});

test("every guide is reachable through paramsFor (no dead grade)", () => {
  // Guards the helper itself: if a grade has no resolvable unit the loop above
  // would silently cover fewer grades than exist.
  assert.equal(Object.keys(GRADES).length, 7);
  for (const grade of Object.keys(GRADES)) {
    const p = paramsFor(grade, "x");
    assert.ok(p.unit && p.topic, `${grade} has no unit/topic`);
  }
  assert.ok(Object.keys(GUIDES).length >= 7);
});

test("grounded vocabulary answers are never a restatement of the prompt", async () => {
  // Regression guard: the first grounding implementation emitted
  // "1. curiosity" as the answer to "give the meaning of curiosity", which
  // looks answered but teaches nothing.
  const r = await generateFullExam(BASE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const vocab = r.textExploration![0].filter((t) => (t.skill ?? "").toUpperCase() === "VOCABULARY");
  assert.ok(vocab.length > 0);
  for (const task of vocab) {
    const answers = (task.answer ?? "").split("\n");
    assert.ok(answers.length > 0, "vocabulary task has an answer key");
    for (const line of answers) {
      const m = line.match(/^\s*\d+\.\s*(\S+)\s*=\s*(.+)$/);
      assert.ok(m, `answer line should be "word = meaning", got: ${line}`);
      const [, word, meaning] = m;
      assert.notEqual(
        meaning.trim().toLowerCase(),
        word.toLowerCase(),
        "answer must not merely restate the target word"
      );
    }
  }
});

test("grounded morphology rows all come from the passage", async () => {
  const r = await generateFullExam(BASE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const passage = r.text!.text;
  const morph = r.textExploration![0].filter((t) => (t.skill ?? "").toUpperCase() === "MORPHOLOGY");
  assert.ok(morph.length > 0);
  for (const task of morph) {
    for (const target of extractTaskTargets(task)) {
      assert.ok(occursInPassage(passage, target), `${target} missing from passage`);
    }
    // Every row has a real family, not blank derived forms.
    for (const line of (task.answer ?? "").split("\n")) {
      assert.doesNotMatch(line, /noun\s*,\s*verb\s*$/, "morphology answer has empty forms");
    }
  }
});

test("quota cost equals the number of provider calls", () => {
  assert.equal(FULL_EXAM_QUOTA_COST, 4);
});