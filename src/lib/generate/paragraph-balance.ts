// Paragraph balance for a generated passage.
//
// The complaint this fixes (teacher report 2026-10-20): a passage whose first
// two paragraphs run 58 and 54 words and whose last is one 16-word sentence.
// Nothing in the old validator objected — the paragraph COUNT was right and the
// total word count was inside the band — so the paper printed a passage that
// visibly trails off, which no real exam sheet does.
//
// The rule, therefore, is a FLOOR, not an equality: paragraphs may differ in
// length the way the reference papers do (60 / 47 / 50), but no paragraph may be
// so short that it stops developing an idea. That is exactly computable from the
// text, so it is computed here rather than requested in the prompt alone (the
// same rule the rest of the pipeline follows for marks, counts and tables).
//
// Why 55% of the average:
//   - 3 paragraphs at 120 words -> average 40, floor 22 words. The reported
//     failure (16 words) is rejected; a normal short closing paragraph (2 short
//     sentences, ~25-30 words) passes.
//   - 4 paragraphs at 120 words -> average 30, floor 17 words. A developed
//     closing still passes; a one-sentence fragment does not.
//   - A ceiling ("no paragraph longer than Nx the average") is deliberately NOT
//     enforced: an opening paragraph legitimately carries the most information,
//     and a mechanical max rejects good writing for no reader-visible gain.
//
// Nothing here checks cohesion or topic — those stay advisory (grounding.ts).

import { countWords } from "./rng";

/**
 * A paragraph must be at least this share of the average paragraph length.
 * See the header for the word counts this produces at the usual band.
 */
export const MIN_PARAGRAPH_SHARE_OF_AVERAGE = 0.55;

/** Split a passage into paragraphs the same way the validator and the paper do. */
export function splitPassageParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * The shortest paragraph the rule allows for a passage of `totalWords` laid out
 * over `paragraphCount` paragraphs. One helper for the validator, the trim and
 * the prompt, so the number the model is told is the number the code enforces.
 */
export function minParagraphWords(totalWords: number, paragraphCount: number): number {
  if (paragraphCount <= 0) return 0;
  return Math.ceil((totalWords / paragraphCount) * MIN_PARAGRAPH_SHARE_OF_AVERAGE);
}

/**
 * Issues for any paragraph that is a fragment rather than a developed paragraph.
 * Empty array means balanced. The strings are what the repair call receives, so
 * they name the paragraph, its length and the required minimum.
 */
export function checkParagraphBalance(text: string): string[] {
  const paras = splitPassageParagraphs(text);
  if (paras.length < 2) return [];
  const words = paras.map((p) => countWords(p));
  const total = words.reduce((a, b) => a + b, 0);
  const min = minParagraphWords(total, paras.length);
  const issues: string[] = [];
  words.forEach((count, i) => {
    if (count < min) {
      issues.push(
        `Paragraph ${i + 1} is a fragment: ${count} words where every paragraph must be at least ` +
          `${min} (the passage has ${total} words across ${paras.length} paragraphs, and no paragraph ` +
          `may be shorter than ${Math.round(MIN_PARAGRAPH_SHARE_OF_AVERAGE * 100)}% of the average). ` +
          `Develop it with its own idea and detail, or merge it into a neighbouring paragraph.`
      );
    }
  });
  return issues;
}
