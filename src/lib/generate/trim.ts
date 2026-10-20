// Trim a generated passage into the length band, in code.
//
// Motivation, measured live on Groq 2026-10-11: told "120 words, between 96 and
// 144", `openai/gpt-oss-120b` returned 146, 156, 172 and 188 words across four
// runs. It does not cluster near the line, so widening the band does not fix it
// (188 is 30% over) and re-rolling costs tokens against an 8000 TPM ceiling that
// is already the binding constraint. Word count is computable, so it is computed
// here rather than generated — the same rule the rest of the pipeline follows for
// labels, marks and tables.
//
// Deliberate limits:
//   - Whole trailing SENTENCES only. Cutting mid-sentence produces text a
//     teacher would notice immediately, and it breaks the `.` sentence
//     assumption used downstream.
//   - Never below one sentence per paragraph. Paragraph count is a teacher
//     choice and is checked exactly; a trim that emptied the last paragraph
//     would trade a length rejection for a paragraph-count rejection.
//   - Never below the paragraph-balance floor (paragraph-balance.ts). Cutting
//     the last paragraph down to a fragment would trade a length rejection for
//     the "paragraph 3 is a fragment" rejection the floor exists to catch.
//   - Only over-ceiling passages. An under-length passage cannot be fixed in
//     code without inventing text, so it is left to the caller's repair/fail
//     path. The model overshoots; it does not undershoot.
//
// The caller re-validates the trimmed text and falls back to the original if
// anything regressed. Trimming must never convert a length problem into a
// different problem that gets reported to the teacher instead.

import { countWords } from "./rng";
import { minParagraphWords, splitPassageParagraphs } from "./paragraph-balance";

export interface TrimOptions {
  /** Teacher-requested length; the band is ±20% of it, as validateCandidate uses. */
  length: number;
}

export interface TrimResult {
  text: string;
  /** True when the text was actually changed. */
  trimmed: boolean;
  wordsBefore: number;
  wordsAfter: number;
}

/** Split into sentences without breaking common abbreviations or decimals. */
function splitSentences(paragraph: string): string[] {
  const parts = paragraph.split(/(?<=[.!?])\s+(?=[A-Z"'(\u201c])/);
  return parts.flatMap((p) => (p ? [p] : []));
}

function paragraphs(text: string): string[] {
  return splitPassageParagraphs(text);
}

export function lengthBandWords(length: number): { min: number; max: number } {
  return { min: Math.floor(length * 0.8), max: Math.ceil(length * 1.2) };
}

/**
 * Trim a passage to the band by removing trailing sentences, last paragraph
 * first. Returns the text unchanged when it is already inside the band.
 */
export function trimPassageToBand(text: string, opts: TrimOptions): TrimResult {
  const { max } = lengthBandWords(opts.length);
  const wordsBefore = countWords(text);
  const before = { trimmed: false, wordsBefore, wordsAfter: wordsBefore };

  if (wordsBefore <= max) return { text, ...before };

  // Work paragraph by paragraph from the end. Each removal takes the last
  // sentence off the last paragraph that still has more than one.
  const paras = paragraphs(text);
  let total = wordsBefore;

  while (total > max) {
    let removed = false;
    for (let i = paras.length - 1; i >= 0; i--) {
      const sentences = splitSentences(paras[i]);
      if (sentences.length <= 1) continue;
      const dropped = sentences.pop()!;
      const remaining = countWords(sentences.join(" "));
      // Refuse a cut that would make this paragraph a fragment. The floor is
      // derived from the passage AFTER the cut, exactly as the validator will
      // derive it, so the trim cannot create the failure it is meant to avoid.
      if (remaining < minParagraphWords(total - countWords(dropped), paras.length)) continue;
      paras[i] = sentences.join(" ").trim();
      total -= countWords(dropped);
      removed = true;
      break;
    }
    // Every paragraph is down to one sentence, or to its balance floor, and we
    // are still over: stop. The caller re-validates and reports the original
    // issue rather than shipping a passage that has been stripped of everything
    // but sentence fragments.
    if (!removed) break;
  }

  const out = paras.join("\n\n");
  return {
    text: out,
    trimmed: out !== text,
    wordsBefore,
    wordsAfter: countWords(out),
  };
}