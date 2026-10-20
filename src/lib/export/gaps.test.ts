// The gap vocabulary shared by the generator's validator and the three
// renderers. These rules are what make "one word per gap" checkable and what
// decide passage vs lettered-sentences rendering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { countSentences, gapCount, hasClusteredGaps, hasInlineGap, numberGaps, numberedGap } from "./gaps";

test("gapCount counts underscore and dot gaps", () => {
  assert.equal(gapCount("A good friend is honest ___ kind."), 1);
  assert.equal(gapCount("First ___ second ... third"), 2);
  assert.equal(gapCount("a ___ b ___ c ___ d ___"), 4);
  assert.equal(gapCount("no gaps here"), 0);
  assert.equal(gapCount(""), 0);
});

test("a single underscore or two dots is not a gap", () => {
  // The marker must be unambiguous; `_` and `..` occur in ordinary text.
  assert.equal(gapCount("snake_case_name"), 0);
  assert.equal(gapCount("wait.. what"), 0);
});

test("hasInlineGap separates a passage from a list of sentences", () => {
  // A passage: the gap sits between words.
  assert.equal(hasInlineGap("A good friend is honest ___ kind."), true);
  assert.equal(hasInlineGap("_____ have discovered that framing shapes choices."), true);
  // A list: every gap ends its line.
  assert.equal(hasInlineGap("Friends are honest ___\nFamilies share duties ___"), false);
  assert.equal(
    hasInlineGap("A good friend is honest ___ kind.\n___ they respect differences, they work together."),
    true
  );
});

test("a trailing gap followed by punctuation is still trailing", () => {
  // Otherwise every sentence-final gap would read as a passage.
  assert.equal(hasInlineGap("Friends are honest ___."), false);
  assert.equal(hasInlineGap("Families share duties ___,"), false);
  assert.equal(hasInlineGap("Friends are honest ___"), false);
});

test("hasClusteredGaps rejects blanks separated only by punctuation", () => {
  // The reported live shape: four blanks in a row inside one sentence.
  assert.equal(hasClusteredGaps("The text studies how ___, ___, ___, ___ shape our habits."), true);
  assert.equal(hasClusteredGaps("The text studies how ___ ___ ___ ___ shape our habits."), true);
  // Legacy dots behave the same way.
  assert.equal(hasClusteredGaps("how ..., ..., ..., ... shape habits"), true);
  // A distributed paragraph is fine, including a gap at a sentence start.
  assert.equal(
    hasClusteredGaps(
      "A good friend is honest ___ kind. ___ they respect differences, classmates work together. ___ mistakes happen, forgiveness keeps the relationship strong."
    ),
    false
  );
  // A sentence boundary between two gaps is not a cluster: each gap still sits
  // inside its own sentence.
  assert.equal(hasClusteredGaps("Teams respect rules ___. ___ they break them, trust suffers."), false);
  assert.equal(hasClusteredGaps("no gaps here"), false);
});

test("countSentences counts the paragraph, not the gaps", () => {
  assert.equal(countSentences("The text studies how ___, ___, ___, ___ shape our habits."), 1);
  assert.equal(countSentences("First ___. Second ___. Third ___."), 3);
  // Ellipsis gaps are not sentence boundaries.
  assert.equal(countSentences("First ... second ..."), 1);
  assert.equal(countSentences("First ... second. Third ..."), 2);
  // A text without a final terminator still counts its last fragment.
  assert.equal(countSentences("no punctuation here"), 1);
  assert.equal(countSentences(""), 0);
});

test("numberGaps prints the numbered blank in reading order, across lines", () => {
  assert.equal(numberedGap(1), ".........(1) .........");
  const numbered = numberGaps("a ___ b ___ c\nsecond paragraph ___");
  assert.equal(
    numbered,
    "a .........(1) ......... b .........(2) ......... c\nsecond paragraph .........(3) ........."
  );
});

test("numberGaps leaves text with no gap untouched", () => {
  assert.equal(numberGaps("no gaps here"), "no gaps here");
});
