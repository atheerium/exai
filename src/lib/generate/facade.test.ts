import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext,
  generateTextCandidates,
  generatePartOneCandidates,
  generateTextExplorationCandidates,
  generateWritingCandidates,
  generateRewriteCandidates,
  validateCandidate,
} from "./index";

const input = {
  level: "secondary",
  grade: "3as",
  stream: "Lettres et Langues Étrangères",
  length: 200,
  unit: "u-ancient",
  topic: "Ancient civilisations",
  examId: "exam-1",
};

test("buildContext resolves a valid generation context", () => {
  const ctx = buildContext(input);
  assert.equal(ctx.guide.key, "3as");
  assert.equal(ctx.length, 200);
  assert.equal(ctx.themeKey, "culture");
  assert.ok(ctx.seed.includes("exam-1"));
});

test("generateTextCandidates returns a primary plus alternatives", async () => {
  const candidates = await generateTextCandidates(buildContext(input));
  assert.equal(candidates.length, 3);
  assert.ok(candidates[0].text.length > 100);
  for (const c of candidates) {
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generatePartOneCandidates yields 3 valid task sets", async () => {
  const ctx = buildContext(input);
  const sets = await generatePartOneCandidates(ctx);
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const v = validateCandidate("PART_ONE", set, ctx.guide.marks.partOne);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generateTextExplorationCandidates yields 3 valid sets", async () => {
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generateWritingCandidates yields 3 valid writing pairs", async () => {
  const pairs = await generateWritingCandidates(buildContext(input));
  assert.equal(pairs.length, 3);
  for (const p of pairs) {
    const v = validateCandidate("WRITING", p);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generateRewriteCandidates yields valid text candidates", async () => {
  const ctx = buildContext(input);
  const base = await generateTextCandidates(ctx);
  const rewritten = await generateRewriteCandidates(ctx, {
    text: base[0].text,
    title: base[0].title,
    target: "harder",
  });
  assert.equal(rewritten.length, 3);
  for (const c of rewritten) {
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("validateCandidate rejects malformed payloads", () => {
  assert.equal(validateCandidate("TEXT", { title: "x", text: "short" }).ok, false);
  assert.equal(validateCandidate("TEXT", { title: "", text: "" }).ok, false);

  const badMarks = validateCandidate("PART_ONE", [{ prompt: "p", instruction: "i", marks: 1 }]);
  assert.equal(badMarks.ok, false);
  assert.match(badMarks.issues[0], /marks total/);

  const empty = validateCandidate("TEXT_EXPLORATION", []);
  assert.equal(empty.ok, false);

  const noTopics = validateCandidate("WRITING", { guided: null, free: null });
  assert.equal(noTopics.ok, false);
});

test("validateCandidate with singleTopic accepts guided-only writing", () => {
  const ok = validateCandidate("WRITING", { guided: { kind: "GUIDED", title: "T", situation: "S", instruction: "I", form: "a letter", marks: 6 }, free: null }, 6, { singleTopic: true });
  assert.equal(ok.ok, true, ok.issues.join("; "));
});

test("validateCandidate with singleTopic rejects missing guided", () => {
  const bad = validateCandidate("WRITING", { guided: null, free: null }, 6, { singleTopic: true });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.includes("writing topic")));
});

test("validateCandidate without singleTopic still requires both topics", () => {
  const bad = validateCandidate("WRITING", { guided: { kind: "GUIDED", title: "T", situation: "S", instruction: "I", form: "a letter", marks: 3 }, free: null });
  assert.equal(bad.ok, false);
});

const bemInput = {
  level: "middle",
  grade: "4am",
  length: 120,
  unit: "u-family",
  topic: "My family",
  examId: "exam-bem-1",
};

test("BEM generation through facade: marks 7/7/6, single writing topic", async () => {
  const ctx = buildContext(bemInput);
  assert.equal(ctx.guide.structure, "bem");
  assert.equal(ctx.guide.marks.partOne, 7);
  assert.equal(ctx.guide.marks.textExploration, 7);
  assert.equal(ctx.guide.marks.writing, 6);

  const p1Sets = await generatePartOneCandidates(ctx);
  assert.equal(p1Sets.length, 3);
  for (const set of p1Sets) {
    const v = validateCandidate("PART_ONE", set, 7);
    assert.ok(v.ok, v.issues.join("; "));
  }

  const teSets = await generateTextExplorationCandidates(ctx);
  assert.equal(teSets.length, 3);
  for (const set of teSets) {
    const v = validateCandidate("TEXT_EXPLORATION", set, 7);
    assert.ok(v.ok, v.issues.join("; "));
  }

  const wSets = await generateWritingCandidates(ctx);
  assert.equal(wSets.length, 3);
  for (const p of wSets) {
    const v = validateCandidate("WRITING", p, 6, { singleTopic: true });
    assert.ok(v.ok, v.issues.join("; "));
    assert.equal(p.free, null, "BEM writing should have no free topic");
    assert.equal(p.guided.kind, "GUIDED");
    assert.equal(p.guided.marks, 6);
  }
});
