// Gap markers for a fill-in-the-gaps task, shared by the generation validator
// and the three paper renderers.
//
// A GAP_FILL task marks every missing word with `___` (a model sometimes writes
// a run of dots instead). The COUNT is a contract: the word list carries
// exactly one word per gap (user instruction, 2026-10-19). `gapCount` is what
// the validator measures; `numberGaps` is what the paper prints, so the two can
// never disagree about what a gap is.
//
// `hasInlineGap` decides whether the task is a PASSAGE (gaps sitting inside
// running sentences, printed unlettered with numbered gaps) or a list of
// separate sentences (one gap at the end of each line, printed a) b) c)).
// Punctuation after the gap does not count as text, or every sentence-final
// gap would read as a passage.

/** The vocabulary of a gap marker: two+ underscores, three+ dots, or an ellipsis. */
function gapRegex(): RegExp {
  return /_{2,}|\.{3,}|…/g;
}

/** How many gaps the text carries. */
export function gapCount(text: string): number {
  return (text.match(gapRegex()) ?? []).length;
}

/**
 * Is any gap surrounded by sentence text (a letter or digit after it on the
 * same line)? Such a task is a passage; a list of sentences ends each line with
 * its gap.
 */
export function hasInlineGap(text: string): boolean {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const re = gapRegex();
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const after = line.slice(m.index + m[0].length);
      if (/[\p{L}\p{N}]/u.test(after)) return true;
    }
  }
  return false;
}

/**
 * Are two gaps separated only by punctuation and whitespace?
 *
 * A gap fill is a paragraph with a missing word inside each phrase. A run of
 * blanks joined by commas ("how ___, ___, ___, ___ shape our habits") is not:
 * no word stands between the gaps. A sentence boundary (`___. ___`) is allowed,
 * because the gap that ends a sentence and one that starts the next still sit
 * inside their own sentences, so a terminator counts as text.
 *
 * The count check could not see this: four blanks in a row is still four gaps.
 * Teacher report 2026-10-20.
 */
export function hasClusteredGaps(text: string): boolean {
  const re = gapRegex();
  let previous: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (previous) {
      const between = text.slice(previous.index + previous[0].length, match.index);
      if (!/[\p{L}\p{N}]/u.test(between) && !/[.!?]/.test(between)) return true;
    }
    previous = match;
  }
  return false;
}

/**
 * How many sentences the task text reads as, with the gap markers ignored.
 *
 * Dots can be a gap marker (`...`), so they are replaced before punctuation is
 * counted; otherwise an ellipsis gap would look like a sentence boundary. A
 * text that does not end in punctuation still counts its last fragment.
 */
export function countSentences(text: string): number {
  const plain = text.replace(gapRegex(), " gap ");
  if (!/[\p{L}\p{N}]/u.test(plain)) return 0;
  const terminators = (plain.match(/[.!?]+(?=\s|$)/g) ?? []).length;
  return /[.!?]\s*$/.test(plain.trim()) ? terminators : terminators + 1;
}

/**
 * The printed form of gap number `index` (1-based): a dotted blank split in two
 * by the number, so the student answers with the number and the word (user
 * instruction, 2026-10-19):
 *
 *   .........(1) .........
 */
export function numberedGap(index: number): string {
  return `.........(${index}) .........`;
}

/**
 * Replace every gap with its numbered printed form, keeping the rest of the
 * text — including paragraph breaks — exactly as it arrived.
 */
export function numberGaps(text: string): string {
  let n = 0;
  return text.replace(gapRegex(), () => numberedGap(++n));
}
