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
import { taskHasTable } from "./tables";

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
  /** Carried for the table allowlist; not rendered. */
  skill?: string | null;
  family?: string | null;
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

// Generated prompts arrive in four shapes, only ONE of which the old parser
// recognised (teacher report, 2026-10-12: "only question 1 has letters"):
//
//   1. "1. first\n2. second"  /  "A. first\nB. second"  -> items (already worked)
//   2. bare lines, one item each, NO prefix               -> was `lead`, so unlabelled
//   3. blank-line-separated blocks ("Word: x\nDerived form:") -> one item per block
//   4. a single key/value exercise ("Sentence A: ...\nSentence B: ...") -> ONE item
//
// The letters are ours to print (label is overwritten with letterLabel below),
// so whether the MODEL chose to prefix them must never decide whether an item
// gets a label. Shape 4 is the exception: a rewrite exercise is one question
// with two sentences, not three questions, and labelling its lines a) b) c)
// would print nonsense on the paper.
const NUMBERED = /^(\d+)[.)]\s+(.*)$/;
const LETTERED = /^([A-Za-z])[.)]\s+(.*)$/;
/**
 * A field label such as "Word:", "Derived form:", "Sentence A:" — pairs of these
 * form one exercise. The value may be EMPTY ("Derived form: " with the student
 * to fill it in), which is the normal shape for these tasks, so the value is not
 * required to be present.
 */
const FIELD_LABEL = /^[A-Z][A-Za-z ]{0,24}:(?:\s|$)/;
/** A markdown table separator row ("--- | ---"), which is scaffolding, not content. */
const TABLE_SEPARATOR = /^[\s|:-]+$/;
const GAP = /(?:→|:)?\s*\.{3,}\s*$/;
const UNDERLINED = /^"([^"]+)"\s*\(underlined\)$/;
// "(§2)" — the paragraph an item refers back to, printed inline on the paper.
const PARA_REF = /\s*\(§\s*(\d+)\s*\)/;

export function parseTaskBody(prompt: string, instruction?: string): { lead: string[]; items: PaperItem[] } {
  const lead: string[] = [];
  const items: PaperItem[] = [];
  const target = (instruction ?? "").trim().toLowerCase();

  const pushItem = (body: string) => {
    const ref = PARA_REF.exec(body);
    const withoutRef = ref ? body.replace(PARA_REF, "").trim() : body;
    const gap = GAP.test(withoutRef);
    items.push({
      label: "",
      text: gap ? withoutRef.replace(GAP, "").trim() : withoutRef,
      gap,
      ref: ref ? `(\u00a7${ref[1]})` : null,
      referent: false,
    });
  };

  // Shape 3 first: blank-line-separated blocks are unambiguously one item each.
  // The morphology and phonology tasks are generated in exactly this shape
  // ("Word: excavation\nDerived form: \n\nWord: collaborative\nDerived form:").
  //
  // Within a block, a PREFIXED line starts a new item and an unprefixed line
  // continues the current one -- otherwise "Word: x" and "Derived form:" would
  // become two separate questions. Always split on newlines: guarding that with
  // a "does it start with a number" test silently merges a multi-line block into
  // one item, because NUMBERED has no `m` flag and cannot match past a newline.
  const blocks = prompt
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  if (blocks.length > 1) {
    for (const block of blocks) {
      // The first line of each block always starts a new item, even when the
      // previous block already produced one -- otherwise "Word: collaborative"
      // is appended to the previous question instead of opening its own.
      let atBlockStart = true;
      for (const raw of block.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        // "--- | ---" separates a markdown header from its data. Printing it
        // would put a row of dashes on the paper.
        if (TABLE_SEPARATOR.test(line) && /[|\-]/.test(line)) continue;
        const m = NUMBERED.exec(line) ?? LETTERED.exec(line);
        if (m) {
          pushItem(m[2].trim());
        } else if (items.length > 0 && !atBlockStart) {
          const last = items[items.length - 1];
          items[items.length - 1] = { ...last, text: `${last.text} ${line}`.trim() };
        } else {
          pushItem(line);
        }
        atBlockStart = false;
      }
    }
    return { lead, items: items.map((it, i) => ({ ...it, label: letterLabel(i) })) };
  }

  const onlyLines = prompt.split("\n").map((l) => l.trim()).filter(Boolean);

  // A bare line is a LEAD-IN only when prefixed items actually follow it. If the
  // whole prompt is bare lines, they are the items — that is shape 2, and the
  // lead-in case would otherwise swallow them.
  const hasPrefixedItems = onlyLines.some((l) => NUMBERED.test(l) || LETTERED.test(l));
  // Shape 4: a lone block of DISTINCT field labels is one exercise (a grammar
  // rewrite: "Sentence A:", "Sentence B:"). A REPEATED pair of labels
  // ("Word:", "Derived form:", "Word:", "Derived form:", ...) is a list of
  // separate questions that merely arrived without blank lines between them, so
  // it must not be mistaken for one exercise. Distinct labels are the tell:
  // 2 distinct across 4 lines is a list, 2 distinct across 2 lines is an
  // exercise.
  const fieldLines = onlyLines.filter((l) => FIELD_LABEL.test(l));
  const distinctFields = new Set(fieldLines.map((l) => l.split(":")[0].trim().toLowerCase()));
  const isFieldExercise =
    onlyLines.length > 1 &&
    fieldLines.length >= onlyLines.length - 1 &&
    fieldLines.length === distinctFields.size;

  // Labels seen in the item currently being built, for the repeated-pair case.
  let currentFieldLabels = new Set<string>();

  for (const raw of prompt.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // "--- | ---" separates a markdown header from its data. Printing it would
    // put a row of dashes on the paper.
    if (TABLE_SEPARATOR.test(line) && /[|\-]/.test(line)) continue;

    const m = NUMBERED.exec(line) ?? LETTERED.exec(line);
    if (m) {
      pushItem(m[2].trim());
      continue;
    }

    // The generator often repeats the instruction as the prompt's first line;
    // rendering both would duplicate the task stem on the paper.
    if (items.length === 0 && lead.length === 0 && line.toLowerCase() === target && target !== "") continue;

    // A repeated field-label list without blank lines ("Word: x / Derived
    // form:" x3): a label that is NEW to the current item continues it, and a
    // label that REPEATS opens the next question. Distinct labels are handled
    // above as a single exercise, so this branch only sees repeated pairs.
    if (!hasPrefixedItems && !isFieldExercise && FIELD_LABEL.test(line)) {
      const label = line.split(":")[0].trim().toLowerCase();
      if (items.length === 0 || currentFieldLabels.has(label)) {
        pushItem(line);
        currentFieldLabels = new Set([label]);
      } else {
        const last = items[items.length - 1];
        items[items.length - 1] = { ...last, text: `${last.text} ${line}`.trim() };
        currentFieldLabels.add(label);
      }
      continue;
    }

    // Shape 2: the whole prompt is bare lines, so every line is its own item.
    // This is the fix for the teacher report -- Part One QUESTIONS,
    // PARAGRAPH_ID and COHESIVE_MARKERS are generated as bare questions, one per
    // line, and were rendered with no letters because nothing recognised them as
    // items. Checked BEFORE the continuation rule, or line 2 would be appended
    // to item 1 instead of starting its own.
    if (!hasPrefixedItems && !isFieldExercise) {
      pushItem(line);
      continue;
    }

    if (items.length === 0) {
      // Prefixed items follow, so this bare line is the lead-in.
      lead.push(line);
      continue;
    }

    // Continuation of the item above: a wrapped sentence, or the rest of a
    // field/value exercise.
    const last = items[items.length - 1];
    items[items.length - 1] = { ...last, text: `${last.text} ${line}`.trim() };
  }

  // Shape 4 kept as lead-in text under the instruction: it is one exercise
  // whose sentences belong together.
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
    skill: task.skill ?? null,
    family: task.family ?? null,
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
      // Tables are allowlisted by section and skill (user instruction,
      // 2026-10-11): Part A never carries one, and Part B only for the tabular
      // skills. Stripping here rather than migrating means exams saved before
      // the rule print correctly too, with no data migration.
      const allowed = taskHasTable(section.sectionType, task);
      if (task.table && !isReferentTask && allowed) {
        blocks.push({ kind: "table", table: task.table });
      }
    });

    section.topics.forEach((topic, i) => blocks.push({ kind: "topic", topic: toPaperTopic(topic, i) }));
  });

  blocks.push({ kind: "colophon", text: doc.generatedBy });
  return { blocks, structure: doc.structure, header: doc.header };
}