// The PARAGRAPH_ID ("In which paragraph is it mentioned that...?") option shape.
//
// The stem is printed ONCE, above the options, and every option is the bare
// statement the student has to place. Live output (teacher report 2026-10-20)
// repeated the whole lead-in on all four options:
//
//   a) In which paragraph is it mentioned that marketers use colour, music, and
//      timing to create an immediate impression?
//
// `PART_ONE_PARAGRAPH_ID_RULE` in `generate/provider.ts` already asked the model
// not to. A prompt instruction is a request, not a guarantee (see `AGENTS.md`),
// so the shape is enforced here in code: once when the task is stamped
// (`provider.ts`, so the stored draft and the builder editor are clean) and once
// when the paper is parsed (`paper.ts`, which also repairs exams saved before
// this rule existed). Both callers share this module so the two cannot drift.

/** The stem's lead-in, as a model is likely to reprint it at the start of an option. */
const LEAD_IN =
  /^(?:in\s+which\s+paragraph\s+(?:(?:is\s+)?(?:it\s+)?(?:is\s+)?(?:mentioned|stated|said)\s+that|does\s+the\s+(?:text|passage|article|author)\s+mention\s+that|mentions?\s+that)|which\s+paragraph\s+mentions?\s+that)\s*:?\s*/i;

/**
 * The source-attribution prefixes `PART_ONE_PARAGRAPH_ID_RULE` bans. They are
 * the same defect as the lead-in: the option reports the passage instead of
 * stating the idea.
 */
const ATTRIBUTION =
  /^(?:the\s+(?:passage|text|article|author|writer)\s+(?:says|states|mentions|claims|reports)\s+that|according\s+to\s+the\s+(?:passage|text|article|author|writer)\s*,?)\s*/i;

/**
 * Is this task the paragraph-identification one?
 *
 * Family first, then the official wording, so a row saved before `family` was
 * stamped still gets the printed shape. Same rule as `isReferentTask` and
 * `isGapFillTask` in `paper.ts`.
 */
export function isParagraphIdTask(family: string | null | undefined, instruction?: string): boolean {
  if ((family ?? "").trim().toUpperCase() === "PARAGRAPH_ID") return true;
  return /in\s+which\s+paragraph\b/i.test(instruction ?? "");
}

/**
 * Turn one option body into the bare statement the paper prints.
 *
 * Idempotent: an option that already is a bare statement comes back unchanged
 * (apart from trimming), so applying it at stamp time and again at print time is
 * safe. A line that is ONLY the lead-in (`"In which paragraph is it mentioned
 * that"`) returns an empty string: the stem is already printed once from the
 * task instruction, so keeping the line would print a second stem (as an option
 * when the model also dropped the punctuation). Callers skip the empty result.
 */
export function normaliseParagraphIdOption(text: string): string {
  const source = text.trim();
  const lead = LEAD_IN.exec(source) ?? ATTRIBUTION.exec(source);
  if (!lead) return source;

  const rest = source.slice(lead[0].length).trim();
  // Nothing substantive follows: this is the stem, not an option.
  if (!/[a-z]{2,}/i.test(rest)) return "";

  const statement = /^[a-z]/.test(rest) ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
  // The question mark belonged to the lead-in ("...mentioned that X?"), not to
  // the statement. EXAM.md 2A: options end with a period, never a question mark.
  return statement.replace(/\?+\s*$/, ".");
}

/** Any item label the model kept in front of the option (`1.`, `a)`, `A:`). */
const ITEM_LABEL = /^(\s*(?:\d{1,2}[).:]|[A-Za-z][).:])\s+)/;

/**
 * Apply `normaliseParagraphIdOption` to every line of a stored prompt, keeping
 * each line's own label. Used when a generation is stamped, so what reaches the
 * database is already the printed shape.
 */
export function normaliseParagraphIdPrompt(prompt: string): string {
  const out: string[] = [];
  for (const line of prompt.split("\n")) {
    const label = ITEM_LABEL.exec(line);
    const body = normaliseParagraphIdOption(label ? line.slice(label[1].length) : line);
    // A line that was ONLY the lead-in normalises to "" -- the stem it repeats
    // prints from the instruction, so a second copy is neither stored nor left
    // behind as a blank line.
    if (!body.trim()) continue;
    out.push(label ? `${label[1]}${body}` : body);
  }
  return out.join("\n");
}
