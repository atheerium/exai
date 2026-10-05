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
import type { ExportDocument, ExportTopic } from "./assemble";

const TOPIC_WORDS = ["One", "Two", "Three", "Four", "Five"];

function splitNotes(keywords: string | null | undefined): string[] {
  if (!keywords) return [];
  return keywords
    .split(/[,/;\n]+/)
    .map((k) => k.trim().replace(/^[-–•\s]+/, ""))
    .filter(Boolean);
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideH: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideV: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

export async function renderDocx(docModel: ExportDocument): Promise<Buffer> {
  const isBac = docModel.structure === "bac";
  const children: (Paragraph | Table)[] = [];
  const footers: Footer[] = [];

  const p = (
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      italics?: boolean;
      color?: string;
      align?: "left" | "center" | "right";
    } = {}
  ) =>
    new Paragraph({
      alignment:
        opts.align === "center"
          ? AlignmentType.CENTER
          : opts.align === "right"
            ? AlignmentType.RIGHT
            : undefined,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text,
          bold: opts.bold,
          italics: opts.italics,
          size: (opts.size ?? 10) * 2,
          color: opts.color ?? "111827",
        }),
      ],
    });

  // Official-paper header (BAC only). Word shapes Arabic natively, so the
  // runs stay in logical order with right/center alignment. Stream, duration
  // and session stay in the Latin meta block (stream names are French and no
  // session year is stored).
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
    children.push(p("", { size: 4 }));
  }

  children.push(p(docModel.title, { size: 16, bold: true, align: "center", color: "14532d" }));
  children.push(p(docModel.subtitle, { size: 10, align: "center", color: "4b5563" }));
  children.push(p(docModel.meta.join("   ·   "), { size: 8.5, align: "center", color: "6b7280" }));

  // Section heading with marks on the same line: borderless two-cell table,
  // heading left + marks right (the installed docx build has no tab-stop
  // support wired for this shape, tables render identically everywhere).
  const sectionHead = (heading: string, marksLabel: string) => {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 82, type: WidthType.PERCENTAGE },
                children: [p(heading, { size: 12, bold: true })],
              }),
              new TableCell({
                borders: NO_BORDERS,
                width: { size: 18, type: WidthType.PERCENTAGE },
                children: [p(marksLabel, { size: 9.5, bold: true, color: "374151", align: "right" })],
              }),
            ],
          }),
        ],
      })
    );
  };

  const topicLabel = (topic: ExportTopic, i: number): string =>
    isBac ? `Topic ${TOPIC_WORDS[i] ?? i + 1}:` : `${topic.title}  (${topic.marks} pts)`;

  for (const section of docModel.sections) {
    const isEmpty = !section.text?.body && section.tasks.length === 0 && section.topics.length === 0;
    const isHeadingOnly = !!section.heading && !!section.marksLabel;
    if (isEmpty && !isHeadingOnly) continue;
    children.push(p("", { size: 6 }));
    sectionHead(section.heading, section.marksLabel);

    if (section.intro) children.push(p(section.intro, { size: 9.5, bold: true }));

    if (section.text?.title) children.push(p(section.text.title, { size: 10.5, bold: true }));
    if (section.text?.body) children.push(p(section.text.body, { size: 10 }));
    if (section.sourceNote)
      children.push(
        p(section.sourceNote, { size: 8.5, color: "6b7280", align: "right", italics: isBac })
      );

    section.tasks.forEach((task, i) => {
      const label = isBac ? `${i + 1}- ${task.instruction}`.trim() : `Task ${i + 1}  (${task.marks} pts)`;
      children.push(p(label, { size: 9.5, bold: true }));
      if (!isBac && task.instruction) children.push(p(task.instruction, { size: 9, color: "374151" }));
      children.push(p(task.prompt, { size: 9.5 }));
      if (task.table && task.table.headers.length > 0) {
        const borders = {
          top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          insideH: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
          insideV: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
        };
        const headerRow = new TableRow({
          children: task.table.headers.map(
            (h) =>
              new TableCell({
                borders,
                shading: { fill: "F3F4F6" },
                children: [p(h, { size: 8.5, bold: true })],
              })
          ),
        });
        const dataRows = task.table.rows.map(
          (row) =>
            new TableRow({
              children: row.map((cell) => new TableCell({ borders, children: [p(cell ?? "", { size: 8.5 })] })),
            })
        );
        const table = new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE }, borders });
        children.push(table);
      }
    });

    section.topics.forEach((topic, i) => {
      children.push(p(topicLabel(topic, i), { size: 9.5, bold: true }));
      if (topic.situation) children.push(p(topic.situation, { size: 9.5 }));
      if (topic.instruction) children.push(p(topic.instruction, { size: 9.5 }));
      const notes = splitNotes(topic.keywords);
      if (isBac && notes.length > 0) {
        children.push(p("Make the best use of the following notes:", { size: 9.5, bold: true }));
        for (const note of notes) children.push(p(`-  ${note}`, { size: 9.5 }));
      } else if (topic.keywords) {
        children.push(p(`Key words: ${topic.keywords}`, { size: 9.5, bold: true }));
      }
    });
  }

  children.push(p(docModel.generatedBy, { size: 8, color: "9ca3af", align: "center" }));

  if (isBac) {
    footers.push(
      new Footer({
        children: [
          new Paragraph({
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
      })
    );
  }

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
