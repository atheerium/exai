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
  length: 250,
  unit: "u-innovation",
  topic: "Artificial intelligence",
  examId: "exam-1",
};

test("buildContext resolves a valid generation context", () => {
  const ctx = buildContext(input);
  assert.equal(ctx.guide.key, "3as");
  assert.equal(ctx.length, 250);
  assert.equal(ctx.themeKey, "technology");
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

test("generatePartOneCandidates yields 3 valid task sets (7 marks each)", async () => {
  const sets = await generatePartOneCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const v = validateCandidate("PART_ONE", set);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generateTextExplorationCandidates yields 3 valid sets (8 marks each)", async () => {
  const sets = await generateTextExplorationCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const v = validateCandidate("TEXT_EXPLORATION", set);
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
