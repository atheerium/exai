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
import { taskHasTable, tabularTaskPrintsItems, tableKindFromHeaders, type TableKind } from "./tables";

export interface PaperTable {
  headers: string[];
  rows: string[][];
  /**
   * Which of the three official B structures this is (`export/tables.ts`). Null
   * when the table matches none of them, which keeps the generic rendering rather
   * than guessing.
   */
  kind: TableKind | null;
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
  /**
   * The candidate words a GAP_FILL (or word-bank) task draws from, or null.
   *
   * A list, not a string: it is printed as a centred `a - b - c` line, so it must
   * never carry its own separator. Extracted from the prompt by
   * `extractWordBank`.
   *
   * Renderers draw it INSIDE the task block — after the instruction, before the
   * first item — because that is where the official paper puts it and where a
   * student needs it: the words must be readable before the sentences that use
   * them. It was previously a separate top-level block, which could only ever
   * print after every item (useless) or require the task block to be split.
   */
  wordList: string[] | null;
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

// ---- Word banks ------------------------------------------------------------
//
// GAP_FILL ("Fill in the gaps with words from the list given") needs a bank of
// candidate words printed above the sentences, centred and hyphen-separated.
//
// Teacher report 2026-10-13: the bank arrived as
//
//   List: ["brain's", "scarcity", "ethical", "researchers", "manipulation"]
//
// and every shape in `parseTaskBody` read that line as an ordinary item, so it
// printed as `a) List: ["brain's", ...]` in raw JSON and pushed the real
// sentences to b) c) d).
//
// The prompt cannot be the guarantee: nothing in `provider.ts` ever specifies a
// bank shape, so the model improvises one per run -- hyphen-separated yesterday,
// JSON today, a bulleted list tomorrow. So the PARSER accepts all of them and
// strips the line before any shape logic runs. The prompt may still *request*
// one shape; it just no longer decides.
const BANK_PREFIX = /^(?:list|words?|word bank|lexis)\s*:\s*(.+)$/i;
/**
 * "researcher - eating - intake", apostrophes allowed so "brain's" matches.
 *
 * Whitespace AROUND each hyphen is mandatory, which is what makes the shape
 * unambiguous. Without it `well-being - open-minded - far-reaching` also matches
 * — the separator and the intra-word hyphen are indistinguishable — and the
 * bank then comes out as `well - being - open - minded - far - reaching`. A
 * bank containing an intra-word hyphen is therefore left alone rather than
 * guessed at; the `List:` prefix remains available for it.
 */
const HYPHEN_LIST = /^[A-Za-z']+(?:\s+[-–]\s+[A-Za-z']+){2,}$/;
/**
 * How many leading non-empty lines may be scanned for a bank.
 *
 * A bank belongs directly under the instruction, but the window is three lines
 * rather than one: the model also puts the bank after the sentences sometimes,
 * and extracting it there still beats printing `a) List: ["brain's", ...]`. Past
 * the window the line belongs to whatever item it sits in and is left alone.
 */
const MAX_BANK_SCAN_LINES = 3;

function cleanBankWord(raw: string): string {
  return raw
    .trim()
    .replace(/^[-–•*\s]+/, "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .trim();
}

/**
 * The words in one candidate line, or null when the line is not a bank.
 *
 * Three accepted shapes, all requiring a separator so a normal sentence is never
 * swallowed: a bare hyphen list, a prefixed bracketed array, or a prefixed
 * comma/semicolon list. Fewer than two words is rejected -- a one-word "bank"
 * is a sentence fragment ("Word: excavation" in a morphology task), and
 * misreading it would delete a real line from the paper.
 */
function wordBankFromLine(line: string): string[] | null {
  // Split on the SAME separator the matcher accepts. Matching `–` while
  // splitting on `-` looks correct and silently returns one "word" that is the
  // whole line.
  if (HYPHEN_LIST.test(line)) return splitBankWords(line.split(/\s+[-–]\s+/));

  const prefixed = BANK_PREFIX.exec(line);
  if (!prefixed) return null;
  let body = prefixed[1].trim();
  const bracketed = /^\[([\s\S]*)\]$/.exec(body);
  if (bracketed) body = bracketed[1];
  return splitBankWords(body.split(/[,;]/));
}

function splitBankWords(parts: string[]): string[] | null {
  const words = parts.map(cleanBankWord).filter(Boolean);
  if (words.length < 2) return null;
  // Each entry must be a word or a short phrase, never a clause. Without this a
  // prefixed line carrying a full sentence would be deleted from the paper.
  if (words.some((w) => w.length > 40 || w.trim().split(/\s+/).length > 3)) return null;
  return words;
}

/**
 * Pull the word bank out of a task prompt and hand back the rest.
 *
 * Runs BEFORE `parseTaskBody` rather than after, because once the line is an
 * item its letter is already assigned -- and a bank is not a question, so it
 * must never be lettered in the first place.
 *
 * Only the FIRST bank is taken: one task has one bank, and a later `List:` line
 * belongs to whatever item it sits in.
 */
export function extractWordBank(prompt: string): { words: string[]; rest: string } {
  const lines = prompt.split("\n");
  let scanned = 0;
  for (let i = 0; i < lines.length && scanned < MAX_BANK_SCAN_LINES; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    scanned += 1;
    const words = wordBankFromLine(line);
    if (!words) continue;
    lines.splice(i, 1);
    return { words, rest: lines.join("\n") };
  }
  return { words: [], rest: prompt };
}
/**
 * What separates the words of a printed bank: a spaced EN DASH (U+2013).
 *
 * ONEC typography (user instruction, 2026-10-13). Parsing accepts both the
 * en dash and the plain hyphen, because the separator arrives from a model; the
 * printed form does not vary, or the three surfaces would each pick their own.
 */
export const WORD_BANK_SEPARATOR = " – ";

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

function toPaperTask(task: ExportTask, number: number): PaperTask {
  // The bank is removed from the prompt before parsing, so it is absent from
  // BOTH `items` (it is not a question) and `lead` (which `drawTask` prints
  // line by line). Previously `wordList` was derived with `lead.find(...)` but
  // the line stayed in `lead`, so the PDF printed a recognised bank twice: once
  // indented under the stem and once centred.
  const bank = extractWordBank(task.prompt);
  const { lead, items } = parseTaskBody(bank.rest, task.instruction);
  const table =
    task.table && task.table.headers.length > 0
      ? { headers: task.table.headers, rows: task.table.rows, kind: tableKindFromHeaders(task.table.headers) }
      : null;
  return {
    number,
    instruction: task.instruction.trim(),
    lead,
    // A tabular task's words live in its table cells or its word bank, so the
    // lettered items are not printed: `a) "fraudulent" ..........` above a chart
    // that already prints `fraudulent` in the Adjective cell duplicates the row
    // and turns a chart task back into a list (user instruction, 2026-10-13).
    items: tabularTaskPrintsItems({ skill: task.skill, instruction: task.instruction, table: task.table })
      ? items
      : [],
    wordList: bank.words.length > 0 ? bank.words : null,
    table,
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