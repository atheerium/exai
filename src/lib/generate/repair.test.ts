// Content repair: one corrective call per section, bounded, honest on failure.
//
// Teacher report (2026-10-13): a full exam died on
//   'text exploration: Task 1 targets "urge", which does not occur in the passage'
// and nothing was written. Task sections had transport retry only, so a model
// that answered *wrongly* was never told what was wrong.

import { test } from "node:test";
import assert from "node:assert/strict";
import { repairGeneration } from "./full-exam";

const ok = { ok: true, issues: [] as string[] };
const bad = (issue: string) => ({ ok: false, issues: [issue] });

test("repair returns the replacement when the correction succeeds", async () => {
  // Mirrors the orchestration: the first reply is the failed generation the
  // caller already holds (validated directly, not via repairGeneration), and the
  // second is the one corrective call. Two generations in total, never more.
  let calls = 0;
  const generate = async () => {
    calls += 1;
    return calls === 1 ? ["broken"] : ["fixed"];
  };
  const validate = (c: string) => (c === "fixed" ? ok : bad("Task 1 is wrong."));

  const first = await generate();
  assert.equal(validate(first[0]).ok, false, "the opening reply is the failure being repaired");

  const repaired = await repairGeneration(generate, validate, ["Task 1 is wrong."], {
    emptyIssue: "no tasks returned",
    noun: "TEXT_EXPLORATION",
  });
  assert.deepEqual(repaired.candidates, ["fixed"]);
  assert.deepEqual(repaired.issues, []);
  assert.equal(calls, 2, "exactly one repair attempt, never a loop");
});

test("repair returns the ORIGINAL issues, not the repair's, when it fails", async () => {
  const original = ['Task 1 targets "urge", which does not occur in the passage.'];
  const repaired = await repairGeneration(
    async () => ["still-broken"],
    () => bad("Something else went wrong."),
    original,
    { emptyIssue: "no tasks returned", noun: "TEXT_EXPLORATION" }
  );
  assert.equal(repaired.candidates, null);
  // The teacher must see the real reason, not a downstream symptom of the retry.
  assert.deepEqual(repaired.issues, original);
});

test("a transport error during repair surfaces the original issues, not the error", async () => {
  const original = ["Task 1 has no content (empty prompt) and cannot be printed."];
  const repaired = await repairGeneration<string>(
    async () => {
      throw new Error("AI provider error 429: rate limit");
    },
    () => bad("unused"),
    original,
    { emptyIssue: "no tasks returned", noun: "PART_ONE" }
  );
  assert.equal(repaired.candidates, null);
  assert.deepEqual(repaired.issues, original);
});

test("an empty repair reply is treated as a failure, not as success", async () => {
  const original = ["Task 2 marks total 5 instead of the required 7."];
  const repaired = await repairGeneration<string>(
    async () => [],
    () => ok,
    original,
    { emptyIssue: "no tasks returned", noun: "PART_ONE" }
  );
  assert.equal(repaired.candidates, null);
  assert.deepEqual(repaired.issues, original);
});

test("the validator sees the validator's own strings, so feedback can be specific", async () => {
  // The reason repair works at all is that the exact issue text reaches the
  // model. Asserting the argument reaches `generate` closes that loop.
  const issue = 'Task 1 targets "urge", which does not occur in the passage.';
  let seen: string[] | null = null;
  await repairGeneration<string>(
    async (issues) => {
      seen = issues;
      return ["fixed"];
    },
    () => ok,
    [issue],
    { emptyIssue: "no tasks returned", noun: "TEXT_EXPLORATION" }
  );
  assert.deepEqual(seen, [issue]);
});