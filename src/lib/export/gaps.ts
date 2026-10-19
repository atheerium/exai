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
