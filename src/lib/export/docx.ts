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
  AlignmentType,
  Footer,
  PageNumberElement,
  SimpleField,
} from "docx";
import type { ExportDocument } from "./assemble";
import type { PaperItem, PaperTable, PaperTask, PaperTopic } from "./paper";
import { buildPaper } from "./paper";

const BODY = 20;
const INDENT = 360;
const GAP_LEADER = ". . . . . . . . . . . . . . . . . .";

const GRID = {
  top: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  insideH: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  insideV: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
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
      spacing: { after: 100 },
      children: [
        new TextRun({
          text,
          bold: opts.bold,
          italics: opts.italics,
          size: opts.size ?? BODY,
          color: opts.color ?? "111827",
        }),
      ],
    });

  const runs = (parts: { text: string; mark?: boolean }[]) =>
    parts.map((part) => new TextRun({ text: part.text, bold: part.mark, underline: part.mark ? {} : undefined, size: BODY, color: "111827" }));

  const passageParagraph = (text: string, emphasis: string[]) => {
    const targets = emphasis.filter((w) => w.length > 1);
    if (targets.length === 0) return p(text, { justify: true, indent: INDENT });
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
      indent: { left: INDENT, firstLine: 240 },
      spacing: { after: 120 },
      children: runs(parts),
    });
  };

  if (isBac) {
    const ar = (text: string, size = 11, bold = false) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: true,
        spacing: { after: 60 },
        children: [new TextRun({ text, bold, size: size * 2, color: "111827" })],
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
                    children: [new TextRun({ text: heading, bold: true, size: 24, color: "111827" })],
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
                    children: [new TextRun({ text: marks, bold: true, size: 22, color: "111827" })],
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
      indent: { left: INDENT + 320, hanging: 320 },
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${item.label}\t`, size: BODY, color: "111827" }),
        new TextRun({ text: item.text, size: BODY, color: "111827" }),
        ...(item.gap ? [new TextRun({ text: `  ${GAP_LEADER}`, size: BODY, color: "111827" })] : []),
      ],
      tabStops: [{ type: "left" as const, position: INDENT + 320 }],
    });

  const drawTable = (table: PaperTable) => {
    const headerRow = new TableRow({
      tableHeader: true,
      children: table.headers.map(
        (h) => new TableCell({ borders: GRID, children: [p(h, { size: 17, bold: true })] })
      ),
    });
    const dataRows = table.rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (cell) =>
              new TableCell({
                borders: GRID,
                children: [p(cell || " ", { size: 17 })],
              })
          ),
        })
    );
    children.push(
      new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: GRID,
      })
    );
  };

  const drawTask = (task: PaperTask) => {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({ text: `${task.number}.`, bold: true, size: BODY, color: "111827" }),
          new TextRun({ text: `  ${task.instruction}`, bold: true, italics: true, size: BODY, color: "111827" }),
        ],
      })
    );
    for (const line of task.lead) children.push(p(line, { indent: INDENT }));
    for (const item of task.items) children.push(itemParagraph(item));
  };

  const drawTopic = (topic: PaperTopic) => {
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 80 },
        children: [new TextRun({ text: topic.label, bold: true, size: BODY, color: "111827" })],
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
                new TextRun({ text: "صفحة ", size: 18, color: "6b7280" }),
                new PageNumberElement(),
                new TextRun({ text: " من ", size: 18, color: "6b7280" }),
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