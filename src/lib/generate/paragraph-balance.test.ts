// The paragraph-balance floor: a paragraph may be shorter than its neighbours,
// but not so short that it stops being a paragraph.
//
// Fixtures are real shapes, not inventions:
//   - the reported 2026-10-20 passage, 58 / 54 / 16 words, printed as-is and
//     passed every other check;
//   - a teacher's reference paper, 60 / 47 / 50, which must keep passing.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PARAGRAPH_SHARE_OF_AVERAGE,
  checkParagraphBalance,
  minParagraphWords,
  splitPassageParagraphs,
} from "./paragraph-balance";
import { validateCandidate } from "./index";
import { trimPassageToBand } from "./trim";

const sentence = (n: number, words = 19) =>
  `Sentence ${n} develops the point with enough concrete detail that it reads as a real body sentence rather than filler` +
  " and keeps going until the fixture has the length this test needs it to have.".trim();

/** A paragraph of `n` sentences; each source sentence is ~32 words. */
const para = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => sentence(offset + i)).join(" ");

test("minParagraphWords is 55% of the average, rounded up", () => {
  assert.equal(MIN_PARAGRAPH_SHARE_OF_AVERAGE, 0.55);
  assert.equal(minParagraphWords(120, 3), 22); // 40 average -> 22
  assert.equal(minParagraphWords(120, 4), 17); // 30 average -> 16.5 -> 17
  assert.equal(minParagraphWords(0, 3), 0);
  assert.equal(minParagraphWords(120, 0), 0, "no division by zero");
});

test("the reported passage (58 / 54 / 16) is rejected, naming the fragment", () => {
  const text = [
    "Modern advertising constantly seeks to understand what drives consumer choices. The psychology of marketing and persuasion studies how emotions, cognitive biases, and social influence shape our buying habits. Marketers use colour, music, and timing to create an immediate impression that bypasses rational analysis. Research has shown that a simple change in font style can alter perceived trustworthiness within seconds. Such subtle techniques demonstrate how deeply embedded psychological principles are in everyday commercial messages.",
    "One major strategy involves linking a product to a desired identity or lifestyle. When a brand associates itself with adventure, success, or belonging, consumers project those aspirations onto the item. A 2018 study in the Journal of Consumer Research found that shoppers who viewed ads featuring aspirational scenery were willing to pay up to 20% more for the same product. This connection between self-image and purchase intention explains why certain campaigns go viral while others fade quickly.",
    "The consequence of this psychological approach is a market where persuasion is often invisible yet powerful.",
  ].join("\n\n");

  const issues = checkParagraphBalance(text);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!, /Paragraph 3 is a fragment/);
  assert.match(issues[0]!, /at least \d+/);
});

test("a real exam's uneven but developed paragraphs (60 / 47 / 50) pass", () => {
  const text = [
    "Ethical employees are those who make decisions in the best interest of their employers, co-workers and outside stakeholders in addition to themselves. Workplace ethics centre on such diverse issues as discrimination, fraud, theft and harassment. Although all people are intrinsically valuable, ethical employees can actually be more financially valuable to their employers, and more valued by co-workers and peers.",
    "Understanding how ethics can make you a better person in the workplace is a solid starting point for a commitment to always doing the right thing. Therefore, gaining the trust of your co-workers can enhance your productivity by making it easier for you to communicate and work with others in the workplace.",
    "Employees who spread distrust can meet resistance when seeking help from others, but trusted co-workers can always find a helping hand. Gaining the trust of their managers can open doors for new responsibilities at work, possibly leading to promotions and pay raises.",
  ].join("\n\n");
  assert.deepEqual(checkParagraphBalance(text), []);
});

test("splitting matches the validator's paragraph definition", () => {
  assert.deepEqual(splitPassageParagraphs(" a \n\n b \n\n\n c \n"), ["a", "b", "c"]);
  assert.deepEqual(splitPassageParagraphs(""), []);
});

test("validateCandidate('TEXT') fails on the fragment and passes once it is developed", () => {
  const opts = { length: 120, paragraphCount: 3 };
  const fragment = [
    "One major strategy involves linking a product to a desired identity or lifestyle and then letting the buyer project those aspirations onto the item they are about to purchase.",
    "A 2018 study in the Journal of Consumer Research found that shoppers who viewed ads featuring aspirational scenery were willing to pay up to twenty percent more for the same product.",
    "Persuasion is often invisible.",
  ].join("\n\n");

  const before = validateCandidate("TEXT", { title: "T", text: fragment }, undefined, opts);
  assert.ok(!before.ok, "the fragment must be rejected");
  assert.ok(before.issues.some((i) => /Paragraph 3 is a fragment/.test(i)), before.issues.join("; "));

  const developed = [
    "One major strategy involves linking a product to a desired identity or lifestyle and then letting the buyer project those aspirations onto the item they are about to purchase.",
    "A 2018 study in the Journal of Consumer Research found that shoppers who viewed ads featuring aspirational scenery were willing to pay up to twenty percent more for the same product.",
    "Persuasion is often invisible. Yet it shapes the price a shopper accepts, the brand they remember, and the story they tell afterwards about why the purchase was worth it.",
  ].join("\n\n");

  const after = validateCandidate("TEXT", { title: "T", text: developed }, undefined, opts);
  assert.deepEqual(after.issues.filter((i) => /fragment/.test(i)), []);
});

test("the trim never strands a paragraph at fragment length", () => {
  // The only multi-sentence paragraph is the last one. A trim that ignored the
  // floor could cut it away while the earlier paragraphs stay long; the output
  // must always satisfy the balance rule it is trimmed under.
  const longSentence = para(3, 10);
  const text = [longSentence, para(3, 20), para(3, 30)].join("\n\n");

  const r = trimPassageToBand(text, { length: 120 });
  assert.deepEqual(checkParagraphBalance(r.text), [], "trim output must stay balanced");
  assert.equal(splitPassageParagraphs(r.text).length, 3, "trim must not change the paragraph count");
});

test("a balanced over-length passage trims into the band without fragmenting", () => {
  const text = [para(5, 0), para(5, 10), para(5, 20)].join("\n\n");
  const r = trimPassageToBand(text, { length: 120 });
  assert.equal(r.trimmed, true);
  assert.deepEqual(checkParagraphBalance(r.text), []);
  const words = r.wordsAfter;
  assert.ok(words >= 96 && words <= 144, `trimmed to ${words}, outside the 96-144 band`);
});
