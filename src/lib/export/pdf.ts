import PDFDocument from "pdfkit";
import type { ExportDocument, ExportHeader } from "./assemble";
import type { EmphasisMark, PaperBlock, PaperItem, PaperTable, PaperTask, PaperTopic } from "./paper";
import { buildPaper, highlightRuns } from "./paper";
import { readFileSync } from "fs";
import { join } from "path";
import { arabicLine, arabicMixedRun, arabicPageFooter, isShaped } from "./arabic";
import { BLANK_ROW_HEIGHT } from "./tables";
import { WORD_BANK_SEPARATOR } from "./paper";

// The official paper is set in a serif face (Times), not the sans-serif the
// dashboard uses. Times-Bold / Times-Italic / Times-BoldItalic are pdfkit's
// built-in Standard fonts, so no file loading is needed for the Latin body.
// The official paper is set in Times New Roman. The genuine family is bundled
// in public/fonts; when a weight is missing from that file the built-in
// Standard fonts are used instead, which are metric-compatible Times faces and
// keep the layout identical.
const REGULAR = "TNR";
const BOLD = "TNR-Bold";
const ITALIC = "TNR-Italic";
const BOLD_ITALIC = "TNR-BoldItalic";

// Body text is 12pt Times New Roman, matching the official paper. The three
// reference exams all set the passage, tasks and items at the same size.
const BODY = 12;
const MARKS = 12;
const HEADING = 13;
const ITEM_INDENT = 30;
const ITEM_TEXT_INDENT = 52;
const GAP_LEADER = "................";
/**
 * Vertical whitespace between passage paragraphs, in pdfkit line units
 * (1 ≈ one BODY line). The passage has no first-line indent; the rhythm comes
 * from here. DOCX equivalent: PASSAGE_GAP_AFTER in docx.ts.
 */
const PARA_GAP = 0.55;
/**
 * Tables are centred and narrower than the text block (user screenshot,
 * 2026-10-11). DOCX mirrors this with TABLE_WIDTH_PCT.
 */
const TABLE_MAX_WIDTH = 400;

/**
 * Table grid weight. 0.75pt is one device-independent pixel at 96dpi, which is
 * what the user asked for on 2026-10-19 ("reduce the border size, maybe one
 * pixel"); the previous 1pt grid read heavy at this size. DOCX mirrors this
 * with `GRID` in `docx.ts`, whose `size` is in eighths of a point (size 6).
 */
const TABLE_LINE_WIDTH = 0.75;

/**
 * Vertical rhythm (user instruction, 2026-10-11: "reduce the line spacing by
 * two levels"). These were 1.32 for passage lines and 1.5 between items, which
 * read as double-spaced next to the Ministry reference sheet.
 */
const LINE_HEIGHT = BODY * 1.14;
const ITEM_ADVANCE = BODY * 1.22;
/**
 * Whitespace between two stacked items, added ON TOP of the height each one
 * actually occupied. The rhythm of the official paper lives here, which is why
 * line spacing is a constant and not an emergent property of the font metrics.
 */
const ITEM_GAP = BODY * 0.36;

/**
 * Phonetic / IPA characters.
 *
 * pdfkit's built-in Times faces use WinAnsi encoding, which has no IPA, so a
 * phonetic symbol rendered there comes out as a wrong glyph: the classification
 * header "/ɪd/" printed as "/&¦Bð" until this was caught in a rasterised PDF.
 * The bundled TNR file *does* cover ɪ ʃ ʒ ə ʌ æ ŋ, so any text containing a
 * phonetic character must use a file-backed face and lose the bold/italic
 * synthetic variant rather than print nonsense.
 *
 * Limitation that remains: the bundled font has no θ (U+03B8) or ː (U+02D0), and
 * Amiri covers even less of IPA. A phonology task using those symbols needs a
 * font with wider phonetic coverage; until one is bundled, they will fall back.
 */
const PHONETIC = /[\u0250-\u02AF\u02B0-\u02FF\u1D00-\u1D7F]/;

/**
 * Pick a face for `text`: a file-backed face when it carries phonetic symbols,
 * otherwise the requested synthetic bold/italic variant.
 */
const faceFor = (text: string, bold: boolean, italic: boolean): string => {
  if (!PHONETIC.test(text)) return italic ? (bold ? BOLD_ITALIC : ITALIC) : bold ? BOLD : REGULAR;
  // REGULAR is the only face here with IPA coverage; Amiri has less, not more.
  return REGULAR;
};

export async function renderPdf(docModel: ExportDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true });
  const paper = buildPaper(docModel);
  const isBac = paper.structure === "bac";
  const header = paper.header;

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const fontFace = (name: string, size: number) => doc.font(name).fontSize(size);
  const font = (size: number, bold = false) => fontFace(bold ? BOLD : REGULAR, size);
  const ital = (size: number, bold = false) => fontFace(bold ? BOLD_ITALIC : ITALIC, size);

  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  const contentWidth = doc.page.width - left - right;

  try {
    const amiriRegular = join(process.cwd(), "public/fonts/Amiri-Regular.ttf");
    const amiriBold = join(process.cwd(), "public/fonts/Amiri-Bold.ttf");
    readFileSync(amiriRegular);
    readFileSync(amiriBold);
    doc.registerFont("Amiri", amiriRegular);
    doc.registerFont("Amiri-Bold", amiriBold);
  } catch (err) {
    if (isBac) console.warn("Skipping Arabic header:", err instanceof Error ? err.message : err);
  }

  // Prefer the bundled Times New Roman. It ships as a regular-only file, so bold
// and italic fall back to pdfkit's metric-compatible Standard Times faces.
const TNR_FILE = join(process.cwd(), "public/fonts/TimesNewRoman.ttf");
const WEIGHTS: [name: string, file: string | null, fallback: string][] = [
  [REGULAR, TNR_FILE, "Times-Roman"],
  [BOLD, null, "Times-Bold"],
  [ITALIC, null, "Times-Italic"],
  [BOLD_ITALIC, null, "Times-BoldItalic"],
];

  for (const [name, file, fallback] of WEIGHTS) {
    try {
      if (file) doc.registerFont(name, file);
      else doc.registerFont(name, fallback);
    } catch {
      doc.registerFont(name, fallback);
    }
  }

  const arabicAvailable = () => {
    try {
      doc.font("Amiri");
      return true;
    } catch {
      return false;
    }
  };

  /** Full-width hairline, used for the rules framing the official header. */
  const rule = (y: number, thickness = 0.7) => {
    doc.save().lineWidth(thickness).strokeColor("#000000")
      .moveTo(left, y).lineTo(doc.page.width - right, y).stroke().restore();
  };

  /** Draws one Arabic line, shaped + visually ordered for pdfkit. */
  const arabicLineAt = (logical: string, y: number, size: number, bold: boolean, align: "center" | "right" | "left", width = contentWidth, x = left) => {
    const shaped = arabicLine(logical);
    doc.font(bold ? "Amiri-Bold" : "Amiri").fontSize(size).fillColor("#000000")
      .text(shaped, x, y, { width, align });
  };

  /**
   * The official masthead: institution block, then the subject/duration rule,
   * then the centred instruction and topic label. Each field is bold only on the
   * label, so "الدورة:" is bold and its value is not.
   */
  const drawHeader = (h: ExportHeader) => {
    if (!arabicAvailable()) return;
    const half = contentWidth / 2;
    let y = 46;

    rule(y);
    y += 10;

    const institution = [
      { text: "الجمهورية الجزائرية الديمقراطية الشعبية", bold: true, size: 11 },
      { text: "وزارة التربية الوطنية", bold: true, size: 11 },
      { text: "الديوان الوطني للامتحانات والمسابقات", bold: false, size: 10.5 },
    ];
    for (const line of institution) {
      arabicLineAt(line.text, y, line.size, line.bold, "center");
      y += line.size + 4;
    }

    y += 6;
    rule(y);
    y += 9;

    /**
     * One RTL line: bold label at the far right with its value immediately to
     * the left, so "اختبار في مادة: اللغة الإنجليزية" reads as one phrase.
     * Latin values (stream names, years) skip shaping.
     */
    const field = (labelAr: string, valueAr: string | null, opts: { boldValue?: boolean; latin?: boolean; mixed?: boolean; align?: "right" | "left" } = {}) => {
      const side = opts.align ?? "right";
      const face = opts.boldValue ? "Amiri-Bold" : "Amiri";
      const value = valueAr
        ? opts.latin ? valueAr : opts.mixed ? arabicMixedRun(valueAr) : arabicLine(valueAr)
        : null;

      if (side === "left") {
        if (value) {
          doc.font(face).fontSize(10.5).fillColor("#000000")
            .text(value, left, y, { width: half, align: "left" });
        }
        if (labelAr) {
          doc.font("Amiri-Bold").fontSize(10.5).fillColor("#000000")
            .text(arabicLine(labelAr), left, y, { width: half, align: "left", continued: false });
        }
        y += 16;
        return;
      }

      const label = arabicLine(labelAr);
      doc.font("Amiri-Bold").fontSize(10.5).fillColor("#000000")
        .text(label, left, y, { width: contentWidth, align: "right" });
      if (value) {
        const labelW = doc.font("Amiri-Bold").fontSize(10.5).widthOfString(label);
        doc.font(face).fontSize(10.5).fillColor("#000000")
          .text(value, left, y, { width: contentWidth - labelW, align: "right" });
      }
      y += 16;
    };

    // Session sits opposite the exam title, at the two ends of one line.
    field(h.session ? "" : h.examTitleAr, null, { boldValue: true, align: "right" });
    if (h.session) field("", h.session, { boldValue: true, align: "left" });
    if (h.streamAr) {
      const [label, ...rest] = h.streamAr.split(": ");
      field(`${label}:`, rest.join(": "), { latin: true });
    }

    y += 4;
    rule(y);
    y += 9;

    // Subject on the right, duration on the left, sharing one line.
    field("اختبار في مادة:", h.subjectAr);
    field("المدة:", h.durationAr, { mixed: true, align: "left" });

    y += 4;
    rule(y);
    y += 6;

    for (const line of h.instructionsAr) {
      arabicLineAt(line, y, 10.5, true, "center");
      y += 16;
    }
    arabicLineAt(h.topicLabelAr, y, 11, true, "center");
    y += 20;

    doc.y = y;
    doc.x = left;
  };

  /** Continuation pages repeat a one-line Arabic running header under a rule. */
  const drawRunningHeader = (h: ExportHeader) => {
    if (!arabicAvailable()) return;
    rule(40);
    const subject = `${h.subjectAr}. ${h.examTitleAr.replace("امتحان ", "")}`;
    doc.font("Amiri-Bold").fontSize(10).fillColor("#000000")
      .text(arabicLine("اختبار في مادة:"), left, 48, { width: contentWidth, align: "right" });
    doc.font("Amiri").fontSize(10).fillColor("#000000")
      .text(arabicLine(subject), left + 78, 48, { width: contentWidth - 78, align: "left" });
    doc.y = 66;
    doc.x = left;
  };

  const sectionHead = (heading: string, marks: string) => {
    const y = doc.y;
    font(HEADING, true).fillColor("#000000").text(heading, left, y, { lineBreak: false });
    font(MARKS, true).fillColor("#000000")
      .text(marks, left, y, { width: contentWidth, align: "right", lineBreak: false });
    doc.x = left;
  };

  type RichOpts = { width: number; indent?: number; lineHeight?: number; align?: "left" | "justify"; x?: number };

  // pdfkit underlines the full line width whenever `underline` is set on a
  // continued run, so emphasised words cannot be marked inline. Wrapping,
  // justification and underlining are therefore driven manually: words are
  // measured, packed into lines, then drawn one by one at a pinned baseline.
  //
  // `marks` is the exact occurrence list from `buildPaper`, not a word set:
  // "it" may appear three times in a paragraph and only the occurrence the
  // question points at may be underlined. `highlightRuns` resolves the ranges,
  // so a multi-word target ("the former") is underlined too.
  const richText = (text: string, marks: EmphasisMark[], opts: RichOpts) => {
    font(BODY).fillColor("#000000");
    const lineHeight = opts.lineHeight ?? LINE_HEIGHT;
    const textX = opts.x ?? left + (opts.indent ?? 0);
    const textWidth = opts.width - (opts.indent ?? 0);

    const space = doc.widthOfString(" ");
    const words = highlightRuns(text, marks).flatMap((part) =>
      part.text
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => ({ word, marked: part.mark }))
    );
    if (words.length === 0) return;

    // A marked word may carry punctuation ("motivated." / "organisation,"), so
    // the token is matched on its alphabetic core and the surrounding marks are
    // drawn in the regular face. Returns the core and its offsets, or null.
    const splitCore = (token: string): { core: string; start: number; end: number } | null => {
      const m = /^[^\p{L}\p{N}]*([\p{L}\p{N}][\p{L}\p{N}'’-]*)[^\p{L}\p{N}]*$/u.exec(token);
      if (!m) return null;
      return { core: m[1], start: m.index, end: m.index + m[1].length };
    };

    // Marked words are set bold, so they must be measured as bold both when
    // packing lines and when placing them, or wrapping drifts.
    const wordWidth = (word: string, marked: boolean): number => {
      font(BODY, marked).fillColor("#000000");
      return doc.widthOfString(word);
    };

    const lines: { words: { word: string; marked: boolean }[]; width: number }[] = [];
    let current: { word: string; marked: boolean }[] = [];
    let currentWidth = 0;
    for (const entry of words) {
      const ww = wordWidth(entry.word, entry.marked);
      const advance = (current.length > 0 ? space : 0) + ww;
      if (current.length > 0 && currentWidth + advance > textWidth) {
        lines.push({ words: current, width: currentWidth });
        current = [entry];
        currentWidth = ww;
      } else {
        current.push(entry);
        currentWidth += advance;
      }
    }
    if (current.length > 0) lines.push({ words: current, width: currentWidth });

    const justify = opts.align === "justify";
    let y = doc.y;
    for (const [li, line] of lines.entries()) {
      if (y + lineHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      const isLast = li === lines.length - 1;
      const gap = justify && !isLast && line.words.length > 1 ? (textWidth - line.width) / line.words.length : 0;
      let x = textX;
      for (const entry of line.words) {
        const core = splitCore(entry.word);
        const marked = entry.marked;
        const ww = wordWidth(entry.word, marked);
        if (!marked || core === null) {
          doc.text(entry.word, x, y, { underline: marked, lineBreak: false, width: ww });
          x += ww + space + gap;
          continue;
        }
        // Draw the punctuation, then the bold+underlined core, then the rest.
        const prefix = entry.word.slice(0, core.start);
        const suffix = entry.word.slice(core.end);
        if (prefix) doc.text(prefix, x, y, { lineBreak: false, width: doc.widthOfString(prefix) });
        x += doc.widthOfString(prefix);
        const coreW = doc.widthOfString(entry.word.slice(core.start, core.end));
        font(BODY, true).fillColor("#000000");
        doc.text(entry.word.slice(core.start, core.end), x, y, { underline: true, lineBreak: false, width: coreW });
        x += coreW;
        if (suffix) {
          font(BODY).fillColor("#000000");
          doc.text(suffix, x, y, { lineBreak: false, width: doc.widthOfString(suffix) });
          x += doc.widthOfString(suffix);
        }
        x += space + gap;
      }
      y += lineHeight;
    }

    doc.y = y;
    doc.x = left;
  };

  /** Width one item needs on a line, label included. */
  const itemWidth = (item: PaperItem): number => {
    doc.font(BOLD).fontSize(BODY);
    let w = doc.widthOfString(`${item.label} `);
    doc.font(REGULAR).fontSize(BODY);
    w += doc.widthOfString(item.text);
    if (item.ref) w += doc.widthOfString(` ${item.ref}`);
    if (item.gap) w += doc.widthOfString(GAP_LEADER) + 6;
    return w;
  };

  /**
   * Referent items print on one line, separated by a wide gap:
   *   a) its (§1)        b) them (§2)        c) the problem (§3)
   * No dotted leader: the reference IS the item (user rule, 2026-10-19).
   */
  const drawInlineItem = (item: PaperItem, x: number, y: number): number => {
    font(BODY, true).fillColor("#000000").text(`${item.label}`, x, y, { lineBreak: false });
    const labelW = doc.widthOfString(`${item.label} `);
    doc.font(faceFor(item.text, false, false)).fontSize(BODY).fillColor("#000000").text(item.text, x + labelW, y, { lineBreak: false });

    let cursor = x + labelW + doc.widthOfString(item.text);
    if (item.ref) {
      font(BODY).fillColor("#000000").text(` ${item.ref}`, cursor, y, { lineBreak: false });
      cursor += doc.widthOfString(` ${item.ref}`);
    }
    if (item.gap) {
      cursor += 6;
      font(BODY).fillColor("#000000").text(GAP_LEADER, cursor, y, { lineBreak: false });
      cursor += doc.widthOfString(GAP_LEADER);
    }
    doc.x = left;
    return cursor - x;
  };

  /**
   * Draws one lettered item and returns the height it actually occupied.
   *
   * The return value exists because an item WRAPS: GAP_FILL and long
   * comprehension questions are frequently two or three lines, and the caller
   * used to advance a fixed one-line height regardless, so the overflow was
   * drawn straight over whatever came next. That stayed invisible until a word
   * bank appeared below the items — the centred bank landed on top of the last
   * item's second line.
   */
  const drawItem = (item: PaperItem, y: number): number => {
    font(BODY, true).fillColor("#000000").text(`${item.label}`, left + ITEM_INDENT, y, { lineBreak: false });

    const labelWidth = doc.widthOfString(`${item.label} `);
    const body = item.ref ? `${item.text} ${item.ref}` : item.text;
    const width = contentWidth - ITEM_INDENT - labelWidth;
    doc.font(faceFor(item.text, false, false)).fontSize(BODY);
    const height = doc.heightOfString(item.text, { width });
    doc.fillColor("#000000").text(item.text, left + ITEM_INDENT + labelWidth, y, { width });

    if (item.ref) {
      const refX = left + ITEM_INDENT + labelWidth + doc.widthOfString(item.text) + 3;
      font(BODY).fillColor("#000000").text(item.ref, refX, y, { lineBreak: false });
    }
    if (item.gap) {
      const after = left + ITEM_INDENT + labelWidth + doc.widthOfString(body) + 6;
      const leaderX = Math.min(after, left + contentWidth - 70);
      font(BODY).fillColor("#000000")
        .text(GAP_LEADER, leaderX, y, { width: left + contentWidth - leaderX, lineBreak: false });
    }
    doc.x = left;
    return height;
  };

  /**
   * Dotted cell content that fits the measured column, never more.
   *
   * `DOTTED` is a literal constant because DOCX and the preview cannot measure
   * text, but the PDF can, and a leader that wraps onto a second line inside a
   * 32pt cell breaks the row height. Shortened from the right, so the three
   * surfaces agree whenever the constant fits (it does at body size in a third
   * of the text block) and degrade the same way when it does not.
   */
  const fitDots = (text: string, textWidth: number): string => {
    if (!/^\.+$/.test(text.trim())) return text;
    const face = doc.font(REGULAR).fontSize(BODY);
    let dots = text.trim();
    while (dots.length > 3 && face.widthOfString(dots) > textWidth) dots = dots.slice(0, -1);
    return dots;
  };

  const drawTable = (table: PaperTable) => {
    const colCount = table.headers.length;
    // Tight cell padding (user instruction, 2026-10-19): the old 5pt on every
    // edge made each row read as a box with air around the text. 4pt
    // horizontally still separates columns; 2pt vertically is the whole margin
    // between a row's text and its grid line.
    const padX = 4;
    const padY = 2;
    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    let y = doc.y;

    // Official style (user screenshot, 2026-10-11): the table is centred and
    // narrower than the text block. It was previously left-aligned at full
    // content width, which made a three-column affix chart span the whole page.
    const tableWidth = Math.min(contentWidth, TABLE_MAX_WIDTH);
    const x0 = left + (contentWidth - tableWidth) / 2;
    // Equal thirds: every one of the three structures is a 3-column chart
    // (user instruction, 2026-10-13), and `tableWidth / colCount` gives exactly
    // that rather than the old proportional split.
    const colWidth = tableWidth / colCount;
    const textWidth = colWidth - padX * 2;

    /**
     * Row height: a row the student writes in is `BLANK_ROW_HEIGHT` tall even
     * when empty, and a row carrying text is at least as tall as that text.
     *
     * The header passes `minHeight: 0`: it is read, not written in, so forcing
     * the writing-row height on it was the single largest source of dead space
     * in a two-row chart (user instruction, 2026-10-19).
     */
    const measure = (cells: string[], minHeight: number): number => {
      let tallest = 0;
      for (const cell of cells) {
        // Measure in the face the cell will actually be drawn in, or phonetic
        // cells wrap against the wrong metrics.
        doc.font(faceFor(cell || " ", false, false)).fontSize(BODY);
        tallest = Math.max(tallest, doc.heightOfString(cell || " ", { width: textWidth }));
      }
      return Math.max(minHeight, tallest + padY * 2);
    };

    const headerH = measure(table.headers, 0);
    if (y + headerH + BLANK_ROW_HEIGHT > pageBottom()) {
      doc.addPage();
      if (header) drawRunningHeader(header);
      y = doc.y;
    }

    // 1pt solid black grid, no shading (user instruction, 2026-10-13). Cell
    // fill is left white, which is the page, so nothing is painted.
    doc.save().lineWidth(TABLE_LINE_WIDTH).strokeColor("#000000");
    table.headers.forEach((h, ci) => {
      const x = x0 + ci * colWidth;
      doc.rect(x, y, colWidth, headerH).stroke();
      // Bold, not bold-italic (user instruction, 2026-10-19: "make the table
      // headers bold"). Phonetic headers cannot use the bold face at all: the
      // built-in Times-Bold is WinAnsi and prints `/ɪd/` as garbage, so the
      // regular file-backed face is stroked to fake the weight instead.
      const face = faceFor(h, true, false);
      doc.font(face).fontSize(BODY).fillColor("#000000");
      if (face === REGULAR) {
        doc.save();
        doc.lineWidth(0.35).strokeColor("#000000");
        doc.text(h, x + padX, y + padY, {
          width: textWidth,
          align: "center",
          stroke: true,
          fill: true,
        });
        doc.restore();
      } else {
        doc.text(h, x + padX, y + padY, { width: textWidth, align: "center" });
      }
    });
    y += headerH;

    table.rows.forEach((row) => {
      const h = measure(row, BLANK_ROW_HEIGHT);
      if (y + h > pageBottom()) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      row.forEach((rawCell, ci) => {
        const x = x0 + ci * colWidth;
        doc.rect(x, y, colWidth, h).stroke();
        const cell = fitDots(rawCell ?? "", textWidth);
        const body = cell || " ";
        // A dotted cell is centred: it is a handwriting rule, and centring it is
        // what makes it read as one. A given word stays flush left.
        const align = /^\.+$/.test(cell.trim()) ? "center" : "left";
        doc.font(faceFor(body, false, false)).fontSize(BODY).fillColor("#000000")
          .text(body, x + padX, y + padY, { width: textWidth, align });
      });
      y += h;
    });
    doc.lineWidth(1);
    doc.y = y;
    doc.x = left;
  };

  const drawTask = (task: PaperTask) => {
    doc.moveDown(0.45);
    const stemW = contentWidth - 20;
    const stemH = doc.font(BOLD_ITALIC).fontSize(BODY).heightOfString(task.instruction, { width: stemW });
    const blockH =
      stemH +
      task.lead.length * (BODY * 1.3) +
      task.items.length * (BODY * 1.45) +
      (task.gapPassage?.length ?? 0) * BODY * 3;
    if (doc.y + blockH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (header) drawRunningHeader(header);
    }

    const stemY = doc.y;
    font(BODY, true).fillColor("#000000").text(`${task.number}.`, left, stemY, { lineBreak: false });
    ital(BODY, true).fillColor("#000000").text(task.instruction, left + 20, stemY, { width: stemW });
    doc.x = left;
    doc.y = stemY + stemH + 2;

    for (const line of task.lead) {
      // Measured for the same reason as items: a lead line that wraps must not
      // run into the items below it.
      const width = contentWidth - ITEM_INDENT;
      font(BODY);
      const height = doc.heightOfString(line, { width });
      doc.fillColor("#000000").text(line, left + ITEM_INDENT, doc.y, { width });
      doc.x = left;
      doc.y += height + ITEM_GAP * 0.5;
    }

    let y = doc.y;
    // The word bank belongs between the instruction and the first item, so the
    // student can read the candidate words before meeting the sentences. Centred
    // and hyphen-separated, like the official paper.
    if (task.wordList) {
      const bank = task.wordList.join(WORD_BANK_SEPARATOR);
      // Bold on every surface (user instruction, 2026-10-19): the candidate
      // words are instructions the student reads first, so they carry the same
      // weight as the stem instead of reading as body text.
      font(BODY, true);
      const height = doc.heightOfString(bank, { width: contentWidth });
      if (y + height > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      font(BODY, true).fillColor("#000000").text(bank, left, y, { width: contentWidth, align: "center" });
      doc.x = left;
      y += height + ITEM_GAP;
    }

    // A gap-fill PASSAGE prints as one indented, justified block with numbered
    // gaps and no letter prefixes (user instruction, 2026-10-19). The paragraph
    // is pre-broken as a whole so a passage never starts one line above the
    // page bottom; `richText` still breaks inside it if it must.
    if (task.gapPassage) {
      for (const paragraph of task.gapPassage) {
        doc.font(REGULAR).fontSize(BODY);
        const height = doc.heightOfString(paragraph, { width: contentWidth - ITEM_INDENT });
        if (y + height > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          if (header) drawRunningHeader(header);
          y = doc.y;
        }
        doc.y = y;
        richText(paragraph, [], { width: contentWidth, indent: ITEM_INDENT, align: "justify" });
        doc.x = left;
        y = doc.y + ITEM_GAP;
      }
      doc.y = y;
    }

    if (task.items.some((i) => i.referent)) {
      // Referent items share ONE line, as the official paper prints them:
      //   a) them (§1)        b) their (§2)        c) the problem (§3)
      // (user instruction, 2026-10-19). The old two-up flow wrapped the third
      // item onto a second line. Gaps absorb the leftover measure so the row
      // is spaced rather than crammed; if the items are genuinely too wide
      // the gap falls back to a single space and the row still stays one line.
      if (y + BODY * 1.5 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      const widths = task.items.map(itemWidth);
      const available = contentWidth - ITEM_INDENT;
      const sum = widths.reduce((total, w) => total + w, 0);
      const gap =
        task.items.length > 1
          ? Math.max(6, (available - sum) / (task.items.length - 1))
          : 0;

      let x = left + ITEM_INDENT;
      for (const item of task.items) {
        drawInlineItem(item, x, y);
        x += itemWidth(item) + gap;
      }
      doc.y = y + ITEM_ADVANCE;
      doc.x = left;
      return;
    }

    for (const item of task.items) {
      // Measure first, then break: a two-line item needs a different decision
      // from a one-line one, and the old fixed `BODY * 1.5` guess was wrong for
      // both when the item wrapped.
      const width = contentWidth - ITEM_INDENT - doc.widthOfString(`${item.label} `);
      const height = doc.font(faceFor(item.text, false, false)).fontSize(BODY).heightOfString(item.text, { width });
      if (y + height > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      y += drawItem(item, y) + ITEM_GAP;
    }
    doc.y = y;
    doc.x = left;
  };

  const drawTopic = (topic: PaperTopic) => {
    doc.moveDown(0.55);
    const y = doc.y;
    const labelW = doc.font(BOLD_ITALIC).fontSize(BODY).widthOfString(topic.label);
    doc.font(BOLD_ITALIC).fontSize(BODY).fillColor("#000000")
      .text(topic.label, left, y, { underline: true, lineBreak: false, width: labelW });
    doc.x = left;
    doc.y = y + BODY * 1.4;

    for (const line of topic.lines) {
      richText(line, [], { width: contentWidth, indent: ITEM_INDENT, align: "justify" });
      doc.moveDown(0.12);
    }
    if (topic.noteHeading) {
      doc.moveDown(0.18);
      font(BODY, true).fillColor("#000000").text(topic.noteHeading, left, doc.y, { width: contentWidth });
      doc.x = left;
      doc.moveDown(0.12);
      for (const note of topic.notes) {
        const ny = doc.y;
        font(BODY).fillColor("#000000").text("•", left + ITEM_INDENT + 4, ny, { lineBreak: false });
        font(BODY).fillColor("#000000").text(note, left + ITEM_INDENT + 18, ny, {
          width: contentWidth - ITEM_INDENT - 18,
        });
        doc.x = left;
        doc.y = ny + BODY * 1.3;
      }
    }
  };

  if (isBac && header) drawHeader(header);

  for (const block of paper.blocks as PaperBlock[]) {
    switch (block.kind) {
      case "masthead":
        // The official paper prints no Latin masthead; the Arabic header and the
        // section headings carry the identification.
        break;

      case "sectionHead":
        doc.moveDown(0.75);
        sectionHead(block.heading, block.marks);
        doc.y += BODY * 1.35;
        break;

      case "instruction":
        ital(BODY, true).fillColor("#000000").text(block.text, left, doc.y, { width: contentWidth });
        doc.x = left;
        doc.y += BODY * 1.45;
        break;

      case "passage":
        // No printed paragraph numbers: the official papers carry the reference
        // only on the item, as "its (§1)", so the passage stays clean prose.
        // No first-line indent (user rule 2026-10-11); paragraphs are separated
        // by PARA_GAP whitespace instead. DOCX mirrors this with
        // PASSAGE_GAP_AFTER; tune the two together against a real render.
        block.paragraphs.forEach((paragraph, pi) => {
          richText(
            paragraph,
            block.emphasisMarks.filter((mark) => mark.paragraph === pi + 1),
            {
              width: contentWidth,
              align: "justify",
            }
          );
          if (pi < block.paragraphs.length - 1) doc.moveDown(PARA_GAP);
        });
        break;

      case "sourceNote":
        ital(9.5, true).fillColor("#000000").text(block.text, left, doc.y, {
          width: contentWidth,
          align: "right",
        });
        doc.x = left;
        doc.y += BODY * 1.3;
        break;

      case "task":
        drawTask(block.task);
        break;

      case "table":
        doc.moveDown(0.2);
        drawTable(block.table);
        doc.y += BODY * 0.9;
        break;

      case "topic":
        drawTopic(block.topic);
        break;

      case "colophon":
        break;
    }
  }

  if (isBac) {
    try {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const footer = arabicPageFooter(i + 1, range.count);
        if (!isShaped(footer)) throw new Error("Footer shaping incomplete");
        const y = doc.page.height - 54;
        rule(y - 12, 0.7);
        doc.page.margins.bottom = 30;
        doc.font("Amiri").fontSize(9.5).fillColor("#000000")
          .text(footer, left, y, { width: contentWidth, align: "center" });
        doc.page.margins.bottom = 56;
      }
    } catch (err) {
      console.warn("Skipping page footers:", err instanceof Error ? err.message : err);
    }
  }

  doc.end();
  return done;
}