import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_COMMENT_LENGTH,
  UNKNOWN_FAMILY,
  feedbackSchema,
  familyKeyFor,
  normaliseComment,
  parseFeedback,
} from "./feedback";

// No test in this file may touch the database or the network. Everything here
// is a pure function over its arguments.

test("familyKeyFor keeps a real family as-is", () => {
  assert.deepEqual(familyKeyFor({ family: "TRUE_FALSE", skill: "COMPREHENSION" }), {
    family: "TRUE_FALSE",
    skill: "COMPREHENSION",
  });
});

test("familyKeyFor falls back to UNKNOWN for a null family instead of throwing", () => {
  assert.deepEqual(familyKeyFor({ family: null, skill: "MORPHOLOGY" }), {
    family: UNKNOWN_FAMILY,
    skill: "MORPHOLOGY",
  });
});

test("familyKeyFor falls back for an empty or whitespace-only family", () => {
  assert.equal(familyKeyFor({ family: "", skill: null }).family, UNKNOWN_FAMILY);
  assert.equal(familyKeyFor({ family: "   ", skill: null }).family, UNKNOWN_FAMILY);
});

test("familyKeyFor tolerates a null or undefined task", () => {
  assert.deepEqual(familyKeyFor(null), { family: UNKNOWN_FAMILY, skill: null });
  assert.deepEqual(familyKeyFor(undefined), { family: UNKNOWN_FAMILY, skill: null });
});

test("familyKeyFor normalises case and internal whitespace so one family is one row", () => {
  assert.equal(familyKeyFor({ family: "true_false" }).family, "TRUE_FALSE");
  assert.equal(familyKeyFor({ family: "COHESIVE MARKERS" }).family, "COHESIVE_MARKERS");
  assert.equal(familyKeyFor({ family: "  questions  " }).family, "QUESTIONS");
  assert.equal(familyKeyFor({ skill: " word formation " }).skill, "WORD_FORMATION");
});

test("familyKeyFor keeps a missing skill null rather than inventing one", () => {
  assert.equal(familyKeyFor({ family: "MORPHOLOGY" }).skill, null);
  assert.equal(familyKeyFor({ family: "MORPHOLOGY", skill: "" }).skill, null);
});

test("feedbackSchema accepts both ratings", () => {
  assert.equal(feedbackSchema.parse({ rating: "UP" }).rating, "UP");
  assert.equal(feedbackSchema.parse({ rating: "DOWN" }).rating, "DOWN");
});

test("feedbackSchema rejects any other rating", () => {
  assert.throws(() => feedbackSchema.parse({ rating: "up" }));
  assert.throws(() => feedbackSchema.parse({ rating: "MAYBE" }));
  assert.throws(() => feedbackSchema.parse({ rating: "" }));
  assert.throws(() => feedbackSchema.parse({ rating: 1 }));
  assert.throws(() => feedbackSchema.parse({}));
});

test("feedbackSchema rejects a missing rating rather than defaulting it", () => {
  assert.throws(() => feedbackSchema.parse({ comment: "too vague" }));
});

test("feedbackSchema treats the comment as optional", () => {
  assert.equal(feedbackSchema.parse({ rating: "UP" }).comment, undefined);
});

test("feedbackSchema rejects a comment over the 2000 character cap", () => {
  assert.doesNotThrow(() => feedbackSchema.parse({ rating: "DOWN", comment: "x".repeat(MAX_COMMENT_LENGTH) }));
  assert.throws(() => feedbackSchema.parse({ rating: "DOWN", comment: "x".repeat(MAX_COMMENT_LENGTH + 1) }));
});

test("MAX_COMMENT_LENGTH is the documented 2000", () => {
  assert.equal(MAX_COMMENT_LENGTH, 2000);
});

test("normaliseComment trims, and turns a blank comment into null", () => {
  assert.equal(normaliseComment("  too vague  "), "too vague");
  assert.equal(normaliseComment(""), null);
  assert.equal(normaliseComment("   \n  "), null);
  assert.equal(normaliseComment(null), null);
  assert.equal(normaliseComment(undefined), null);
});

test("parseFeedback trims the comment and keeps the rating", () => {
  assert.deepEqual(parseFeedback({ rating: "DOWN", comment: "  the passage is off-topic " }), {
    rating: "DOWN",
    comment: "the passage is off-topic",
  });
});

test("parseFeedback stores no comment as null, not an empty string", () => {
  assert.deepEqual(parseFeedback({ rating: "UP" }), { rating: "UP", comment: null });
  assert.deepEqual(parseFeedback({ rating: "UP", comment: "  " }), { rating: "UP", comment: null });
});

test("parseFeedback rejects an oversized comment before it can reach the database", () => {
  assert.throws(() => parseFeedback({ rating: "DOWN", comment: "x".repeat(MAX_COMMENT_LENGTH + 1) }));
});