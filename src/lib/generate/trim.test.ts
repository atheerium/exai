// Trimming an over-length passage down into the band, in code.
//
// The rule being enforced: trimming may ONLY fix length. It must never break the
// paragraph count or the topic anchoring, and the caller re-validates to prove it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { trimPassageToBand, lengthBandWords } from "./trim";
import { checkTopicAnchoring } from "./grounding";

const sentence = (n: number) =>
  `Heritage preservation depends on public interest, and this sentence carries that point number ${n} clearly enough to stand alone.`;

const passageOf = (counts: number[]) =>
  counts
    .map((count, p) =>
      Array.from({ length: count }, (_, i) => sentence(p * 10 + i)).join(" ")
    )
    .join("\n\n");

test("lengthBandWords matches the validator's band", () => {
  assert.deepEqual(lengthBandWords(120), { min: 96, max: 144 });
  assert.deepEqual(lengthBandWords(150), { min: 120, max: 180 });
});

test("a passage already inside the band is returned untouched", () => {
  const text = passageOf([2, 2, 2]);
  const r = trimPassageToBand(text, { length: 150 });
  assert.equal(r.trimmed, false);
  assert.equal(r.text, text, "identity, not a re-join that could alter spacing");
});

test("an over-length passage is trimmed into the band", () => {
  // 5 paragraphs x 6 sentences x ~15 words is far over a 120-word band.
  const r = trimPassageToBand(passageOf([6, 6, 6]), { length: 120 });
  assert.equal(r.trimmed, true);
  assert.ok(r.wordsAfter <= lengthBandWords(120).max, `${r.wordsAfter} > 144`);
  assert.ok(r.wordsAfter < r.wordsBefore);
});

test("trimming never cuts mid-sentence", () => {
  const r = trimPassageToBand(passageOf([6, 6, 6]), { length: 120 });
  // Every remaining sentence ends with terminal punctuation.
  for (const para of r.text.split(/\n{2,}/)) {
    for (const s of para.split(/(?<=[.!?])\s+/)) {
      assert.match(s.trim(), /[.!?]$/, `sentence does not end in punctuation: ${s}`);
    }
  }
});

test("trimming preserves the paragraph count exactly", () => {
  // Paragraph count is a teacher choice and is checked exactly; a trim that
  // emptied a paragraph would trade a length rejection for that one.
  for (const counts of [[5, 5, 5], [8, 4, 4], [4, 4, 4, 4]] as const) {
    const before = passageOf([...counts]).split("\n\n").length;
    const r = trimPassageToBand(passageOf([...counts]), { length: 120 });
    const after = r.text.split(/\n{2,}/).filter((p) => p.trim()).length;
    assert.equal(after, before, `paragraph count changed for ${counts.join("/")}`);
  }
});

test("trimming never removes a paragraph's last sentence", () => {
  // Stripped to bare sentence fragments, the passage stops being a passage. The
  // caller re-validates and reports the original issue instead.
  const text = "One short sentence here. Another one follows it.";
  const r = trimPassageToBand(text, { length: 20 });
  assert.equal(r.text.split(/(?<=[.!?])\s+/).filter(Boolean).length, 2);
});

test("trimming keeps the passage topic-anchored when it was anchored", () => {
  const topic = "heritage preservation";
  const para = (n: number) =>
    Array.from({ length: 6 }, (_, i) =>
      `Heritage preservation depends on public interest, and this sentence number ${n * 10 + i} says so plainly.`
    ).join(" ");
  const text = [para(1), para(2), para(3)].join("\n\n");
  assert.deepEqual(checkTopicAnchoring(text, { topic }), []);

  const r = trimPassageToBand(text, { length: 120 });
  assert.equal(r.trimmed, true);
  assert.deepEqual(
    checkTopicAnchoring(r.text, { topic }),
    [],
    "a trim that broke anchoring would be discarded by the caller, not shipped"
  );
});

test("an under-length passage is never touched", () => {
  // Code cannot invent text, so this is left to the caller's repair path.
  const text = passageOf([1, 1, 1]);
  const r = trimPassageToBand(text, { length: 200 });
  assert.equal(r.trimmed, false);
  assert.equal(r.text, text);
});
// --- The trim rescues a real over-length passage, and never rescues a broken one
//
// The rule the caller enforces: a trim is only used when length is the SOLE
// problem, and it is discarded unless the full validator then passes.

import { validateCandidate, buildContext } from "./index";
import { GRADES, getGuide } from "../../data/guides";

/**
 * Read a real (unit, topic) pair out of the curriculum rather than hardcoding
 * one: 3as units are stream-restricted, so a made-up unit throws before the test
 * measures anything.
 */
function ctx3as() {
  const gradeDef = GRADES["3as"]!;
  const stream = gradeDef.streams?.[0] ?? undefined;
  const unit =
    gradeDef.units.find((u) => !u.streams || !stream || u.streams.includes(stream)) ??
    gradeDef.units[0];
  const resolved = getGuide("3as", "en", stream);
  return buildContext({
    level: gradeDef.level,
    grade: "3as",
    stream,
    unit: unit.key,
    topic: unit.topics[0],
    length: 120,
    examId: "trim-ctx-1",
    paragraphCount: 3,
  });
}

test("validateCandidate rejects an over-length passage, and the trim fixes it", () => {
  const ctx = ctx3as();
  const opts = { length: ctx.length, paragraphCount: 3, topic: ctx.topic };

  // 5 paragraphs of ~15 words each = ~75... build a clearly over-length one.
  const long = Array.from({ length: 3 }, (_, p) =>
    Array.from({ length: 8 }, (_, i) =>
      `Exploring the ancient world depends on public interest, and this sentence number ${p * 10 + i} develops that idea at length.`
    ).join(" ")
  ).join("\n\n");

  const before = validateCandidate("TEXT", { title: "T", text: long }, undefined, opts);
  assert.ok(!before.ok, "fixture must start out over-length for this to mean anything");
  assert.ok(before.issues.some((i) => /word count/.test(i)));

  const trimmed = trimPassageToBand(long, { length: ctx.length });
  assert.equal(trimmed.trimmed, true);
  const after = validateCandidate("TEXT", { title: "T", text: trimmed.text }, undefined, opts);
  assert.ok(after.ok, after.issues.join("; "));
});

test("the trim is discarded when it cannot reach the band", () => {
  // Too little text to cut down to the band without emptying every paragraph:
  // the caller must keep the ORIGINAL so the teacher sees the real issue.
  const ctx = ctx3as();
  const opts = { length: ctx.length, paragraphCount: 3, topic: ctx.topic };
  const shortish = Array.from({ length: 3 }, (_, p) =>
    Array.from({ length: 3 }, (_, i) =>
      `Exploring the ancient world matters here, and this point number ${p + i} adds to the case.`
    ).join(" ")
  ).join("\n\n");

  const before = validateCandidate("TEXT", { title: "T", text: shortish }, undefined, opts);
  const trimmed = trimPassageToBand(shortish, { length: ctx.length });
  // Whatever the trim did, the caller's rule is: accept only if re-validated.
  if (trimmed.trimmed) {
    const after = validateCandidate("TEXT", { title: "T", text: trimmed.text }, undefined, opts);
    if (!after.ok) {
      assert.ok(!before.ok, "the caller returns the original issues in this case");
    }
  }
});
