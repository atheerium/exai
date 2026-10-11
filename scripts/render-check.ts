// Throwaway render harness: builds a full exam through the real generation path
// and writes a PDF so the format rules can be inspected without a database.
import { writeFileSync } from "node:fs";
import { generateFullExam } from "../src/lib/generate/full-exam";
import { assembleDocument } from "../src/lib/export/assemble";
import { renderPdf } from "../src/lib/export/pdf";
import { GRADES, getGuide } from "../src/data/guides";
import type { ExamDto, GeneratedTask, SectionDto } from "../src/types";

const gd = GRADES["3as"]!;
const stream = gd.streams![1];
const guide = getGuide("3as", "en", stream)!;
const unit = gd.units.find((u) => !u.streams || u.streams.includes(stream!)) ?? gd.units[0];

async function main() {
const r = await generateFullExam({
  level: "secondary",
  grade: "3as",
  stream,
  unit: unit.key,
  topic: unit.topics[0],
  length: guide.defaultLength,
  examId: "check-1",
  singleTopic: false,
});
if (!r.ok) {
  console.error("GENERATION FAILED", JSON.stringify(r.issues, null, 1));
  process.exit(1);
}

const taskDto = (t: GeneratedTask, i: number, id: string) => ({
  id: `${id}-${i}`,
  order: i,
  manualEdited: false,
  skill: t.skill ?? null,
  family: t.family ?? null,
  prompt: t.prompt,
  instruction: t.instruction,
  answer: t.answer ?? null,
  marks: t.marks,
  table: t.table ?? null,
  candidates: [],
});

const w = r.writing![0];
const section = (partial: Partial<SectionDto> & { id: string; type: SectionDto["type"] }): SectionDto => ({
  order: 0,
  candidates: [],
  tasks: [],
  topics: [],
  ...partial,
});

const dto: ExamDto = {
  id: "check-1",
  title: "English Exam",
  status: "DRAFT",
  config: {
    level: "secondary",
    grade: "3as",
    stream,
    length: guide.defaultLength,
    unit: unit.key,
    topic: unit.topics[0],
    customTopic: false,
    language: "en",
    guideVersion: guide.version,
    teacherKeywords: null,
    difficulty: null,
  },
  sections: [
    section({ id: "s-text", type: "TEXT", order: 1, heading: "Part One: Reading", text: r.text!.text, textTitle: r.text!.title }),
    section({ id: "s-p1", type: "PART_ONE", order: 2, heading: guide.headings?.partOne ?? "A. Reading", tasks: r.partOne![0].map((t, i) => taskDto(t, i, "p1")) }),
    section({ id: "s-p2", type: "TEXT_EXPLORATION", order: 3, heading: guide.headings?.textExploration ?? "B. Text Exploration", tasks: r.textExploration![0].map((t, i) => taskDto(t, i, "p2")) }),
    section({
      id: "s-w",
      type: "WRITING",
      order: 4,
      heading: guide.headings?.writing ?? "Part Two",
      topics: [
        {
          id: "t-g",
          kind: "GUIDED",
          order: 0,
          manualEdited: false,
          title: w.guided.title,
          situation: w.guided.situation,
          instruction: w.guided.instruction,
          keywords: w.guided.keywords ?? null,
          form: w.guided.form,
          marks: w.guided.marks,
          candidates: [],
        },
      ],
    }),
  ],
  sources: [],
  lastOpenedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const pdf = await renderPdf(assembleDocument(dto));
writeFileSync("/tmp/opencode/examcheck/exam.pdf", pdf);
console.log("wrote /tmp/opencode/examcheck/exam.pdf", pdf.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});