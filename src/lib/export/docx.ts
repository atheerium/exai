import { Document, Packer, Paragraph, TextRun } from "docx";
import type { ExportDocument } from "./assemble";

export async function renderDocx(docModel: ExportDocument): Promise<Buffer> {
  const children: Paragraph[] = [];

  const p = (text: string, opts: { size?: number; bold?: boolean; color?: string; align?: "left" | "center" } = {}) =>
    new Paragraph({
      alignment: opts.align === "center" ? "center" : undefined,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text,
          bold: opts.bold,
          size: (opts.size ?? 10) * 2,
          color: opts.color ?? "111827",
        }),
      ],
    });

  children.push(p(docModel.title, { size: 16, bold: true, align: "center", color: "14532d" }));
  children.push(p(docModel.subtitle, { size: 10, align: "center", color: "4b5563" }));
  children.push(p(docModel.meta.join("   ·   "), { size: 8.5, align: "center", color: "6b7280" }));

  for (const section of docModel.sections) {
    const isEmpty = !section.text?.body && section.tasks.length === 0 && section.topics.length === 0;
    if (isEmpty) continue;
    children.push(p("", { size: 6 }));
    children.push(p(section.heading, { size: 12, bold: true }));
    children.push(p(section.marksLabel, { size: 9.5, bold: true, color: "374151" }));

    if (section.text?.title) children.push(p(section.text.title, { size: 10.5, bold: true }));
    if (section.text?.body) children.push(p(section.text.body, { size: 10 }));
    if (section.sourceNote) children.push(p(section.sourceNote, { size: 8.5, color: "6b7280", align: "center" }));

    section.tasks.forEach((task, i) => {
      children.push(p(`Task ${i + 1}  (${task.marks} pts)`, { size: 9.5, bold: true }));
      if (task.instruction) children.push(p(task.instruction, { size: 9, color: "374151" }));
      children.push(p(task.prompt, { size: 9.5 }));
    });

    section.topics.forEach((topic, i) => {
      children.push(p(`${topic.title}  (${topic.marks} pts)`, { size: 9.5, bold: true }));
      if (topic.situation) children.push(p(topic.situation, { size: 9.5 }));
      if (topic.instruction) children.push(p(topic.instruction, { size: 9.5 }));
      if (topic.keywords) children.push(p(`Key words: ${topic.keywords}`, { size: 9.5, bold: true }));
    });
  }

  children.push(p(docModel.generatedBy, { size: 8, color: "9ca3af", align: "center" }));

  const doc = new Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
