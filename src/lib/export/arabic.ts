import { ArabicShaper } from "arabic-persian-reshaper";

// pdfkit has no complex-text layout: Arabic must be pre-shaped (presentation
// forms) and pre-ordered (visual order, since pdfkit draws left to right).
// These helpers only handle the official-paper header/footer lines below:
// pure-Arabic runs plus ASCII digits. They must NOT be used for mixed
// Arabic/Latin prose (teacher content stays in logical order for DOCX,
// where Word shapes natively).

const ARABIC_RE = new RegExp("[\\u0600-\\u06FF]");

/** Shape one pure-Arabic line into visual order for pdfkit. */
export function arabicLine(logical: string): string {
  return [...ArabicShaper.convertArabic(logical)].reverse().join("");
}

/** Visual-order "صفحة X من Y" footer from logical page/total. Digits are
 * kept as separate tokens so multi-digit numbers never get reversed. */
export function arabicPageFooter(page: number, total: number): string {
  const tokens = ["صفحة", String(page), "من", String(total)].reverse();
  return tokens.map((t) => (ARABIC_RE.test(t) ? arabicLine(t) : t)).join(" ");
}

export function isShaped(output: string): boolean {
  return !ARABIC_RE.test(output);
}
