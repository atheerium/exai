/**
 * Merge two autosave patches for one exam without losing either.
 *
 * Merge-by-id is lossless because `PATCH /api/exams/[id]` matches `sections`,
 * `tasks`, and `topics` entries by id — so one patch may carry many edits.
 */

type AnyRecord = Record<string, any>;

const ITEM_KEYS = ["tasks", "topics"] as const;

function mergeById(
  base: AnyRecord[],
  next: AnyRecord[]
): AnyRecord[] {
  const items = new Map<string, AnyRecord>();
  for (const item of base) items.set(String(item.id), { ...item });
  for (const item of next) {
    const id = String(item.id);
    items.set(id, { ...(items.get(id) ?? {}), ...item });
  }
  return [...items.values()];
}

export function mergePatch(
  base: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>
): Record<string, unknown> {
  if (!base) return next;

  const baseSecs = (Array.isArray(base.sections) ? base.sections : []) as AnyRecord[];
  const nextSecs = (Array.isArray(next.sections) ? next.sections : []) as AnyRecord[];

  const merged: Record<string, unknown> = { ...base, ...next };
  if (baseSecs.length === 0 && nextSecs.length === 0) return merged;

  const sections = new Map<string, AnyRecord>();
  for (const sec of baseSecs) sections.set(String(sec.id), { ...sec });

  for (const sec of nextSecs) {
    const id = String(sec.id);
    const prev = sections.get(id);
    if (!prev) {
      sections.set(id, { ...sec });
      continue;
    }
    const section: AnyRecord = { ...prev, ...sec };
    for (const key of ITEM_KEYS) {
      const a = (Array.isArray(prev[key]) ? prev[key] : []) as AnyRecord[];
      const b = (Array.isArray(sec[key]) ? sec[key] : []) as AnyRecord[];
      if (a.length === 0 && b.length === 0) continue;
      section[key] = mergeById(a, b);
    }
    sections.set(id, section);
  }

  merged.sections = [...sections.values()];
  return merged;
}