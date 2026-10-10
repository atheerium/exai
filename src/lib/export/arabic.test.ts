import { test } from "node:test";
import assert from "node:assert/strict";
import { arabicLine, arabicMixedRun, arabicPageFooter, isShaped } from "./arabic";

// pdfkit + Amiri shape Arabic correctly from presentation forms alone. These
// tests pin that contract, because the earlier implementation also reversed the
// shaped string and rendered every Arabic glyph backwards.
test("arabicLine returns presentation forms with no residual Arabic letters", () => {
  const out = arabicLine("وزارة التربية الوطنية");
  assert.equal(isShaped(out), true);
  assert.ok(out.length > 0);
});

test("arabicLine joins letters into presentation forms rather than isolated glyphs", () => {
  const out = arabicLine("الجمهورية");
  // Presentation forms live in the Arabic Presentation Forms-B block.
  assert.ok(/[\uFE70-\uFEFF]/.test(out), "expected presentation forms, got isolated letters");
});

test("arabicLine is deterministic", () => {
  assert.equal(arabicLine("اختبار في مادة"), arabicLine("اختبار في مادة"));
});

test("arabicMixedRun preserves digit order inside an Arabic run", () => {
  const out = arabicMixedRun("03 سا 00 د");
  assert.ok(out.includes("03"), `digits missing from ${out}`);
  assert.ok(out.includes("00"), `digits missing from ${out}`);
  assert.ok(out.indexOf("03") < out.indexOf("00"), "hour must precede minute");
});

test("arabicPageFooter keeps page and total digits in ascending order", () => {
  const footer = arabicPageFooter(2, 12);
  assert.ok(footer.includes("2"));
  assert.ok(footer.includes("12"));
  assert.ok(footer.indexOf("2") < footer.indexOf("12"), "page number must precede total");
});

test("arabicPageFooter handles a two-digit page without transposing it", () => {
  const footer = arabicPageFooter(12, 20);
  assert.ok(footer.includes("12"), `page digits transposed in ${footer}`);
  assert.ok(footer.includes("20"), `total digits transposed in ${footer}`);
});