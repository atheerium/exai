import { ArabicShaper } from "arabic-persian-reshaper";

// pdfkit has no complex-text layout: Arabic must be pre-shaped into
// presentation forms before drawing. These helpers cover the official-paper
// header, running header and page footer: pure-Arabic runs plus ASCII digits.
// They must NOT be used for mixed Arabic/Latin prose (teacher content stays in
// logical order for DOCX, where Word shapes natively).
//
// Verified against pdfkit + Amiri: the shaper alone yields correctly joined,
// right-to-left glyphs. Reversing the shaped string as well would draw the
// presentation forms backwards, so no reordering is applied here.

const ARABIC_RE = new RegExp("[\\u0600-\\u06FF]");
const DIGITS_RE = /^[\d\s]+$/;

/** Shape one pure-Arabic line into presentation forms for pdfkit. */
export function arabicLine(logical: string): string {
  return ArabicShaper.convertArabic(logical);
}

/**
 * Shape a run that mixes Arabic words and ASCII digits, e.g. "03 سا 00 د".
 * Digit groups are preserved verbatim so multi-digit numbers keep their order.
 */
export function arabicMixedRun(value: string): string {
  return value
    .split(/(\d+)/)
    .map((part) => (part === "" || DIGITS_RE.test(part) ? part : arabicLine(part)))
    .join(" ");
}

/** Shaped "صفحة X من Y" footer from logical page/total. */
export function arabicPageFooter(page: number, total: number): string {
  return arabicMixedRun(`صفحة ${page} من ${total}`);
}

export function isShaped(output: string): boolean {
  return !ARABIC_RE.test(output);
}