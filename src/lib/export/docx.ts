import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  HeightRule,
  ShadingType,
  AlignmentType,
  Footer,
  PageNumberElement,
  SimpleField,
} from "docx";
import type { ExportDocument } from "./assemble";
import type { PaperItem, PaperTable, PaperTask, PaperTopic } from "./paper";
import { buildPaper, WORD_BANK_SEPARATOR } from "./paper";
import { BLANK_ROW_HEIGHT } from "./tables";

const BODY = 20;
const INDENT = 360;
const GAP_LEADER = ". . . . . . . . . . . . . . . . . .";

/**
 * Times New Roman, the Ministry's exam face (user instruction 2026-10-11).
 *
 * Every run goes through `t()` so no TextRun can be created without it. DOCX
 * previously set no font at all, so Word fell back to Calibri and the export did
 * not match the PDF.
 */
const FONT = "Times New Roman";

/**
 * Vertical whitespace between passage paragraphs, in twentieths of a point.
 * No first-line indent (user rule, 2026-10-11). The PDF equivalent is PARA_GAP
 * in pdf.ts; the two are tuned together against a real render.
 */
const PASSAGE_GAP_AFTER = 200;

/**
 * Exact line spacing, in twentieths of a point, applied to body text.
 *
 * Left unset, Word sizes lines from the font's own metrics and the passage
 * renders looser than the PDF next to the Ministry reference sheet (user
 * instruction, 2026-10-11: "reduce the line spacing by two levels"). Pinning it
 * here makes the DOCX rhythm match PDF's LINE_HEIGHT instead of depending on
 * whichever font the reader machine substitutes.
 */
const LINE_SPACING = 250;

/**
 * Table width as a percentage of the text block. Narrower than full width so a
 * three-column affix chart is centred rather than spanning the page (user
 * screenshot, 2026-10-11). PDF equivalent: TABLE_MAX_WIDTH in pdf.ts.
 */
const TABLE_WIDTH_PCT = 70;

type RunOpts = {
  bold?: boolean;
  italics?: boolean;
  underline?: Record<string, never>;
  size?: number;
  color?: string;
};

/** The only place a TextRun is constructed, so the font cannot be forgotten. */
const t = (text: string, opts: RunOpts = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? BODY, color: opts.color ?? "111827", ...opts });

/**
 * Table text size, in half-points, so it matches the PDF's 12pt body exactly.
 * The old value (17, i.e. 8.5pt) made DOCX tables print visibly smaller than the
 * PDF's beside them; with 1pt borders and 32pt rows the table is a focal element
 * and a font mismatch is the first thing a reader notices.
 */
const TABLE_TEXT_SIZE = 24;

/**
 * Explicit white cell fill (user instruction, 2026-10-13).
 *
 * Word's default is white, but a theme's table style can tint cells without any
 * explicit shading on the cell, so "no shading" and "white" are not the same
 * document. Stating it is the only way the printed chart is guaranteed to have
 * no banding.
 */
const NO_SHADING = { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" } as const;

/**
 * 1pt solid black on every edge, at the cell AND the table level.
 *
 * Both are emitted on purpose. docx serialises `insideH`/`insideV` as its own
 * defaults (0.5pt, `auto`) whatever the value passed here, so a table whose
 * cells all carry their own borders renders 1pt everywhere — but an editor that
 * prefers the table-level definition would show 0.5pt inner lines. `insideH` /
 * `insideV` and their modern spellings are both set so neither wins.
 */
const GRID = {
  top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  insideH: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  insideV: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
};

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideH: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideV: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

export async function renderDocx(docModel: ExportDocument): Promise<Buffer> {
  const paper = buildPaper(docModel);
  const isBac = paper.structure === "bac";
  const children: (Paragraph | Table)[] = [];

  const p = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      italics?: boolean;
      color?: string;
      align?: "left" | "center" | "right";
      indent?: number;
      justify?: boolean;
      after?: number;
    } = {}
  ) =>
    new Paragraph({
      alignment:
        opts.align === "center"
          ? AlignmentType.CENTER
          : opts.align === "right"
            ? AlignmentType.RIGHT
            : opts.justify
              ? AlignmentType.JUSTIFIED
              : undefined,
      indent: opts.indent ? { left: opts.indent } : undefined,
      spacing: { after: opts.after ?? 100, line: LINE_SPACING, lineRule: "auto" },
      children: [
        t(text, {
          bold: opts.bold,
          italics: opts.italics,
          size: opts.size ?? BODY,
          color: opts.color,
        }),
      ],
    });

  const runs = (parts: { text: string; mark?: boolean }[]) =>
    parts.map((part) => t(part.text, { bold: part.mark, underline: part.mark ? {} : undefined }));

  const passageParagraph = (text: string, emphasis: string[]) => {
    const targets = emphasis.filter((w) => w.length > 1);
    // Rule (user 2026-10-11): passages carry NO first-line indent; paragraphs are
    // separated by whitespace instead. DOCX spacing is in twentieths of a point,
    // so PASSAGE_GAP_AFTER here and PARA_GAP in pdf.ts express the same rhythm.
    if (targets.length === 0) return p(text, { justify: true, after: PASSAGE_GAP_AFTER });
    const re = new RegExp(`\\b(${targets.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
    const parts: { text: string; mark?: boolean }[] = [];
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > cursor) parts.push({ text: text.slice(cursor, m.index) });
      parts.push({ text: m[0], mark: true });
      cursor = m.index + m[0].length;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor) });

    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: PASSAGE_GAP_AFTER, line: LINE_SPACING, lineRule: "auto" },
      children: runs(parts),
    });
  };

  if (isBac) {
    // Arabic deliberately bypasses the `t()` factory: Times New Roman has no
    // Arabic glyphs, so these runs name Amiri explicitly and let Word shape the
    // text (DOCX needs no manual shaping, unlike the PDF path).
    const arRun = (text: string, size = 11, bold = false) =>
      new TextRun({ text, font: "Amiri", bold, size: size * 2, color: "111827" });
    const ar = (text: string, size = 11, bold = false) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        spacing: { after: 60 },
        children: [arRun(text, size, bold)],
      });
    children.push(ar("الجمهورية الجزائرية الديمقراطية الشعبية", 11, true));
    children.push(ar("وزارة التربية الوطنية"));
    children.push(ar("الديوان الوطني للامتحانات والمسابقات"));
    children.push(ar("امتحان بكالوريا التعليم الثانوي", 11, true));
    children.push(ar("اختبار في مادة: اللغة الإنجليزية"));
  }

  const sectionHead = (heading: string, marks: string) => {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 80, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    spacing: { after: 100 },
                    children: [t(heading, { bold: true, size: 24 })],
                  }),
                ],
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 20, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    spacing: { after: 100 },
                    children: [t(marks, { bold: true, size: 22 })],
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  };

  const itemParagraph = (item: PaperItem) =>
    new Paragraph({
      // Hanging indent so wrapped option text lines up under the option itself,
      // but the label and its text are separated by exactly ONE space: a tab
      // stop here jumped ~0.22in and read as a gap (user instruction,
      // 2026-10-11).
      indent: { left: INDENT + 320, hanging: 320 },
      spacing: { after: 40 },
      children: [
        t(`${item.label} `, { bold: true }),
        t(item.text),
        ...(item.gap ? [t(`  ${GAP_LEADER}`)] : []),
      ],
    });

  const drawTable = (table: PaperTable) => {
    // Official style (user screenshot, 2026-10-11): table centred, headers bold
    // italic and centred. PDF equivalent: TABLE_MAX_WIDTH in pdf.ts.
    const colCount = table.headers.length;
    const cellWidth = Math.floor((100 / colCount) * 100) / 100;

    const headerRow = new TableRow({
      tableHeader: true,
      children: table.headers.map(
        (h) =>
          new TableCell({
            borders: GRID,
            shading: NO_SHADING,
            width: { size: cellWidth, type: WidthType.PERCENTAGE },
            children: [p(h, { size: TABLE_TEXT_SIZE, bold: true, italics: true, align: "center" })],
          })
      ),
    });

    const dataRows = table.rows.map(
      (row) =>
        new TableRow({
          // A row the student writes in is at least BLANK_ROW_HEIGHT tall even
          // when every cell is blank (user instruction, 2026-10-13): an empty
          // row that collapses to one text line leaves nowhere to write.
          height: { value: BLANK_ROW_HEIGHT * 20, rule: HeightRule.ATLEAST },
          children: table.headers.map((_, ci) => {
            const cell = row[ci] ?? "";
            const dotted = /^\.+$/.test(cell.trim());
            return new TableCell({
              borders: GRID,
              shading: NO_SHADING,
              width: { size: cellWidth, type: WidthType.PERCENTAGE },
              children: [
                p(cell || " ", {
                  size: TABLE_TEXT_SIZE,
                  align: dotted ? "center" : "left",
                }),
              ],
            });
          }),
        })
    );

    children.push(
      new Paragraph({ spacing: { after: 0 }, children: [t("", { size: 2 })] })
    );
    children.push(
      new Table({
        rows: [headerRow, ...dataRows],
        width: { size: TABLE_WIDTH_PCT, type: WidthType.PERCENTAGE },
        alignment: AlignmentType.CENTER,
        borders: GRID,
      })
    );
  };

  const drawTask = (task: PaperTask) => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          t(`${task.number}.`, { bold: true }),
          t(`  ${task.instruction}`, { bold: true, italics: true }),
        ],
      })
    );
    for (const line of task.lead) children.push(p(line, { indent: INDENT }));
    // Centred word bank, between the instruction and the first item, matching
    // the PDF. Absent from the DOCX entirely before this, so a GAP_FILL task was
    // unanswerable in Word.
    if (task.wordList) children.push(p(task.wordList.join(WORD_BANK_SEPARATOR), { align: "center" }));
    for (const item of task.items) children.push(itemParagraph(item));
  };

  const drawTopic = (topic: PaperTopic) => {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        children: [t(topic.label, { bold: true })],
      })
    );
    for (const line of topic.lines) children.push(p(line, { indent: INDENT }));
    if (topic.noteHeading) {
      children.push(p(topic.noteHeading, { indent: INDENT, bold: true }));
      for (const note of topic.notes) children.push(p(`-  ${note}`, { indent: INDENT + 200 }));
    }
  };

  for (const block of paper.blocks) {
    switch (block.kind) {
      case "masthead":
        children.push(p(block.title, { size: 30, bold: true, align: "center" }));
        children.push(p(block.subtitle, { size: 19, align: "center", color: "4b5563" }));
        if (block.meta.length > 0) {
          children.push(p(block.meta.join("   ·   "), { size: 16, align: "center", color: "6b7280" }));
        }
        break;
      case "sectionHead":
        children.push(p("", { size: 12 }));
        sectionHead(block.heading, block.marks);
        break;
      case "instruction":
        children.push(p(block.text, { size: BODY, bold: true, italics: true }));
        break;
      case "passage":
        if (block.title) children.push(p(block.title, { size: 21, bold: true, align: "center" }));
        for (const paragraph of block.paragraphs) children.push(passageParagraph(paragraph, block.emphasis));
        break;
      case "sourceNote":
        children.push(p(block.text, { size: 18, align: "right", italics: true, bold: true }));
        break;
      case "task":
        drawTask(block.task);
        break;
      case "table":
        children.push(p("", { size: 10 }));
        drawTable(block.table);
        children.push(p("", { size: 10 }));
        break;
      case "topic":
        drawTopic(block.topic);
        break;
      case "colophon":
        children.push(p("", { size: 12 }));
        children.push(p(block.text, { size: 15, align: "center", color: "9ca3af" }));
        break;
    }
  }

  const footers: Footer[] = isBac
    ? [
        new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: "9CA3AF", space: 6 } },
              alignment: AlignmentType.CENTER,
              bidirectional: true,
              children: [
                // Arabic page footer: Amiri, same reasoning as the header above.
                new TextRun({ text: "صفحة ", font: "Amiri", size: 18, color: "6b7280" }),
                new PageNumberElement(),
                new TextRun({ text: " من ", font: "Amiri", size: 18, color: "6b7280" }),
                new SimpleField("NUMPAGES", "1"),
              ],
            }),
          ],
        }),
      ]
    : [];

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
        footers: footers.length > 0 ? { default: footers[0] } : undefined,
      },
    ],
  });
  return Packer.toBuffer(doc);
}