import { DEFAULT_CANDIDATES } from "./provider";
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWordBank } from "@/lib/export/paper";
import { gapCount } from "@/lib/export/gaps";
import {
  buildContext,
  generateTextCandidates,
  generatePartOneCandidates,
  generateTextExplorationCandidates,
  generateWritingCandidates,
  generateRewriteCandidates,
  validateCandidate,
  DEFAULT_PARAGRAPH_COUNT,
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
  assert.equal(candidates.length, DEFAULT_CANDIDATES);
  assert.ok(candidates[0].text.length > 100);
  for (const c of candidates) {
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generatePartOneCandidates yields 3 valid task sets", async () => {
  const ctx = buildContext(input);
  const sets = await generatePartOneCandidates(ctx);
  assert.equal(sets.length, DEFAULT_CANDIDATES);
  for (const set of sets) {
    const v = validateCandidate("PART_ONE", set, ctx.guide.marks.partOne);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("generateTextExplorationCandidates yields 3 valid sets", async () => {
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  assert.equal(sets.length, DEFAULT_CANDIDATES);
  for (const set of sets) {
    const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("the rephrasing task is a labelled stem pair and passes the guide validator", async () => {
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  for (const set of sets) {
    const rewrite = set.find((t) => t.family === "REWRITE");
    assert.ok(rewrite, "the mock must produce a REWRITE task");
    assert.match(rewrite!.prompt, /^A\) .+\nB\) .*\.{3,}$/m);
    const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration, { guide: ctx.guide });
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("the guide validator rejects a rephrasing task whose B is already complete", async () => {
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  const set = structuredClone(sets[0]!);
  const rewrite = set.find((t) => t.family === "REWRITE")!;
  rewrite.prompt = "A) One idea here.\nB) The same idea, finished.";
  const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration, { guide: ctx.guide });
  assert.equal(v.ok, false);
  assert.match(v.issues.join(" "), /dotted blank/);
});

// --- Gap fill: one word per gap (user instruction, 2026-10-19) --------------

test("the guide validator enforces one word per gap in a GAP_FILL list", async () => {
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  const set = structuredClone(sets[0]!);
  const gap = set.find((t) => t.skill === "DISCOURSE")!;
  const rest = extractWordBank(gap.prompt).rest;
  assert.equal(gapCount(rest), 4, "the mock's gap-fill task carries 4 gaps");

  // A 4-word list over 4 gaps is accepted.
  const good = structuredClone(set);
  good.find((t) => t.skill === "DISCOURSE")!.prompt = `List: [alpha, bravo, charlie, delta]\n${rest}`;
  const ok = validateCandidate("TEXT_EXPLORATION", good, ctx.guide.marks.textExploration, { guide: ctx.guide });
  assert.ok(ok.ok, ok.issues.join("; "));

  // A 3-word list over 4 gaps fails: the list must carry one word per gap.
  const short = structuredClone(set);
  short.find((t) => t.skill === "DISCOURSE")!.prompt = `List: [alpha, bravo, charlie]\n${rest}`;
  const bad = validateCandidate("TEXT_EXPLORATION", short, ctx.guide.marks.textExploration, { guide: ctx.guide });
  assert.equal(bad.ok, false);
  assert.match(bad.issues.join(" "), /one word per gap/);
});

test("the guide validator rejects a repeated word in a GAP_FILL list", async () => {
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  const set = structuredClone(sets[0]!);
  const gap = set.find((t) => t.skill === "DISCOURSE")!;
  const rest = extractWordBank(gap.prompt).rest;
  gap.prompt = `List: [alpha, alpha, charlie, delta]\n${rest}`;
  const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration, { guide: ctx.guide });
  assert.equal(v.ok, false);
  assert.match(v.issues.join(" "), /only once/);
});

test("the guide validator rejects gaps listed one after another in one sentence", async () => {
  // Reported live 2026-10-20: "The psychology ... studies how ___, ___, ___,
  // ___ shape our buying habits." Four gaps, four words, and still not a
  // gap-fill task: the student sees a list of blanks, not a paragraph.
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  const set = structuredClone(sets[0]!);
  const gap = set.find((t) => t.skill === "DISCOURSE")!;
  gap.prompt = `List: [alpha, bravo, charlie, delta]\nThe text studies how ___, ___, ___, ___ shape our habits.`;
  const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration, { guide: ctx.guide });
  assert.equal(v.ok, false);
  assert.match(v.issues.join(" "), /next to each other/);
  assert.match(v.issues.join(" "), /at least two sentences/);
});

test("the guide validator accepts distributed gaps through a paragraph", async () => {
  // The shape the rule asks for: every gap inside its own phrase, three
  // sentences, no two blanks adjacent.
  const ctx = buildContext(input);
  const sets = await generateTextExplorationCandidates(ctx);
  const set = structuredClone(sets[0]!);
  const gap = set.find((t) => t.skill === "DISCOURSE")!;
  gap.prompt =
    `List: [involved, consequences, obey, professional]\n` +
    `Ethical behaviour can improve your ___ and social success. A good citizen should consider the ___ of their actions, ___ laws and be respectful. By being morally ___, you encourage others to do the same.`;
  const v = validateCandidate("TEXT_EXPLORATION", set, ctx.guide.marks.textExploration, { guide: ctx.guide });
  assert.ok(v.ok, v.issues.join("; "));
});

test("generateWritingCandidates yields 3 valid writing pairs", async () => {
  const pairs = await generateWritingCandidates(buildContext(input));
  assert.equal(pairs.length, DEFAULT_CANDIDATES);
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
  assert.equal(p1Sets.length, DEFAULT_CANDIDATES);
  for (const set of p1Sets) {
    const v = validateCandidate("PART_ONE", set, 7);
    assert.ok(v.ok, v.issues.join("; "));
  }

  const teSets = await generateTextExplorationCandidates(ctx);
  assert.equal(teSets.length, DEFAULT_CANDIDATES);
  for (const set of teSets) {
    const v = validateCandidate("TEXT_EXPLORATION", set, 7);
    assert.ok(v.ok, v.issues.join("; "));
  }

  const wSets = await generateWritingCandidates(ctx);
  assert.equal(wSets.length, DEFAULT_CANDIDATES);
  for (const p of wSets) {
    const v = validateCandidate("WRITING", p, 6, { singleTopic: true });
    assert.ok(v.ok, v.issues.join("; "));
    assert.equal(p.free, null, "BEM writing should have no free topic");
    assert.equal(p.guided.kind, "GUIDED");
    assert.equal(p.guided.marks, 6);
  }
});


// --- Paragraph count and topic anchoring at the validator boundary ---------
//
// Teacher instruction, 2026-10-11: the passage is "around 3 to 4 paragraphs,
// chosen by the teacher, default 3".

const ON_TOPIC = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Heritage preservation depends on public interest, and this paragraph makes that point number ${i + 1} at some length.`
  ).join("\n\n");

test("buildContext normalises the teacher paragraph choice", () => {
  assert.equal(buildContext({ ...input, paragraphCount: 4 }).paragraphCount, 4);
  assert.equal(buildContext({ ...input, paragraphCount: 3 }).paragraphCount, 3);
  assert.equal(buildContext(input).paragraphCount, DEFAULT_PARAGRAPH_COUNT);
  // 5 is not an offered option: silently clamping a teacher's explicit choice
  // would be worse than telling them the option does not exist, so the default
  // is used and the validator reports the mismatch rather than passing it.
  assert.equal(buildContext({ ...input, paragraphCount: 5 }).paragraphCount, DEFAULT_PARAGRAPH_COUNT);
});

test("validateCandidate rejects the wrong paragraph count exactly", () => {
  const ok = validateCandidate("TEXT", { title: "T", text: ON_TOPIC(3) }, undefined, {
    paragraphCount: 3,
  });
  assert.ok(ok.ok, ok.issues.join("; "));

  const wrong = validateCandidate("TEXT", { title: "T", text: ON_TOPIC(4) }, undefined, {
    paragraphCount: 3,
  });
  assert.ok(!wrong.ok);
  assert.match(wrong.issues.join(" "), /4 paragraph\(s\) instead of 3/);
});

test("validateCandidate does NOT fail a passage for topicality", () => {
  // Topicality and cohesion are ADVISORY (logged, not enforced). Two mechanical
  // attempts rejected good passages, including one held together by pronoun
  // chains. A drifted-but-coherent passage still produces a usable exam and the
  // teacher is the final reviewer. Asserting the ABSENCE of enforcement means a
  // future change cannot quietly re-add it without tripping here.
  const drifted = [
    "Advertising shapes what young readers consider normal in almost every market they walk through.",
    "Traditional music in the Algerian south relies on rhythms passed down orally through generations.",
    "Tourists who visit the old towns often hear those rhythms without ever learning their names.",
  ].join("\n\n");

  const v = validateCandidate("TEXT", { title: "T", text: drifted }, undefined, {
    paragraphCount: 3,
    topic: "advertising",
  });
  assert.ok(v.ok, "advisories must not become failures: " + v.issues.join("; "));
});

test("validateCandidate still fails a passage on what is exactly computable", () => {
  // The contrast with the test above: word count and paragraph count are hard
  // rules, so an off-shape passage IS rejected.
  const two = "Heritage preservation depends on public interest, and this sentence makes that point clearly. ".repeat(2);
  const wrongCount = validateCandidate("TEXT", { title: "T", text: two }, undefined, { paragraphCount: 3 });
  assert.ok(!wrongCount.ok);
  assert.match(wrongCount.issues.join(" "), /paragraph\(s\) instead of 3/);

  const tooLong = "word ".repeat(400);
  const wrongWords = validateCandidate("TEXT", { title: "T", text: tooLong }, undefined, { length: 120 });
  assert.ok(!wrongWords.ok);
  assert.match(wrongWords.issues.join(" "), /word count/);
});

test("validateCandidate accepts an on-topic passage", () => {
  const v = validateCandidate("TEXT", { title: "T", text: ON_TOPIC(3) }, undefined, {
    paragraphCount: 3,
    topic: "heritage",
  });
  assert.ok(v.ok, v.issues.join("; "));
});

test("paragraph count is unchecked when the caller does not ask for it", () => {
  // REWRITE and alternatives have no teacher paragraph choice, so an exact-count
  // rule must not start failing them.
  const v = validateCandidate("TEXT", { title: "T", text: ON_TOPIC(5) });
  assert.ok(v.ok, v.issues.join("; "));
});

test("validateCandidate rejects a task with an empty prompt", () => {
  // An empty prompt passes every other check and prints as a blank question.
  // Seen live: the model answered morphology with {word, derivedForm}, so
  // `prompt` arrived as "".
  const v = validateCandidate("PART_ONE", [
    { prompt: "", instruction: "i", answer: "a", marks: 7, skill: "READING", family: "TRUE_FALSE" },
  ], 7);
  assert.ok(!v.ok);
  assert.match(v.issues.join(" "), /Task 1 has no content/);
});
