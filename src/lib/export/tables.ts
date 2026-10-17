// Which tasks carry a table on the official paper.
//
// Why this is a single module
// --------------------------
// Tables used to be driven by a `tableRequired` flag on the guide rule, which
// put the decision in the data and let generation, validation and rendering each
// read it independently. That is how Part A ended up with True/False and
// paragraph-matching charts the official paper never has (user instruction,
// 2026-10-11).
//
// The rule is now stated once, here, and consumed by every layer:
//
//   Part A  — never a table, whatever the guide flag says.
//   Part B  — a table only for the tasks that are inherently tabular:
//             morphology (root / prefix / suffix) and phonology classification.
//
// Because the allowlist is positive, adding a new `table:` construction anywhere
// else fails validation by design. That is intentional: the recurring bug was a
// generator "helpfully" adding tables, so the default has to be no.

import type { SkillRule } from "@/data/guides";

/** Section types as stored on ExamSection. */
export type PaperSectionType = "TEXT" | "PART_ONE" | "TEXT_EXPLORATION" | "WRITING";

/**
 * Part Two skills whose tasks are tabular by nature.
 *
 * Deliberately short (user decision, 2026-10-11: "for now just those"). Adding
 * a skill here is a spec change: update EXAM.md section 10 in the same change.
 */
const TABULAR_SKILLS: ReadonlySet<string> = new Set(["MORPHOLOGY", "PHONOLOGY"]);

/**
 * True when this task's paper surface includes a table.
 *
 * `skill` is authoritative for Part Two; `family` is only consulted for Part One,
 * where the answer is always false.
 */
export function taskHasTable(
  sectionType: PaperSectionType | string,
  task: { skill?: string | null; family?: string | null }
): boolean {
  if (sectionType === "PART_ONE" || sectionType === "TEXT") return false;
  if (sectionType === "WRITING") return false;
  const skill = (task.skill ?? "").toUpperCase();
  return TABULAR_SKILLS.has(skill);
}

/**
 * Guide-level view: does this skill rule prescribe a table?
 *
 * Separate from `taskHasTable` on purpose — the guide also feeds the model, and
 * a guide that claims `tableRequired: true` for a non-tabular skill invites the
 * provider to emit a table we then have to strip. Keeping the guide in step with
 * the allowlist means the two agree instead of fighting.
 */
export function rulePrescribesTable(rule: Pick<SkillRule, "skill">): boolean {
  return TABULAR_SKILLS.has(rule.skill.toUpperCase());
}

// ---------------------------------------------------------------------------
// The three official B structures (user instruction, 2026-10-13)
// ---------------------------------------------------------------------------
//
// The allowlist above says WHETHER a task carries a table. This half says what
// that table looks like, and it lives here for the same reason `TABULAR_SKILLS`
// does: three surfaces (PDF, DOCX, preview), two producers (the live providers
// and the mock) and two validators read the shape, and letting each of them
// decide is how the three surfaces drift.
//
//   1. MORPHOLOGY, roots and affixes   prefix | root | suffix   + 1 empty row
//   2. MORPHOLOGY, word derivation     Verb | Noun | Adjective
//                                      + a solved example row, then one target
//                                        word per row with dotted cells beside it
//   3. PHONOLOGY, final /ed/ and /s/   /t/ | /d/ | /ɪd/  (or /s/ | /z/ | /ɪz/)
//                                      + 1 empty row
//
// A SINGLE empty row is deliberate (user instruction, 2026-10-13): students do
// not write into a multi-row grid on these papers, they sort the whole word list
// into one box under each column header. The previous phonology table shipped two
// empty rows, which reads as a table the official paper never has.

/**
 * The handwriting line printed in a derivation cell the student must fill.
 *
 * A literal constant rather than a computed leader because the DOCX and preview
 * surfaces cannot measure text: 19 dots fit a third of the text block at body
 * size, so it is emitted verbatim on all three surfaces. `fitDots` in `pdf.ts`
 * is the only thing allowed to shorten it, and only when the measured column
 * would actually wrap.
 */
export const DOTTED = "...................";

/** Height of a table row the student writes in, in points. */
export const BLANK_ROW_HEIGHT = 32;

/** Cell content that is blank for validation purposes: empty, or the dotted line. */
export function isBlankCell(cell: string | null | undefined): boolean {
  const trimmed = (cell ?? "").trim();
  return trimmed === "" || /^\.+$/.test(trimmed);
}

export const AFFIX_HEADERS = ["prefix", "root", "suffix"] as const;
export const DERIVATION_HEADERS = ["Verb", "Noun", "Adjective"] as const;
export const PHONOLOGY_GROUPS = {
  ed: ["/t/", "/d/", "/ɪd/"],
  s: ["/s/", "/z/", "/ɪz/"],
} as const;

/**
 * The solved example the derivation chart shows above the test rows.
 *
 * Printed on the paper by design (user instruction, 2026-10-13): the official
 * wording is "Complete the chart as shown in the example", so the example IS the
 * instruction. It uses a different word family from every test row, so it cannot
 * answer any of them — which is why it is the one row the answer-cell rule
 * exempts (see `checkTaskLinkage`).
 */
export const DERIVATION_EXAMPLE: readonly string[] = ["to corrupt", "corruption", "corrupt"];

export type TableKind = "affix" | "derivation" | "phonology";

export interface RawTable {
  headers: string[];
  rows: string[][];
}

const norm = (value: unknown): string => String(value ?? "").trim().toLowerCase();

/** Which of the three structures a set of headers is, or null when it is none. */
export function tableKindFromHeaders(headers: readonly unknown[] | null | undefined): TableKind | null {
  const h = (headers ?? []).map(norm);
  if (AFFIX_HEADERS.every((x) => h.includes(x))) return "affix";
  if (DERIVATION_HEADERS.every((x) => h.includes(x.toLowerCase()))) return "derivation";
  const groups: readonly string[] = [...PHONOLOGY_GROUPS.ed, ...PHONOLOGY_GROUPS.s];
  if (h.some((x) => groups.includes(x))) return "phonology";
  return null;
}

/**
 * Which phonology structure this is.
 *
 * The headers win whenever they carry a recognisable sound group, because the
 * guide instruction names BOTH ("final '-s' (or final '-ed')") and cannot
 * disambiguate. Text is only the fallback, and it defaults to /s/ — the first of
 * the two the guide lists — so an unrecognisable table still renders a legal one.
 */
export function phonologyGroup(
  headers: readonly unknown[] | null | undefined,
  text = ""
): keyof typeof PHONOLOGY_GROUPS {
  const h = (headers ?? []).map(norm);
  const has = (...groups: string[]) => h.some((cell) => groups.some((g) => cell.includes(g)));
  if (has("/ɪd/", "/t/", "/d/")) return "ed";
  if (has("/ɪz/", "/s/", "/z/")) return "s";
  const lowered = text.toLowerCase();
  if (/-ed\b|\/ed\//.test(lowered)) return "ed";
  return "s";
}

/** Which structure a tabular task's table is, from its skill and wording. */
export function tableKindFor(
  skill: string | null | undefined,
  headers: readonly unknown[] | null | undefined,
  text = ""
): TableKind | null {
  const s = (skill ?? "").toUpperCase();
  if (s === "PHONOLOGY") return "phonology";
  if (s !== "MORPHOLOGY") return null;
  const fromHeaders = tableKindFromHeaders(headers);
  if (fromHeaders === "affix") return "affix";
  // The guide's morphology instruction is the derivation wording ("Give the noun
  // (or verb / adjective / adverb) derived from..."), so an affix task is only
  // recognised when the wording names roots or affixes AND does not also ask for
  // derived forms — the two appear together in the "or opposites keeping the
  // same root" variant.
  if (/root|affix|prefix|suffix/.test(text) && !/derived|chart/.test(text)) return "affix";
  return "derivation";
}

/**
 * Canonical column index for each derivation header in a raw table.
 *
 * A live model was asked for `Verb | Noun | Adjective` and has been seen to
 * answer `Noun | Verb | Adjective`, or the older `Word | Noun | Verb |
 * Adjective`, where the given word has no column of its own. Mapping by name
 * rather than by position is what lets those replies still print in the
 * official column order.
 */
function derivationColumns(rawHeaders: readonly unknown[]): number[] {
  const h = rawHeaders.map(norm);
  return DERIVATION_HEADERS.map((header) => {
    const stem = header.toLowerCase().slice(0, 4);
    return h.findIndex((cell) => cell.startsWith(stem));
  });
}

/**
 * Build the official table for a tabular task, in code.
 *
 * The model's reply is treated as CONTENT (which words, which sound groups) and
 * never as layout: headers, row count, the example row and the dotted cells are
 * all computed here. That follows the rule the rest of the pipeline already
 * uses — computed, not generated — because a table shape asked for in prose is a
 * shape that comes back wrong, and a prefilled cell is an answer key printed on
 * the paper.
 */
export function officialTable(opts: {
  skill?: string | null;
  instruction?: string | null;
  prompt?: string | null;
  table?: RawTable | null;
}): RawTable | null {
  const skill = (opts.skill ?? "").toUpperCase();
  if (!TABULAR_SKILLS.has(skill)) return null;

  const text = `${opts.instruction ?? ""} ${opts.prompt ?? ""}`;
  const raw = opts.table ?? { headers: [], rows: [] };
  const kind = tableKindFor(skill, raw.headers, text);

  if (kind === "affix") return { headers: [...AFFIX_HEADERS], rows: [["", "", ""]] };

  if (kind === "phonology") {
    return {
      headers: [...PHONOLOGY_GROUPS[phonologyGroup(raw.headers, text)]],
      rows: [["", "", ""]],
    };
  }

  // Derivation: a solved example, then one target word per remaining row, with
  // the two columns the student must derive printed as handwriting lines.
  const columns = derivationColumns(raw.headers);
  // A table whose headers map to none of the three is not a derivation chart at
  // all, and rebuilding it as one would silently DELETE its content. Left for
  // the caller to blank instead.
  if (columns.every((c) => c < 0)) return null;

  /**
   * A column the model named for the base word rather than for a part of speech
   * (`Word`, `Base`, …) — the older `Word | Noun | Verb | Adjective` shape. A row
   * with nothing in the three canonical columns falls back to it, so a saved exam
   * from before this rule still prints its words instead of an empty chart.
   */
  const stemColumn = raw.headers.findIndex((h) => /^(word|words|base|stem|root|given)\b/i.test(String(h)));

  const read = (row: readonly unknown[]): string[] => {
    const cells = DERIVATION_HEADERS.map((_, i) => {
      const at = columns[i];
      const value = at >= 0 ? String(row[at] ?? "").trim() : "";
      return isBlankCell(value) ? "" : value;
    });
    if (cells.some(Boolean) || stemColumn < 0) return cells;
    const stem = String(row[stemColumn] ?? "").trim();
    if (isBlankCell(stem)) return cells;
    // A bare base word has no part of speech, so it is printed under Noun: that is
    // what a word-family chart is most often keyed on.
    return DERIVATION_HEADERS.map((_, i) => (i === 1 ? stem : ""));
  };

  const example = (() => {
    const first = raw.rows[0] ? read(raw.rows[0]) : [];
    return first.filter(Boolean).length === DERIVATION_HEADERS.length ? first : [...DERIVATION_EXAMPLE];
  })();

  const dataRows = raw.rows
    // Row 0 is always the example. A reply that put a test row there loses it,
    // which is the cheaper failure: the prompt states the order literally, and a
    // chart with one fewer row is still answerable.
    .slice(1)
    .map(read)
    .map((given) => {
      // Exactly one cell per row is the given word; the column is the model's
      // choice and is expected to vary between rows so the student is tested on
      // all three parts of speech.
      const at = given.findIndex((cell) => cell !== "");
      return DERIVATION_HEADERS.map((_, i) => (i === at ? given[at] : DOTTED));
    })
    .filter((row) => row.some((cell) => cell !== DOTTED));

  return { headers: [...DERIVATION_HEADERS], rows: [example, ...dataRows] };
}

/**
 * Whether a task's lettered items are printed on the paper.
 *
 * False for the three tabular structures: their words live in the table cells or
 * in the centred word bank, so printing `a) "fraudulent" ..........` above the
 * chart would duplicate the row and turn a chart task back into a list.
 */
export function tabularTaskPrintsItems(opts: {
  skill?: string | null;
  instruction?: string | null;
  table?: RawTable | null;
}): boolean {
  const skill = (opts.skill ?? "").toUpperCase();
  if (!TABULAR_SKILLS.has(skill)) return true;
  if (!opts.table || opts.table.headers.length === 0) return true;
  return tableKindFor(skill, opts.table.headers, opts.instruction ?? "") === null;
}