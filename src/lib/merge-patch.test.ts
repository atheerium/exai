import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePatch } from "./merge-patch";

test("mergePatch returns the first patch untouched when nothing is pending", () => {
  const patch = { sections: [{ id: "s1", text: "hello" }] };
  assert.deepEqual(mergePatch(null, patch), patch);
});

test("mergePatch keeps edits from both patches in different sections", () => {
  const base = { sections: [{ id: "s1", text: "text edit" }] };
  const next = { sections: [{ id: "s2", text: "second section" }] };
  const merged = mergePatch(base, next) as { sections: Array<Record<string, unknown>> };
  assert.equal(merged.sections.length, 2);
  const byId = Object.fromEntries(merged.sections.map((s) => [s.id, s.text]));
  assert.deepEqual(byId, { s1: "text edit", s2: "second section" });
});

test("mergePatch keeps distinct tasks edited inside one debounce window", () => {
  const base = { sections: [{ id: "s1", tasks: [{ id: "t1", prompt: "first" }] }] };
  const next = { sections: [{ id: "s1", tasks: [{ id: "t2", prompt: "second" }] }] };
  const merged = mergePatch(base, next) as { sections: Array<{ tasks: Array<{ id: string; prompt: string }> }> };
  assert.deepEqual(merged.sections[0].tasks, [
    { id: "t1", prompt: "first" },
    { id: "t2", prompt: "second" },
  ]);
});

test("mergePatch applies the newer value when the same task is edited twice", () => {
  const base = { sections: [{ id: "s1", tasks: [{ id: "t1", prompt: "old", marks: 2 }] }] };
  const next = { sections: [{ id: "s1", tasks: [{ id: "t1", prompt: "new" }] }] };
  const merged = mergePatch(base, next) as { sections: Array<{ tasks: Array<Record<string, unknown>> }> };
  assert.deepEqual(merged.sections[0].tasks, [{ id: "t1", prompt: "new", marks: 2 }]);
});

test("mergePatch merges topics alongside tasks in the same section", () => {
  const base = { sections: [{ id: "s1", topics: [{ id: "p1", title: "Topic one" }] }] };
  const next = { sections: [{ id: "s1", topics: [{ id: "p2", title: "Topic two" }] }] };
  const merged = mergePatch(base, next) as { sections: Array<{ topics: Array<{ id: string }> }> };
  assert.deepEqual(merged.sections[0].topics.map((tp) => tp.id), ["p1", "p2"]);
});

test("mergePatch is lossless across a chain of three edits", () => {
  let pending: Record<string, unknown> | null = null;
  pending = mergePatch(pending, { sections: [{ id: "s1", text: "one" }] });
  pending = mergePatch(pending, { sections: [{ id: "s2", text: "two" }] });
  pending = mergePatch(pending, { sections: [{ id: "s1", text: "three" }] });
  const merged = pending as { sections: Array<{ id: string; text: string }> };
  const byId = Object.fromEntries(merged.sections.map((s) => [s.id, s.text]));
  assert.deepEqual(byId, { s1: "three", s2: "two" });
});

test("mergePatch carries non-section top-level fields through", () => {
  const base = { title: "Draft" };
  const next = { sections: [{ id: "s1", text: "x" }] };
  const merged = mergePatch(base, next) as Record<string, unknown>;
  assert.equal(merged.title, "Draft");
  assert.ok(Array.isArray(merged.sections));
});

test("mergePatch does not mutate the patches it is given", () => {
  const base = { sections: [{ id: "s1", tasks: [{ id: "t1", prompt: "a" }] }] };
  const next = { sections: [{ id: "s1", tasks: [{ id: "t1", prompt: "b" }] }] };
  mergePatch(base, next);
  assert.deepEqual(base.sections[0].tasks, [{ id: "t1", prompt: "a" }]);
  assert.deepEqual(next.sections[0].tasks, [{ id: "t1", prompt: "b" }]);
});

test("mergePatch tolerates a patch with no sections key", () => {
  const merged = mergePatch({ config: { grade: "1as" } }, { title: "Renamed" }) as Record<string, unknown>;
  assert.equal(merged.title, "Renamed");
  assert.deepEqual(merged.config, { grade: "1as" });
});