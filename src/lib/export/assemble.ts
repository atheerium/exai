// Assemble the exam document from the stored DTO for export (PRD section 18,
// Appendix A). Sections are ordered A (Reading Comprehension), B (Text
// exploration), C (Written expression) with marks taken from the guide.

import type { ExamDto, SectionDto } from "@/types";
import { getGuide } from "@/data/guides";
import { formatMarks } from "@/lib/utils";

export interface ExportText {
  title?: string;
  body?: string;
}

export interface ExportTask {
  instruction: string;
  prompt: string;
  marks: string;
}

export interface ExportTopic {
  title: string;
  situation: string;
  instruction: string;
  keywords?: string | null;
  form: string;
  marks: string;
}

export interface ExportSection {
  heading: string;
  marksLabel: string;
  text?: ExportText;
  sourceNote?: string;
  tasks: ExportTask[];
  topics: ExportTopic[];
}

export interface ExportDocument {
  title: string;
  subtitle: string;
  meta: string[];
  sections: ExportSection[];
  generatedBy: string;
}

export function assembleDocument(exam: ExamDto): ExportDocument {
  const grade = exam.config?.grade ?? "";
  const guide = grade ? getGuide(grade, exam.config?.language ?? "en", exam.config?.stream ?? undefined) : null;
  const section = (type: string): SectionDto | undefined => exam.sections.find((s) => s.type === type);
  const textSec = section("TEXT");
  const p1Sec = section("PART_ONE");
  const p2Sec = section("TEXT_EXPLORATION");
  const wSec = section("WRITING");

  const source = exam.sources[0];
  const sourceNote = source
    ? `${source.title ?? "Source"}${source.adaptationNote ? ` — ${source.adaptationNote}` : ""}`
    : null;

  const marks = (type: "partOne" | "textExploration" | "writing") =>
    guide ? formatMarks(guide.marks[type]) : "";

  const meta = [
    `Level: ${exam.config?.level === "middle" ? "Middle school" : "Secondary school"}`,
    `Grade: ${exam.config?.grade.toUpperCase() ?? "—"}`,
    exam.config?.stream ? `Stream: ${exam.config.stream}` : null,
    `Unit: ${exam.config?.unit ?? "—"}`,
    `Topic: ${exam.config?.topic ?? "—"}`,
    `Length: ${exam.config?.length ?? 150} words`,
    `Language: ${exam.config?.language === "fr" ? "French" : "English"}`,
    exam.config?.guideVersion ? `Guide: ${exam.config.guideVersion}` : null,
  ].filter(Boolean) as string[];

  const partOneTasks: ExportTask[] = (p1Sec?.tasks ?? []).map((t) => ({
    instruction: t.instruction ?? "",
    prompt: t.prompt,
    marks: formatMarks(t.marks),
  }));

  const p2Tasks: ExportTask[] = (p2Sec?.tasks ?? []).map((t) => ({
    instruction: t.instruction ?? "",
    prompt: t.prompt,
    marks: formatMarks(t.marks),
  }));

  const topics: ExportTopic[] = (wSec?.topics ?? []).map((t) => ({
    title: t.title ?? (t.kind === "GUIDED" ? "Topic 1" : "Topic 2"),
    situation: t.situation ?? "",
    instruction: t.instruction ?? "",
    keywords: t.keywords,
    form: t.form ?? "a paragraph",
    marks: formatMarks(t.marks),
  }));

  const partOneHeading = guide?.headings?.partOne ?? "A. Reading Comprehension";
  const textExplorationHeading = guide?.headings?.textExploration ?? guide?.textExploration.heading ?? "B. Text exploration";
  const writingHeading = guide?.headings?.writing ?? "C. Written expression";

  return {
    title: exam.title || "English Exam",
    subtitle: exam.config ? `English Examination — ${exam.config.grade.toUpperCase()}` : "English Examination",
    meta,
    sections: [
      {
        heading: partOneHeading,
        marksLabel: `${marks("partOne")} pts`,
        text: textSec?.text
          ? { title: textSec.textTitle ?? undefined, body: textSec.text }
          : undefined,
        sourceNote: sourceNote ?? undefined,
        tasks: partOneTasks,
        topics: [],
      },
      {
        heading: textExplorationHeading,
        marksLabel: `${marks("textExploration")} pts`,
        tasks: p2Tasks,
        topics: [],
      },
      {
        heading: writingHeading,
        marksLabel: `${marks("writing")} pts`,
        tasks: [],
        topics,
      },
    ],
    generatedBy: "Generated with Exaai",
  };
}
