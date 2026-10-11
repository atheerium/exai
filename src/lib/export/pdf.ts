import PDFDocument from "pdfkit";
import type { ExportDocument, ExportHeader } from "./assemble";
import type { PaperBlock, PaperItem, PaperTable, PaperTask, PaperTopic } from "./paper";
import { buildPaper } from "./paper";
import { readFileSync } from "fs";
import { join } from "path";
import { arabicLine, arabicMixedRun, arabicPageFooter, isShaped } from "./arabic";

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
// Q4 items run two-up on one line: "a) its (§1)      b) them (§2)"
const INLINE_ITEM_GAP = 26;
const GAP_LEADER = "................";
/**
 * Vertical whitespace between passage paragraphs, in pdfkit line units
 * (1 ≈ one BODY line). The passage has no first-line indent; the rhythm comes
 * from here. DOCX equivalent: PASSAGE_GAP_AFTER in docx.ts.
 */
const PARA_GAP = 0.55;

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
  const richText = (text: string, emphasis: string[], opts: RichOpts) => {
    font(BODY).fillColor("#000000");
    const lineHeight = opts.lineHeight ?? BODY * 1.32;
    const textX = opts.x ?? left + (opts.indent ?? 0);
    const textWidth = opts.width - (opts.indent ?? 0);
    const marks = new Set(emphasis.filter((w) => w.length > 1).map((w) => w.toLowerCase()));

    const space = doc.widthOfString(" ");
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    // A marked word may carry punctuation ("motivated." / "organisation,"), so
    // the token is matched on its alphabetic core and the surrounding marks are
    // drawn in the regular face. Returns the core and its offsets, or null.
    const splitCore = (token: string): { core: string; start: number; end: number } | null => {
      const m = /^[^\p{L}\p{N}]*([\p{L}\p{N}][\p{L}\p{N}'’-]*)[^\p{L}\p{N}]*$/u.exec(token);
      if (!m) return null;
      return { core: m[1], start: m.index, end: m.index + m[1].length };
    };

    const isMarked = (token: string): boolean => {
      const core = splitCore(token);
      return core !== null && marks.has(core.core.toLowerCase());
    };

    // Marked words are set bold, so they must be measured as bold both when
    // packing lines and when placing them, or wrapping drifts.
    const wordWidth = (word: string): number => {
      font(BODY, isMarked(word)).fillColor("#000000");
      return doc.widthOfString(word);
    };

    const lines: { words: string[]; width: number }[] = [];
    let current: string[] = [];
    let currentWidth = 0;
    for (const word of words) {
      const ww = wordWidth(word);
      const advance = (current.length > 0 ? space : 0) + ww;
      if (current.length > 0 && currentWidth + advance > textWidth) {
        lines.push({ words: current, width: currentWidth });
        current = [word];
        currentWidth = ww;
      } else {
        current.push(word);
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
      for (const word of line.words) {
        const core = splitCore(word);
        const marked = core !== null && marks.has(core.core.toLowerCase());
        const ww = wordWidth(word);
        if (!marked || core === null) {
          doc.text(word, x, y, { underline: marked, lineBreak: false, width: ww });
          x += ww + space + gap;
          continue;
        }
        // Draw the punctuation, then the bold+underlined core, then the rest.
        const prefix = word.slice(0, core.start);
        const suffix = word.slice(core.end);
        if (prefix) doc.text(prefix, x, y, { lineBreak: false, width: doc.widthOfString(prefix) });
        x += doc.widthOfString(prefix);
        const coreW = doc.widthOfString(word.slice(core.start, core.end));
        font(BODY, true).fillColor("#000000");
        doc.text(word.slice(core.start, core.end), x, y, { underline: true, lineBreak: false, width: coreW });
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
   * Referent items print two-up on one line, separated by a wide gap:
   *   a) its (§1).............     b) them (§2).............
   * Falls back to one-per-line when the pair would not fit the measure.
   */
  const drawInlineItem = (item: PaperItem, x: number, y: number): number => {
    font(BODY, true).fillColor("#000000").text(`${item.label}`, x, y, { lineBreak: false });
    const labelW = doc.widthOfString(`${item.label} `);
    font(BODY).fillColor("#000000").text(item.text, x + labelW, y, { lineBreak: false });

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

  const drawItem = (item: PaperItem, y: number) => {
    font(BODY, true).fillColor("#000000").text(`${item.label}`, left + ITEM_INDENT, y, { lineBreak: false });

    const labelWidth = doc.widthOfString(`${item.label} `);
    const body = item.ref ? `${item.text} ${item.ref}` : item.text;
    font(BODY).fillColor("#000000").text(item.text, left + ITEM_INDENT + labelWidth, y, {
      width: contentWidth - ITEM_INDENT - labelWidth,
    });

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
  };

  const drawTable = (table: PaperTable) => {
    const colCount = table.headers.length;
    const colWidth = contentWidth / colCount;
    const padX = 5;
    const padY = 5;
    const textWidth = colWidth - padX * 2;
    const minHeight = 20;
    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    let y = doc.y;

    const measure = (cells: string[], bold: boolean): number => {
      font(BODY - 1, bold);
      let tallest = 0;
      for (const cell of cells) tallest = Math.max(tallest, doc.heightOfString(cell || " ", { width: textWidth }));
      return Math.max(minHeight, tallest + padY * 2);
    };

    const headerH = measure(table.headers, true);
    if (y + headerH + minHeight > pageBottom()) {
      doc.addPage();
      if (header) drawRunningHeader(header);
      y = doc.y;
    }

    doc.save().lineWidth(0.8).strokeColor("#000000");
    table.headers.forEach((h, ci) => {
      const x = left + ci * colWidth;
      doc.rect(x, y, colWidth, headerH).stroke();
      font(BODY - 1, true).fillColor("#000000").text(h, x + padX, y + padY, {
        width: textWidth,
        align: "center",
      });
    });
    y += headerH;

    table.rows.forEach((row) => {
      const h = measure(row, false);
      if (y + h > pageBottom()) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      row.forEach((cell, ci) => {
        const x = left + ci * colWidth;
        doc.rect(x, y, colWidth, h).stroke();
        font(BODY - 1).fillColor("#000000").text(cell || " ", x + padX, y + padY, { width: textWidth });
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
    const blockH = stemH + task.lead.length * (BODY * 1.3) + task.items.length * (BODY * 1.45);
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
      font(BODY).fillColor("#000000").text(line, left + ITEM_INDENT, doc.y, {
        width: contentWidth - ITEM_INDENT,
      });
      doc.x = left;
      doc.moveDown(0.06);
    }

    let y = doc.y;
    if (task.items.some((i) => i.referent)) {
      // Referent items share lines two-up, exactly as the official papers print them.
      let x = left + ITEM_INDENT;
      for (const item of task.items) {
        if (y + BODY * 1.5 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          if (header) drawRunningHeader(header);
          y = doc.y;
          x = left + ITEM_INDENT;
        }
        const need = itemWidth(item);
        if (x > left + ITEM_INDENT && x + need > left + contentWidth) {
          y += BODY * 1.5;
          x = left + ITEM_INDENT;
        }
        drawInlineItem(item, x, y);
        x += Math.max(need, INLINE_ITEM_GAP) + INLINE_ITEM_GAP;
      }
      doc.y = y + BODY * 1.5;
      doc.x = left;
      return;
    }

    for (const item of task.items) {
      if (y + BODY * 1.5 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        if (header) drawRunningHeader(header);
        y = doc.y;
      }
      drawItem(item, y);
      y += BODY * 1.5;
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
          richText(paragraph, block.emphasis, {
            width: contentWidth,
            align: "justify",
          });
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

      case "wordList": {
        doc.moveDown(0.1);
        font(BODY).fillColor("#000000").text(block.words.join(" - "), left, doc.y, {
          width: contentWidth,
          align: "center",
        });
        doc.x = left;
        doc.y += BODY * 1.4;
        break;
      }

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