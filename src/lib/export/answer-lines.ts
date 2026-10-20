/**
 * The paper is the STUDENT sheet: it carries questions and empty answer slots,
 * never the answer. The `answer` field is teacher-only (the builder's "Answer
 * key" toggle), and `assemble.ts` never reads it.
 *
 * The remaining leak is the model writing the answer INTO the prompt:
 *
 *   A) Marketers use colour, music, and timing to create an immediate impression.
 *   B) An immediate impression ..........
 *   answer: An immediate impression is created by marketers using colour, music,
 *           and timing.
 *
 * Measured live 2026-10-20. `parseTaskBody` put the `answer:` line in `lead`,
 * which prints above the items -- so the answer reached the PDF, the DOCX and
 * the builder preview. A prompt instruction not to do this is not enough; the
 * shape is stripped in code at stamp time (`provider.ts`, so the stored draft is
 * clean) and inside `parseTaskBody` (so drafts saved before this fix print
 * clean too).
 */

/**
 * "answer: ...", "Answer key = ...", "**Answer:** ..." -- a line that LABELS an
 * answer. The colon/equals sign is required (or the line is the bare header),
 * so a legitimate instruction such as "Answer the following questions" is never
 * touched.
 */
const ANSWER_LINES = [
  /^\s*[#*_\s]*(?:the\s+)?(?:correct\s+)?answer[#*_\s]*(?:key[#*_\s]*)?[:=]\s*\S.*$/i,
  /^\s*[#*_\s]*(?:the\s+)?(?:correct\s+)?answer[#*_\s]*(?:key[#*_\s]*)?[:=]?\s*[#*_\s]*$/i,
];

/**
 * Remove answer-label lines from a task prompt. Returns the SAME string when
 * there is nothing to strip, so callers can treat it as a no-op.
 */
export function stripAnswerLines(prompt: string): string {
  if (!prompt || !/answer/i.test(prompt)) return prompt;
  const lines = prompt.split("\n");
  const kept = lines.filter((line) => !ANSWER_LINES.some((re) => re.test(line)));
  if (kept.length === lines.length) return prompt;
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
