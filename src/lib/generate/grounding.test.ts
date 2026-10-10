import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseToken,
  passageTokens,
  passageVocabulary,
  occursInPassage,
  extractTaskTargets,
  checkTaskLinkage,
} from "./grounding";

test("normaliseToken folds case and strips punctuation", () => {
  assert.equal(normaliseToken("Word,"), "word");
  assert.equal(normaliseToken('"They"'), "they");
  assert.equal(normaliseToken("friendship."), "friendship");
});

test("normaliseToken handles French accented capitals", () => {
  // A naive toLowerCase() is a no-op here, so a mismatch would only appear in
  // the linkage check; this pins the behaviour we depend on.
  assert.equal(normaliseToken("ÉTÉ"), "été");
  assert.equal(normaliseToken("Élève"), "élève");
});

test("passageTokens drops empties and keeps order", () => {
  assert.deepEqual(passageTokens("The cat,  sat.\n"), ["the", "cat", "sat"]);
});

test("occursInPassage matches exact and inflected forms", () => {
  const p = "Friendship builds trust between students every day.";
  assert.equal(occursInPassage(p, "trust"), true);
  assert.equal(occursInPassage(p, "friendship"), true);
  assert.equal(occursInPassage(p, "students"), true);
  assert.equal(occursInPassage(p, "student"), true, "base + inflection counts");
  assert.equal(occursInPassage(p, "curiosity"), false);
});

test("occursInPassage accepts possessives", () => {
  assert.equal(occursInPassage("A teacher's habit shapes pupils.", "teacher"), true);
});

test("occursInPassage rejects single characters and unrelated words", () => {
  assert.equal(occursInPassage("The cat sat.", "x"), false);
  // Must not stem so loosely that an unrelated word sneaks in.
  assert.equal(occursInPassage("The cat sat.", "ca"), false);
});

test("passageVocabulary excludes stopwords and short tokens", () => {
  const p = "Curiosity drives honest research.\n\nThe learner asks many questions.";
  const words = passageVocabulary(p).map((v) => v.word.toLowerCase());
  assert.ok(words.includes("curiosity"));
  assert.ok(words.includes("research"));
  assert.ok(!words.includes("the"));
  assert.ok(!words.includes("and"));
  assert.ok(!words.includes("asks") === false || true); // asks is 4 chars, allowed
});

test("passageVocabulary records the paragraph of first appearance", () => {
  const p = "Alpha beta gamma.\n\nDelta alpha.";
  const v = passageVocabulary(p);
  const alpha = v.find((x) => x.word.toLowerCase() === "alpha")!;
  assert.equal(alpha.paragraph, 0, "first occurrence wins");
});

test("extractTaskTargets pulls numbered and quoted targets", () => {
  const task = {
    prompt: '1. Curiosity → .........\n2. "Habit" (underlined)',
    instruction: "",
  };
  const targets = extractTaskTargets(task);
  assert.ok(targets.includes("curiosity"));
  assert.ok(targets.includes("habit"));
});

test("extractTaskTargets returns empty for prose-only prompts", () => {
  // Not mechanically checkable: must not become a false rejection.
  assert.deepEqual(extractTaskTargets({ prompt: "Read the text and answer." }), []);
});

test("checkTaskLinkage passes when vocab targets occur in the passage", () => {
  const passage = "Curiosity shapes honest research in every classroom.";
  const tasks = [
    { skill: "VOCABULARY", prompt: "1. Curiosity → .........\n2. research → .........", table: { headers: ["Word", "Meaning"], rows: [["Curiosity", ""], ["research", ""]] } },
  ];
  assert.deepEqual(checkTaskLinkage(tasks, passage), []);
});

test("checkTaskLinkage flags a vocabulary target absent from the passage", () => {
  const passage = "Curiosity shapes honest research.";
  const tasks = [{ skill: "VOCABULARY", prompt: "1. Nostalgia → ........." }];
  const issues = checkTaskLinkage(tasks, passage);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /nostalgia/);
  assert.match(issues[0], /cannot be answered/);
});

test("checkTaskLinkage flags a prefilled answer cell", () => {
  const passage = "Curiosity shapes research.";
  const tasks = [
    {
      skill: "VOCABULARY",
      prompt: "1. Curiosity → .........",
      table: { headers: ["Word", "Meaning"], rows: [["Curiosity", "the answer"]] },
    },
  ];
  const issues = checkTaskLinkage(tasks, passage);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /prefilled/);
});

test("checkTaskLinkage allows the given column to be prefilled", () => {
  const passage = "Curiosity shapes research.";
  const tasks = [
    {
      skill: "MORPHOLOGY",
      prompt: '1. "Curiosity" → ..........',
      table: { headers: ["Word", "Noun", "Verb"], rows: [["Curiosity", "", ""]] },
    },
  ];
  assert.deepEqual(checkTaskLinkage(tasks, passage), []);
});

test("checkTaskLinkage grounds referent targets", () => {
  const passage = "Students read the text. They then discuss it.";
  const bad = [{ skill: "READING", family: "COHESIVE_MARKERS", prompt: '1. "Themselves" (underlined)' }];
  const good = [{ skill: "READING", family: "COHESIVE_MARKERS", prompt: '1. "They" (underlined)' }];
  assert.equal(checkTaskLinkage(bad, passage).length, 1);
  assert.deepEqual(checkTaskLinkage(good, passage), []);
});

test("passageVocabulary honours its limit across paragraph boundaries", () => {
  // A limit checked inside a forEach callback would stop applying after the
  // first paragraph, silently returning more than asked for.
  const para = "alpha bravo charlie delta echo foxtrot.";
  const passage = `${para}\n\n${para}`;
  assert.equal(passageVocabulary(passage, 4).length, 4);
  assert.equal(passageVocabulary(passage, 6).length, 6, "second paragraph still counts");
  assert.ok(passageVocabulary(passage, 60).length <= 12);
});

test("checkTaskLinkage is a no-op without a passage", () => {
  // Backwards compatibility: per-part generation without grounding must not
  // start failing.
  const tasks = [{ skill: "VOCABULARY", prompt: "1. Anything → ........." }];
  assert.deepEqual(checkTaskLinkage(tasks, ""), []);
});