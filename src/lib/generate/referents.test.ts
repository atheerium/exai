import { test } from "node:test";
import assert from "node:assert/strict";
import { isReferentWord, isRepetitionAvoiding, locateReferent, pickReferents, paragraphIndexOf, referentCategories, REFERENT_WORDS } from "./referents";

// A referent target must be able to stand in for a noun phrase. Content words
// ("honest", "trust", "curiosity") have no such antecedent, so the official
// paper never uses them in the "underlined words refer to" task.
test("isReferentWord accepts the pronouns and determiners listed in the guide", () => {
  for (const word of ["they", "it", "which", "them", "these", "who", "he", "she", "we", "those", "him", "her", "us", "this", "that", "whose", "whom", "what"]) {
    assert.equal(isReferentWord(word), true, `${word} should be a valid referent`);
  }
});

test("referentCategories classifies each pronoun type", () => {
  assert.ok(referentCategories("they").includes("personal"));
  assert.ok(referentCategories("these").includes("demonstrative"));
  assert.ok(referentCategories("whom").includes("relative"));
  assert.ok(referentCategories("what").includes("interrogative"));
  assert.ok(referentCategories("themselves").includes("reflexive"));
  assert.ok(referentCategories("their").includes("possessive"));
});

test("referentCategories reports every class a word belongs to", () => {
  const classes = referentCategories("that");
  assert.ok(classes.includes("demonstrative"));
  assert.ok(classes.includes("relative"));
});

test("referentCategories returns nothing for a content word", () => {
  assert.deepEqual(referentCategories("honest"), []);
  assert.deepEqual(referentCategories("school"), []);
});

test("isReferentWord accepts repetition-avoiding substitutes", () => {
  for (const word of ["also", "too", "such", "one", "ones", "the same", "the former", "the latter", "another", "the others"]) {
    assert.equal(isReferentWord(word), true, `${word} should be accepted as a substitute referent`);
  }
});

test("isRepetitionAvoiding excludes subordinators that point forward", () => {
  // "such as" introduces examples rather than substituting for an earlier
  // noun phrase, so it cannot be the answer to a referent question.
  assert.equal(isRepetitionAvoiding("such as"), false);
  assert.equal(isRepetitionAvoiding("the same as"), false);
  assert.equal(isReferentWord("such as"), false);
  // Bare "such" remains a valid demonstrative substitute.
  assert.equal(isRepetitionAvoiding("such"), true);
});

test("isRepetitionAvoiding separates substitutes from pronouns", () => {
  assert.equal(isRepetitionAvoiding("the former"), true);
  assert.equal(isRepetitionAvoiding("also"), true);
  assert.equal(isRepetitionAvoiding("they"), false);
  assert.equal(isRepetitionAvoiding("which"), false);
});

test("pickReferents can return a multi-word substitute", () => {
  const passage = "Pupils chose the former and the latter. They also revised. It worked.";
  const picked = pickReferents(passage, 4);
  assert.ok(picked.length > 0);
  for (const word of picked) {
    assert.equal(isReferentWord(word), true, `${word} is not a valid referent`);
    assert.ok(passage.toLowerCase().includes(word), `${word} is not in the passage`);
  }
});

test("isReferentWord rejects content words and adjectives", () => {
  for (const word of ["honest", "trust", "curiosity", "motivated", "organise", "school", "meal", "friend"]) {
    assert.equal(isReferentWord(word), false, `${word} must not be a referent target`);
  }
});

test("isReferentWord is case and whitespace insensitive", () => {
  assert.equal(isReferentWord("  They  "), true);
  assert.equal(isReferentWord("THEY"), true);
});

test("isReferentWord rejects single letters and empty input", () => {
  assert.equal(isReferentWord("a"), false);
  assert.equal(isReferentWord(""), false);
});

test("REFERENT_WORDS contains no duplicates", () => {
  const all = [...REFERENT_WORDS];
  assert.equal(new Set(all).size, all.length);
});

test("pickReferents returns only referents present in the passage", () => {
  const passage = "Pupils who revise remember their lessons. They also learn that it pays off. Honest effort helps them.";
  const picked = pickReferents(passage, 4);
  assert.ok(picked.length > 0);
  for (const word of picked) {
    assert.equal(isReferentWord(word), true, `${word} is not a referent`);
    assert.ok(passage.toLowerCase().includes(word), `${word} is not in the passage`);
  }
});

test("pickReferents never repeats a word", () => {
  const passage = "They said it. They repeated which was odd. Them and these were clear.";
  const picked = pickReferents(passage, 5);
  assert.equal(new Set(picked).size, picked.length);
});

test("pickReferents honours the requested count", () => {
  const passage = "They said it. We know which one. Them and these were clear. Those are fine.";
  assert.equal(pickReferents(passage, 2).length, 2);
});

test("pickReferents returns an empty list when the passage has no referent", () => {
  assert.deepEqual(pickReferents("Honest effort builds trust.", 3), []);
});

test("paragraphIndexOf reports the one-based paragraph holding the word", () => {
  const passage = "First line here.\n\nSecond line here.\n\nThird line mentions it.";
  assert.equal(paragraphIndexOf(passage, "it"), 2);
  assert.equal(paragraphIndexOf(passage, "first"), 0);
});

test("paragraphIndexOf ignores punctuation around the word", () => {
  const passage = "A tidy notebook helps.\n\nBalance, sport and rest matter.";
  assert.equal(paragraphIndexOf(passage, "balance"), 1);
});

test("paragraphIndexOf returns null for a word absent from the passage", () => {
  const passage = "First line here.\n\nSecond line here.";
  assert.equal(paragraphIndexOf(passage, "missing"), null);
});

test("locateReferent returns the one-based paragraph and the occurrence", () => {
  const passage = "They met.\n\nNothing.\n\nThis mattered to it in the end.";
  assert.deepEqual(locateReferent(passage, "they"), { paragraph: 1, occurrence: 0 });
  assert.deepEqual(locateReferent(passage, "it"), { paragraph: 3, occurrence: 0 });
});

test("locateReferent prefers a paragraph where the word is not sentence-initial", () => {
  const passage = "They spoke.\n\nPeople listened, then they answered.";
  assert.deepEqual(locateReferent(passage, "they"), { paragraph: 2, occurrence: 0 });
});

test("locateReferent counts occurrences within the chosen paragraph", () => {
  const passage = "Something happened.\n\nIt began, then it ended.";
  assert.deepEqual(locateReferent(passage, "it"), { paragraph: 2, occurrence: 1 });
});

test("locateReferent matches a multi-word substitute", () => {
  const passage = "Two plans were offered.\n\nPupils chose the former.";
  assert.deepEqual(locateReferent(passage, "the former"), { paragraph: 2, occurrence: 0 });
});

test("locateReferent returns null for an absent word", () => {
  const passage = "They met.\n\nNothing changed.";
  assert.equal(locateReferent(passage, "it"), null);
});

test("locateReferent accepts a one-letter pronoun", () => {
  // "I" is in REFERENT_WORDS; a minimum length here silently unlinked it.
  const passage = "I began.\n\nThen I stopped.";
  assert.deepEqual(locateReferent(passage, "I"), { paragraph: 2, occurrence: 0 });
});
