// The gap vocabulary shared by the generator's validator and the three
// renderers. These rules are what make "one word per gap" checkable and what
// decide passage vs lettered-sentences rendering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { gapCount, hasInlineGap, numberGaps, numberedGap } from "./gaps";

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
