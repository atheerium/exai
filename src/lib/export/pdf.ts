import PDFDocument from "pdfkit";
import type { ExportDocument } from "./assemble";

export async function renderPdf(docModel: ExportDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 60, bufferPages: true });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const font = (size: number, bold = false) =>
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);

  // Header
  font(16, true).fillColor("#14532d").text(docModel.title, { align: "center" });
  font(10).fillColor("#4b5563").text(docModel.subtitle, { align: "center" });
  doc.moveDown(0.4);
  font(8.5).fillColor("#6b7280").text(docModel.meta.join("   ·   "), { align: "center" });
  doc.moveDown(0.6);

  for (const section of docModel.sections) {
    const isEmpty =
      !section.text?.body && section.tasks.length === 0 && section.topics.length === 0;
    if (isEmpty) continue;

    doc.moveDown(0.8);
    font(12, true).fillColor("#111827").text(section.heading, { continued: false });
    doc.moveDown(0.2);
    font(9.5, true).fillColor("#374151").text(section.marksLabel);
    doc.moveDown(0.5);

    if (section.text?.title) {
      font(10.5, true).fillColor("#111827").text(section.text.title);
      doc.moveDown(0.3);
    }
    if (section.text?.body) {
      font(10).fillColor("#111827").text(section.text.body, { align: "justify" });
      doc.moveDown(0.2);
    }
    if (section.sourceNote) {
      font(8.5).fillColor("#6b7280").text(section.sourceNote, { align: "right" });
      doc.moveDown(0.4);
    }

    section.tasks.forEach((task, i) => {
      doc.moveDown(0.45);
      font(9.5, true).fillColor("#111827").text(`Task ${i + 1}  (${task.marks} pts)`);
      doc.moveDown(0.1);
      if (task.instruction) {
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
    const rowHeight = 20;
    const x0 = startX;
    let y = doc.y;

    // ensure space for at least header + 1 row
    if (y + rowHeight * (rows.length + 1) > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.y;
    }

    // header row background
    doc.save().fillColor("#f3f4f6").rect(x0, y, availWidth, rowHeight).fill().restore();
    headers.forEach((h, ci) => {
      const x = x0 + ci * colWidth;
      doc.rect(x, y, colWidth, rowHeight).stroke();
      font(8.5, true).fillColor("#111827").text(h, x + 4, y + 6, { width: colWidth - 8, align: "left" });
    });
    y += rowHeight;

    rows.forEach((row, ri) => {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.y;
      }
      const bg = ri % 2 === 1 ? "#f9fafb" : "#ffffff";
      doc.save().fillColor(bg).rect(x0, y, availWidth, rowHeight).fill().restore();
      row.forEach((cell, ci) => {
        const x = x0 + ci * colWidth;
        doc.rect(x, y, colWidth, rowHeight).stroke();
        font(8.5).fillColor("#111827").text(cell ?? "", x + 4, y + 6, { width: colWidth - 8, align: "left" });
      });
      y += rowHeight;
    });
    doc.y = y;
    doc.x = x0;
  }

    section.topics.forEach((topic, i) => {
      doc.moveDown(0.5);
      font(9.5, true).fillColor("#111827").text(`${topic.title}  (${topic.marks} pts)`);
      doc.moveDown(0.1);
      if (topic.situation) {
        font(9.5).fillColor("#111827").text(topic.situation);
        doc.moveDown(0.1);
      }
      if (topic.instruction) {
        font(9.5).fillColor("#111827").text(topic.instruction);
        doc.moveDown(0.1);
      }
      if (topic.keywords) {
        font(9.5, true).fillColor("#111827").text(`Key words: ${topic.keywords}`);
        doc.moveDown(0.1);
      }
    });
  }

  doc.moveDown(2);
  font(8).fillColor("#9ca3af").text(docModel.generatedBy, { align: "center" });

  doc.end();
  return done;
}
