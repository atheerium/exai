// The run deadline: a full exam must fail fast and say WHY.
//
// Measured live 2026-10-13: one run reached 199s of chain-walking across
// blocked and overloaded models and produced nothing, because the exam is
// all-or-nothing. `runDeadlineMs` caps that. The check runs BEFORE dialling,
// which is the only placement that actually saves the time -- after dialling, the
// call has already been paid for.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runBudgetMs, buildContext, generateTextCandidates } from "./index";

let server: http.Server;
let port = 0;
/** How many requests actually reached the provider. */
let hits = 0;
/** How long the stub stalls before answering 500, so a deadline can expire. */
let stallMs = 0;

before(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    setTimeout(() => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "upstream exploded" } }));
    }, stallMs);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/**
 * Runs one generation against a two-entry chain, both served by the same stub
 * (so advancing is possible in principle) with the given budget.
 */
async function runWithBudget(runDeadlineMs?: number, stall = 0) {
  const saved = { ...process.env };
  hits = 0;
  stallMs = stall;
  process.env.AI_PROVIDER_CHAIN = "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_BASE_URL = `http://127.0.0.1:${port}/v1`;
  try {
    return await generateTextCandidates({
      ...buildContext({
        level: "secondary",
        grade: "3as",
        stream: "Lettres et Langues Étrangères",
        length: 150,
        unit: "u-ancient",
        topic: "Archaeology and heritage preservation",
        examId: "deadline-test",
        runDeadlineMs,
      }),
      runDeadlineMs,
    });
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

test("the budget defaults to 120s", () => {
  assert.equal(runBudgetMs(), 120_000);
});

test("AI_RUN_BUDGET_MS overrides it for a slower provider or a paid tier", () => {
  const saved = process.env.AI_RUN_BUDGET_MS;
  try {
    process.env.AI_RUN_BUDGET_MS = "600000";
    assert.equal(runBudgetMs(), 600_000);
  } finally {
    if (saved === undefined) delete process.env.AI_RUN_BUDGET_MS;
    else process.env.AI_RUN_BUDGET_MS = saved;
  }
});

test("a malformed or zero budget falls back rather than disabling the cap", () => {
  const saved = process.env.AI_RUN_BUDGET_MS;
  try {
    // `0` is the dangerous case: read literally it means "no limit", silently
    // restoring the hang the deadline exists to prevent.
    for (const raw of ["0", "-5", "not-a-number", ""]) {
      process.env.AI_RUN_BUDGET_MS = raw;
      assert.equal(runBudgetMs(), 120_000, `AI_RUN_BUDGET_MS=${JSON.stringify(raw)}`);
    }
  } finally {
    if (saved === undefined) delete process.env.AI_RUN_BUDGET_MS;
    else process.env.AI_RUN_BUDGET_MS = saved;
  }
});

test("an expired budget stops the run BEFORE the provider is called", async () => {
  await assert.rejects(
    () => runWithBudget(Date.now() - 1_000),
    (e: Error) => {
      assert.match(e.message, /time budget for this run is spent/i);
      // The stage matters: the exam is all-or-nothing, so a bare "timed out"
      // tells the teacher nothing about what was lost.
      assert.match(e.message, /the passage could not be started/i);
      return true;
    }
  );
  assert.equal(hits, 0, "no request may be dialled once the budget is gone");
});

test("the SECOND chain entry is never tried once the budget is spent", async () => {
  // The first entry stalls past a 1ms budget and fails; the second must not be
  // attempted, which is the whole point -- advancing on a throttle is what turned
  // a 6s failure into a 199s one.
  await assert.rejects(
    // Long enough that the first call definitely starts, short enough that the
    // 400ms stall outlives it. A 1ms deadline would expire before entry one.
    () => runWithBudget(Date.now() + 400, 900),
    (e: Error) => /time budget for this run is spent/i.test(e.message)
  );
  assert.equal(hits, 1, "only the first entry may be dialled");
});

test("no deadline means no cap: a throttled run still advances the chain", async () => {
  await assert.rejects(() => runWithBudget(undefined), /upstream exploded|500/);
  assert.equal(hits, 2, "per-section generation keeps the full fallback chain");
});