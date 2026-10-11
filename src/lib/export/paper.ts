// Deterministic official-paper layout.
//
// assemble.ts yields the content model (headings, passage, tasks, tables,
// topics); this module flattens it into an ordered block list with fixed
// typography rules. PDF, DOCX and the builder preview all walk this same list,
// so the three surfaces cannot drift apart and one exam always yields one
// layout. The rules mirror the Algerian BAC English paper: section heading with
// the marks flush right on one line, one bold-italic instruction line, passage
// justified with underlined target words, right-aligned source note, tasks
// numbered "1." with items lettered "a." "b." beneath, dotted answer gaps, and
// a hairline rule above the centred page number.

import type { ExportDocument, ExportHeader, ExportTask, ExportTopic } from "./assemble";
import { isReferentWord, paragraphIndexOf } from "@/lib/generate/referents";

export interface PaperTable {
  headers: string[];
  rows: string[][];
}

export interface PaperItem {
  label: string;
  text: string;
  gap: boolean;
  /** "(§2)" — the paragraph this referent sits in, printed inline on the paper. */
  ref: string | null;
  /** True when the item is a referent whose word is bold+underlined in the passage. */
  referent: boolean;
}

export interface PaperTask {
  number: number;
  instruction: string;
  lead: string[];
  items: PaperItem[];
  wordList: string | null;
  table: PaperTable | null;
}
export interface PaperTopic {
  label: string;
  lines: string[];
  notes: string[];
  noteHeading: string | null;
}

export type PaperBlock =
  | { kind: "masthead"; title: string; subtitle: string; meta: string[] }
  | { kind: "sectionHead"; heading: string; marks: string }
  | { kind: "instruction"; text: string }
  | { kind: "passage"; title: string | null; paragraphs: string[]; emphasis: string[] }  | { kind: "sourceNote"; text: string }
  | { kind: "task"; task: PaperTask }
  | { kind: "wordList"; words: string[] }
  | { kind: "table"; table: PaperTable }
  | { kind: "topic"; topic: PaperTopic }
  | { kind: "colophon"; text: string };

export interface Paper {
  blocks: PaperBlock[];
  structure: "bac" | "bem";
  header: ExportHeader | null;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

/** 0 -> "a.", 25 -> "z.", 26 -> "aa." */
/**
 * Choice label for an item: lowercase letter + `)`, e.g. `a)` (user rule,
 * 2026-10-11 — screenshot 1).
 *
 * The label carries its own `)`, so renderers must print `item.label` verbatim
 * rather than appending a separator. Previously the label was `A.` and the PDF
 * appended `)`, which printed `A.)`.
 */
export function letterLabel(index: number): string {
  let n = index;
  let out = "";
  do {
    out = LETTERS[n % 26] + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${out.toLocaleLowerCase()})`;
}

// Generated prompts are a flat newline-separated block in one of two shapes:
// "1. first\n2. second" or "A. first\nB. second", sometimes preceded by a
// free-standing lead-in line. Both prefixes must render as lettered items, and
// a dotted run at the end of an item is the student's answer slot.
const NUMBERED = /^(\d+)[.)]\s+(.*)$/;
const LETTERED = /^([A-Za-z])[.)]\s+(.*)$/;
const GAP = /(?:→|:)?\s*\.{3,}\s*$/;
const UNDERLINED = /^"([^"]+)"\s*\(underlined\)$/;
// "(§2)" — the paragraph an item refers back to, printed inline on the paper.
const PARA_REF = /\s*\(§\s*(\d+)\s*\)/;

export function parseTaskBody(prompt: string, instruction?: string): { lead: string[]; items: PaperItem[] } {
  const lead: string[] = [];
  const items: PaperItem[] = [];
  const target = (instruction ?? "").trim().toLowerCase();

  for (const raw of prompt.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const m = NUMBERED.exec(line) ?? LETTERED.exec(line);
    if (m) {
      const body = m[2].trim();
      const ref = PARA_REF.exec(body);
      const withoutRef = ref ? body.replace(PARA_REF, "").trim() : body;
      const gap = GAP.test(withoutRef);
      items.push({
        label: "",
        text: gap ? withoutRef.replace(GAP, "").trim() : withoutRef,
        gap,
        ref: ref ? `(§${ref[1]})` : null,
        referent: false,
      });
      continue;
    }

    // The generator often repeats the instruction as the prompt's first line;
    // rendering both would duplicate the task stem on the paper.
    if (items.length === 0 && line.toLowerCase() === target && target !== "") continue;

    if (items.length > 0) {
      const last = items[items.length - 1];
      items[items.length - 1] = { ...last, text: `${last.text} ${line}`.trim() };
      continue;
    }
    lead.push(line);
  }

  return { lead, items: items.map((it, i) => ({ ...it, label: letterLabel(i) })) };
}

export function emphasisFrom(items: PaperItem[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const m = UNDERLINED.exec(item.text.trim());
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * One-based paragraph to cite for a referent. Prefers the first paragraph where
 * the word is not sentence-initial, so items do not all collapse to "(§1)".
 */
function chooseParagraph(passage: string, word: string): number {
  const needle = word.trim().toLowerCase();
  const paragraphs = passage.split(/\n{2,}/);
  let first = -1;

  paragraphs.forEach((paragraph, i) => {
    const tokens = paragraph.toLowerCase().split(/\s+/);
    const positions = tokens
      .map((t, ti) => ({ core: t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), ti }))
      .filter((t) => t.core === needle)
      .map((t) => t.ti);
    if (positions.length === 0) return;
    if (first === -1) first = i;
    if (positions.some((ti) => ti > 0)) {
      first = i;
    }
  });

  return first === -1 ? 1 : first + 1;
}
/** The quoted word a referent item targets, e.g. `"They" (underlined)`. */
export function referentTarget(item: PaperItem): string | null {
  const m = UNDERLINED.exec(item.text.trim());
  return m ? m[1] : null;
}

/**
 * Rewrites referent items in place: the target word is kept, and its paragraph
 * is resolved against the passage so the paper can print "They (§2): ...".
 * A target that is not a referent (a content word) is reported through the
 * returned `rejected` list so the caller can surface it.
 */
export function resolveReferents(tasks: PaperTask[], passage: string): { applied: string[]; rejected: string[] } {
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const task of tasks) {
    for (const item of task.items) {
      const target = referentTarget(item);
      if (target === null) continue;

      if (!isReferentWord(target) || paragraphIndexOf(passage, target) === null) {
        rejected.push(target);
        continue;
      }
      item.text = target;
      // Prefer a paragraph where the referent is not the opening word, so the
      // items spread across the text instead of all reading "(§1)".
      item.ref = `(§${chooseParagraph(passage, target)})`;
      item.referent = true;
      item.gap = true;
      applied.push(target);
    }
  }

  return { applied, rejected };
}

// "researcher - eating - intake" printed centred under the task stem.
const HYPHEN_LIST = /^[A-Za-z]+(?:\s*-\s*[A-Za-z]+){2,}$/;

function toPaperTask(task: ExportTask, number: number): PaperTask {
  const { lead, items } = parseTaskBody(task.prompt, task.instruction);
  return {
    number,
    instruction: task.instruction.trim(),
    lead,
    items,
    wordList: lead.find((l) => HYPHEN_LIST.test(l.trim())) ?? null,
    table: task.table && task.table.headers.length > 0 ? task.table : null,
  };
}

function toPaperTopic(topic: ExportTopic, index: number): PaperTopic {
  const words = ["One", "Two", "Three", "Four", "Five"];
  const notes = (topic.keywords ?? "")
    .split(/[,/;\n]+/)
    .map((k) => k.trim().replace(/^[-–•\s]+/, ""))
    .filter(Boolean);

  const lines: string[] = [];
  if (topic.situation) lines.push(topic.situation);
  if (topic.instruction) lines.push(topic.instruction);

  return {
    label: `Topic ${words[index] ?? index + 1}:`,
    lines,
    notes,
    noteHeading: notes.length > 0 ? "Make the best use of the following notes:" : null,
  };
}

export function buildPaper(doc: ExportDocument): Paper {
  // Underline targets are gathered in a first pass because the passage block is
  // emitted before the tasks that name the words it must underline.
  const paperTasks = doc.sections.map((s) => s.tasks.map((t, i) => toPaperTask(t, i + 1)));

  const passageText = doc.sections.find((s) => s.text?.body)?.text?.body ?? "";
  const { applied } = resolveReferents(paperTasks.flat(), passageText);
  const emphasis = applied;

  const blocks: PaperBlock[] = [
    { kind: "masthead", title: doc.title, subtitle: doc.subtitle, meta: doc.meta },
  ];

  doc.sections.forEach((section, si) => {
    const hasContent = !!section.text?.body || section.tasks.length > 0 || section.topics.length > 0;
    if (!hasContent && !(section.heading && section.marksLabel)) return;

    blocks.push({ kind: "sectionHead", heading: section.heading, marks: section.marksLabel });

    if (section.intro) blocks.push({ kind: "instruction", text: section.intro });

    if (section.text?.body) {
      blocks.push({
        kind: "passage",
        title: section.text.title ?? null,
        paragraphs: section.text.body
          .split(/\n{2,}/)
          .map((p) => p.replace(/\n/g, " ").trim())
          .filter(Boolean),
        emphasis,
      });
    }

    if (section.sourceNote) blocks.push({ kind: "sourceNote", text: section.sourceNote });

    paperTasks[si].forEach((task) => {
      // A referent task is fully expressed by its lettered "(§N)" items, so the
      // extra Word/Refers-to chart would only duplicate them.
      const isReferentTask = task.items.some((i) => i.referent);
      blocks.push({ kind: "task", task });
      if (task.wordList) blocks.push({ kind: "wordList", words: task.wordList.split(/\s*-\s*/) });
      if (task.table && !isReferentTask) blocks.push({ kind: "table", table: task.table });
    });

    section.topics.forEach((topic, i) => blocks.push({ kind: "topic", topic: toPaperTopic(topic, i) }));
  });

  blocks.push({ kind: "colophon", text: doc.generatedBy });
  return { blocks, structure: doc.structure, header: doc.header };
}