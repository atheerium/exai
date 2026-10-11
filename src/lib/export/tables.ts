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