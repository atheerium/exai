import PDFDocument from "pdfkit";
import type { ExportDocument, ExportTopic } from "./assemble";
import { readFileSync } from "fs";
import { join } from "path";
import { arabicLine, arabicPageFooter, isShaped } from "./arabic";

const TOPIC_WORDS = ["One", "Two", "Three", "Four", "Five"];

function splitNotes(keywords: string | null | undefined): string[] {
  if (!keywords) return [];
  return keywords
    .split(/[,/;\n]+/)
    .map((k) => k.trim().replace(/^[-–•\s]+/, ""))
    .filter(Boolean);
}

export async function renderPdf(docModel: ExportDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });
  const isBac = docModel.structure === "bac";

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const font = (size: number, bold = false) =>
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Official-paper header (BAC only): institutional Arabic block, shaped +
  // visual-ordered for pdfkit's left-to-right renderer. Lines are pure
  // Arabic with no mixed runs; stream/duration/session stay in the Latin
  // meta block below (stream names are French, no session year is stored).
  if (isBac) {
    try {
      const regular = join(process.cwd(), "public/fonts/Amiri-Regular.ttf");
      const bold = join(process.cwd(), "public/fonts/Amiri-Bold.ttf");
      readFileSync(regular);
      readFileSync(bold);
      doc.registerFont("Amiri", regular);
      doc.registerFont("Amiri-Bold", bold);
      const lines = [
        "الجمهورية الجزائرية الديمقراطية الشعبية",
        "وزارة التربية الوطنية",
        "الديوان الوطني للامتحانات والمسابقات",
        "امتحان بكالوريا التعليم الثانوي",
        "اختبار في مادة: اللغة الإنجليزية",
      ];
      const shaped = lines.map(arabicLine);
      if (!shaped.every(isShaped)) throw new Error("Arabic shaping incomplete");
      for (const line of shaped) {
        doc.font("Amiri").fontSize(11).fillColor("#111827").text(line, { align: "center" });
      }
      doc.moveDown(0.6);
    } catch (err) {
      console.warn("Skipping Arabic header:", err instanceof Error ? err.message : err);
    }
  }

  // Title block
  font(16, true).fillColor("#14532d").text(docModel.title, { align: "center" });
  font(10).fillColor("#4b5563").text(docModel.subtitle, { align: "center" });
  doc.moveDown(0.4);
  font(8.5).fillColor("#6b7280").text(docModel.meta.join("   ·   "), { align: "center" });
  doc.moveDown(0.6);

  // Section heading with marks on the same baseline, marks right-aligned.
  const sectionHead = (heading: string, marksLabel: string) => {
    const y0 = doc.y;
    font(12, true).fillColor("#111827").text(heading, { align: "left" });
    const yAfterHeading = doc.y;
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#374151")
      .text(marksLabel, doc.page.margins.left, y0, { width: contentWidth, align: "right" });
    doc.y = Math.max(yAfterHeading, doc.y);
    doc.x = doc.page.margins.left;
  };

  const topicLabel = (topic: ExportTopic, i: number): string =>
    isBac ? `Topic ${TOPIC_WORDS[i] ?? i + 1}:` : `${topic.title}  (${topic.marks} pts)`;

  for (const section of docModel.sections) {
    const isEmpty =
      !section.text?.body && section.tasks.length === 0 && section.topics.length === 0;
    const isHeadingOnly = !!section.heading && !!section.marksLabel;
    if (isEmpty && !isHeadingOnly) continue;

    doc.moveDown(0.8);
    sectionHead(section.heading, section.marksLabel);
    doc.moveDown(0.4);

    if (section.intro) {
      font(9.5, true).fillColor("#111827").text(section.intro);
      doc.moveDown(0.4);
    }

    if (section.text?.title) {
      font(10.5, true).fillColor("#111827").text(section.text.title);
      doc.moveDown(0.3);
    }
    if (section.text?.body) {
      font(10).fillColor("#111827").text(section.text.body, { align: "justify" });
      doc.moveDown(0.2);
    }
    if (section.sourceNote) {
      if (isBac) doc.font("Helvetica-Oblique");
      else font(8.5);
      font(8.5).fillColor("#6b7280").text(section.sourceNote, { align: "right" });
      font(8.5);
      doc.moveDown(0.4);
    }

    section.tasks.forEach((task, i) => {
      doc.moveDown(0.45);
      const label = isBac
        ? `${i + 1}- ${task.instruction}`.trim()
        : `Task ${i + 1}  (${task.marks} pts)`;
      font(9.5, true).fillColor("#111827").text(label);
      doc.moveDown(0.1);
      if (!isBac && task.instruction) {
        font(9).fillColor("#374151").text(task.instruction);
        doc.moveDown(0.1);
      }
      font(9.5).fillColor("#111827").text(task.prompt, { align: "left" });
      if (task.table && task.table.headers.length > 0) {
        doc.moveDown(0.3);
        drawTable(task.table.headers, task.table.rows);
        doc.moveDown(0.2);
      }
    });

    function drawTable(headers: string[], rows: string[][]) {
      const startX = doc.x;
      const availWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colCount = headers.length;
      const colWidth = availWidth / colCount;
      const padX = 4;
      const padY = 6;
      const textWidth = colWidth - padX * 2;
      const minHeight = 20;
      const x0 = startX;
      const pageBottom = () => doc.page.height - doc.page.margins.bottom;
      let y = doc.y;

      const measure = (cells: string[], bold: boolean): number => {
        font(8.5, bold).fillColor("#111827");
        let tallest = 0;
        for (const cell of cells) {
          tallest = Math.max(tallest, doc.heightOfString(cell ?? "", { width: textWidth }));
        }
        return Math.max(minHeight, tallest + padY * 2);
      };

      const headerH = measure(headers, true);
      // ensure space for at least header + 1 row
      if (y + headerH + minHeight > pageBottom()) {
        doc.addPage();
        y = doc.y;
      }

      // header row background
      doc.save().fillColor("#f3f4f6").rect(x0, y, availWidth, headerH).fill().restore();
      headers.forEach((h, ci) => {
        const x = x0 + ci * colWidth;
        doc.rect(x, y, colWidth, headerH).stroke();
        font(8.5, true).fillColor("#111827").text(h, x + padX, y + padY, { width: textWidth, align: "left" });
      });
      y += headerH;

      rows.forEach((row, ri) => {
        const h = measure(row, false);
        if (y + h > pageBottom()) {
          doc.addPage();
          y = doc.y;
        }
        const bg = ri % 2 === 1 ? "#f9fafb" : "#ffffff";
        doc.save().fillColor(bg).rect(x0, y, availWidth, h).fill().restore();
        row.forEach((cell, ci) => {
          const x = x0 + ci * colWidth;
          doc.rect(x, y, colWidth, h).stroke();
          font(8.5).fillColor("#111827").text(cell ?? "", x + padX, y + padY, { width: textWidth, align: "left" });
        });
        y += h;
      });
      doc.y = y;
      doc.x = x0;
    }

    section.topics.forEach((topic, i) => {
      doc.moveDown(0.5);
      font(9.5, true).fillColor("#111827").text(topicLabel(topic, i));
      doc.moveDown(0.1);
      if (topic.situation) {
        font(9.5).fillColor("#111827").text(topic.situation);
        doc.moveDown(0.1);
      }
      if (topic.instruction) {
        font(9.5).fillColor("#111827").text(topic.instruction);
        doc.moveDown(0.1);
      }
      const notes = splitNotes(topic.keywords);
      if (isBac && notes.length > 0) {
        font(9.5, true).fillColor("#111827").text("Make the best use of the following notes:");
        doc.moveDown(0.1);
        for (const note of notes) {
          font(9.5).fillColor("#111827").text(`-  ${note}`);
        }
        doc.moveDown(0.1);
      } else if (topic.keywords) {
        font(9.5, true).fillColor("#111827").text(`Key words: ${topic.keywords}`);
        doc.moveDown(0.1);
      }
    });
  }

  doc.moveDown(2);
  font(8).fillColor("#9ca3af").text(docModel.generatedBy, { align: "center" });

  // Page footers ("صفحة X من Y", visual order) across buffered pages.
  // pdfkit paginates any text drawn past the content bottom edge into fresh
  // blank pages, so the margin is relaxed only while stamping each footer.
  if (isBac) {
    try {
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 24;
        const footer = arabicPageFooter(i + 1, range.count);
        if (!isShaped(footer)) throw new Error("Footer shaping incomplete");
        const y = doc.page.height - 60 + 18;
        doc.font("Amiri").fontSize(9).fillColor("#6b7280")
          .text(footer, doc.page.margins.left, y, { width: contentWidth, align: "center" });
        doc.page.margins.bottom = 60;
      }
    } catch (err) {
      console.warn("Skipping page footers:", err instanceof Error ? err.message : err);
    }
  }

  doc.end();
  return done;
}
