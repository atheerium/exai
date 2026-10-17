// Teacher feedback: pure helpers only.
//
// This module deliberately imports NOTHING from `@/lib/db` and nothing that
// touches the network, because `src/lib/feedback.test.ts` imports it and the
// suite must stay offline. The database work lives in the routes
// (`/api/exams/[id]/feedback` and `/api/ops/feedback`).
//
// THE RULE: feedback is a signal to US about which task families produce bad
// output. It must never flow back into generation. Nothing under
// `src/lib/generate/` may read the feedback tables, and no prompt may be
// derived from a rating. Tuning generation against self-reported ratings is
// reward hacking, not improvement.

import { z } from "zod";

/** Ratings a teacher can leave. "UP" is a thumbs up, "DOWN" a thumbs down. */
export const FEEDBACK_RATINGS = ["UP", "DOWN"] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

/**
 * Comment cap, enforced HERE rather than by a DB CHECK so there is exactly one
 * place that decides it. Both the route and the textarea read this constant, so
 * the client cannot offer a length the server will reject.
 */
export const MAX_COMMENT_LENGTH = 2000;

/**
 * Bucket for a task whose family is missing or empty. Never drop the signal on
 * the floor: an unattributed rejection is still evidence that something in
 * that section was thrown away, and a separate bucket is readable rather than
 * silently folded into a real family.
 */
export const UNKNOWN_FAMILY = "UNKNOWN";

export const feedbackSchema = z.object({
  rating: z.enum(FEEDBACK_RATINGS),
  comment: z.string().max(MAX_COMMENT_LENGTH).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

/**
 * Trim a submitted comment and collapse a blank one to null.
 *
 * A teacher who opens the box, types nothing and closes it should not leave an
 * empty string behind: `comment === ""` and `comment === null` mean the same
 * thing downstream, and only one of them is a value worth storing.
 */
export function normaliseComment(comment: string | null | undefined): string | null {
  if (comment === null || comment === undefined) return null;
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Uppercase, trim, and collapse internal whitespace runs into underscores. */
function normaliseToken(value: string): string {
  return value.trim().replace(/\s+/g, "_").toUpperCase();
}

/**
 * The family/skill pair a task is counted under.
 *
 * Families are stamped from the guide onto every generated task, so `family`
 * is normally present. It is nullable in the schema, and a hand-written or
 * legacy row can carry null or whitespace, so this NEVER throws and NEVER
 * returns an empty string: a null family falls back to {@link UNKNOWN_FAMILY}
 * and a null skill stays null, because a skill is genuinely absent for Part One
 * and inventing one would attribute a rejection to the wrong bucket.
 */
export function familyKeyFor(
  task: { family?: string | null; skill?: string | null } | null | undefined
): { family: string; skill: string | null } {
  const family = task?.family ? normaliseToken(task.family) : "";
  const skill = task?.skill ? normaliseToken(task.skill) : "";
  return {
    family: family.length > 0 ? family : UNKNOWN_FAMILY,
    skill: skill.length > 0 ? skill : null,
  };
}

/** Parse and normalise a feedback payload in one step. Throws ZodError. */
export function parseFeedback(raw: unknown): { rating: FeedbackRating; comment: string | null } {
  const parsed = feedbackSchema.parse(raw);
  return { rating: parsed.rating, comment: normaliseComment(parsed.comment) };
}