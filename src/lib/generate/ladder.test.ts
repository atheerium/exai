// The chain ladder: validation lives INSIDE the chain.
//
// Why this file exists
// --------------------
// Production returned 422 on every full exam (reported 2026-10-26):
//
//   Generated text word count 71 is outside the expected range (120-180 ...).
//   Generated text has 1 paragraph(s) instead of 3.
//
// The chain was NVIDIA-first and validation ran AFTER the chain walk, so the
// first model to answer won even when its answer was wrong. Groq — which
// produces valid passages — was never dialled. `runChainLadder` fixes the order:
// attempt, validate, one corrective call on the SAME entry, then advance.
//
// Two levels are tested here, deliberately:
//   - the walk itself, against fake entries and fake attempts (no network);
//   - the real path, `generateValidated` + the real Groq transport against a
//     local HTTP stub that answers like a bad model and then a good one.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  runChainLadder,
  generateValidated,
  buildContext,
  validateCandidate,
  type LadderStage,
} from "./index";
import type { ResolvedChainEntry } from "./chain";
import type { GeneratedTextCandidate } from "@/types";

/** A resolved entry, shaped the way `resolveChain` builds one. */
function cfg(model: string, providerLabel = "groq"): ResolvedChainEntry {
  return {
    entry: { provider: "groq", model },
    apiKey: "test-key",
    baseUrl: "http://127.0.0.1:1/v1",
    model,
    providerLabel,
    maxTokens: 4000,
  };
}

const TWO = [cfg("model-a"), cfg("model-b")];
/** The retry delay is a production nicety; the suite must not pay it. */
const noSleep = async () => {};

/**
 * Runs a two-entry walk, recording which entry was dialled and whether the call
 * was the corrective one.
 */
async function walk(script: (call: string, repairOf: string | undefined) => string) {
  const calls: string[] = [];
  const result = await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: async (entry, stage) => {
      const label = `${entry.model}${stage.repairOf ? " (repair)" : ""}`;
      calls.push(label);
      return script(entry.model, stage.repairOf);
    },
    validate: (value) =>
      value === "good" ? { ok: true, issues: [] } : { ok: false, issues: [`reply was ${value}`] },
    sleep: noSleep,
  });
  return { result, calls };
}

// --- the walk ---------------------------------------------------------------

test("the first entry that produces a valid reply ends the walk", async () => {
  const { result, calls } = await walk(() => "good");
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["model-a"], "no second entry is dialled once one answers correctly");
});

test("a wrong reply is repaired on the SAME entry before the chain advances", async () => {
  // The production bug in one assertion: model-a is wrong, so model-b must get a
  // turn. Before this fix, model-a's wrong answer was final.
  const { result, calls } = await walk((model) => (model === "model-b" ? "good" : "bad"));
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["model-a", "model-a (repair)", "model-b"]);
});

test("a repair that succeeds keeps the exam on the warm entry", async () => {
  // Advancing on the first wrong answer would spend a cold model's quota on a
  // near miss the warm one can fix when told what is wrong.
  let first = true;
  const calls: string[] = [];
  const result = await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: async (entry, stage) => {
      calls.push(`${entry.model}${stage.repairOf ? " (repair)" : ""}`);
      if (first) {
        first = false;
        return "bad";
      }
      return "good";
    },
    validate: (v) => (v === "good" ? { ok: true, issues: [] } : { ok: false, issues: ["reply was bad"] }),
    sleep: noSleep,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value, "good");
  assert.equal(result.repaired, true, "the caller can tell a repair happened");
  assert.equal(result.entry, "groq:model-a");
  assert.deepEqual(calls, ["model-a", "model-a (repair)"], "model-b is never dialled");
});

test("the corrective call also gets a transport retry, so a throttle does not discard it", async () => {
  // Measured live 2026-10-26 (2as): the repair hit a 429, the ladder advanced, and
  // the exam failed on a gap-fill count the warm model would have fixed. The one
  // call most likely to be throttled is the second, because it follows a full
  // request — so the retry has to live inside the dial, not around the first one.
  const calls: string[] = [];
  let repairAttempts = 0;
  const result = await runChainLadder<string>({
    configs: [cfg("only")],
    ctx: {} as LadderStage,
    attempt: async (_entry, stage) => {
      calls.push(stage.repairOf ? "repair" : "first");
      if (!stage.repairOf) return "bad";
      repairAttempts += 1;
      if (repairAttempts === 1) throw new Error("AI provider error 429: rate limit");
      return "good";
    },
    validate: (v) => (v === "good" ? { ok: true, issues: [] } : { ok: false, issues: ["reply was bad"] }),
    sleep: noSleep,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.repaired, true);
  assert.deepEqual(calls, ["first", "repair", "repair"]);
});

test("the corrective call receives the validator's own words", async () => {
  // The reason repair works at all is that the exact issue text reaches the
  // model; asserting the argument closes that loop.
  const seen: Array<string | undefined> = [];
  await runChainLadder<string>({
    configs: [cfg("only")],
    ctx: {} as LadderStage,
    attempt: async (_entry, stage) => {
      seen.push(stage.repairOf);
      return "bad";
    },
    validate: () => ({ ok: false, issues: ["Generated text has 1 paragraph(s) instead of 3."] }),
    sleep: noSleep,
  });
  assert.deepEqual(seen, [undefined, "Generated text has 1 paragraph(s) instead of 3."]);
});

test("when every entry is wrong, the ORIGINAL issues are reported", async () => {
  // Never a downstream symptom of the retry: the teacher must see the real
  // reason the paper was not produced.
  const { result } = await walk(() => "bad");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, ["reply was bad"]);
  assert.equal(result.error, undefined, "a validation failure is not a transport error");
});

test("a validation failure and a transport failure stay distinguishable", async () => {
  const validation = await runChainLadder<string>({
    configs: [cfg("only")],
    ctx: {} as LadderStage,
    attempt: async () => "bad",
    validate: () => ({ ok: false, issues: ["wrong shape"] }),
    sleep: noSleep,
  });
  assert.equal(validation.ok, false);
  if (validation.ok) return;
  assert.deepEqual(validation.issues, ["wrong shape"]);

  const transport = await runChainLadder<string>({
    configs: [cfg("only")],
    ctx: {} as LadderStage,
    attempt: async () => {
      throw new Error("AI provider error 500: upstream exploded");
    },
    validate: () => ({ ok: true, issues: [] }),
    sleep: noSleep,
  });
  assert.equal(transport.ok, false);
  if (transport.ok) return;
  assert.deepEqual(transport.issues, [], "a dead provider is not a content verdict");
  assert.ok(transport.error instanceof Error);
});

test("an unreadable reply is corrected instead of retried verbatim", async () => {
  // `content` failures (invalid JSON, empty content, a task object with no
  // prompt) are shape problems: the model answered, the answer could not be
  // parsed. Re-rolling the identical prompt reproduces them, so the entry gets
  // one corrective call carrying the parser's reason.
  const calls: string[] = [];
  const result = await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: async (entry, stage) => {
      calls.push(`${entry.model}${stage.repairOf ? " (repair)" : ""}`);
      if (entry.model === "model-a") throw new Error("AI provider returned invalid JSON.");
      return "good";
    },
    validate: () => ({ ok: true, issues: [] }),
    sleep: noSleep,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["model-a", "model-a (repair)", "model-b"]);
});

test("a throttle retries the same entry once before advancing", async () => {
  // Free tiers answer 429/503 under shared load and the same request succeeds
  // seconds later, so the warm entry gets one more try than the cold one.
  const calls: string[] = [];
  const result = await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: async (entry) => {
      calls.push(entry.model);
      if (entry.model === "model-a") throw new Error("AI provider error 429: rate limit");
      return "good";
    },
    validate: () => ({ ok: true, issues: [] }),
    sleep: noSleep,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["model-a", "model-a", "model-b"]);
});

test("an auth failure stops the chain instead of burning the fallbacks", async () => {
  const calls: string[] = [];
  const result = await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: async (entry) => {
      calls.push(entry.model);
      throw new Error("AI provider error 401: invalid api key");
    },
    validate: () => ({ ok: true, issues: [] }),
    sleep: noSleep,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["model-a"], "a bad key is not something another model fixes");
});

test("a blocked model is remembered so later sections skip it", async () => {
  const blocked = new Set<string>();
  const tick = async (entry: ResolvedChainEntry) => {
    if (entry.model === "model-a") throw new Error("AI provider error 403: model not found");
    return "good";
  };
  await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: tick,
    validate: () => ({ ok: true, issues: [] }),
    sleep: noSleep,
    blocked,
  });
  assert.ok(blocked.has("groq:model-a"), "the refusal is recorded");

  // The next section must not spend a round trip rediscovering it.
  const calls: string[] = [];
  await runChainLadder<string>({
    configs: TWO,
    ctx: {} as LadderStage,
    attempt: async (entry) => {
      calls.push(entry.model);
      return "good";
    },
    validate: () => ({ ok: true, issues: [] }),
    sleep: noSleep,
    blocked,
  });
  assert.deepEqual(calls, ["model-b"]);
});

test("normalise runs before validation, so a computable fix never costs a call", async () => {
  const result = await runChainLadder<string>({
    configs: [cfg("only")],
    ctx: {} as LadderStage,
    attempt: async () => "too long",
    validate: (v) => (v === "trimmed" ? { ok: true, issues: [] } : { ok: false, issues: ["length"] }),
    normalise: (v) => (v === "too long" ? "trimmed" : v),
    sleep: noSleep,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value, "trimmed");
});

// --- the real path, against a stub that behaves like a bad model ------------

const BAD_PASSAGE = [
  "The ancient world remains a subject of study for modern historians who work in museums and universities across the region.",
].join("\n\n");

const GOOD_PASSAGE = [
  "The ancient world still shapes the way modern societies understand themselves, and archaeologists continue to uncover evidence of ordinary life in its cities. Excavations at Uruk have revealed workshops, granaries and narrow streets that once held thousands of inhabitants, and every season adds detail to that picture.",
  "Trade carried ideas as well as goods across great distances, linking the Mediterranean with the valleys of Mesopotamia and the oases of the desert. Pottery styles and metal objects found far from their place of manufacture show how far merchants travelled, and how quickly a technique could spread from one community to another.",
  "Written records offer another window onto these communities, recording harvests, debts and disputes in careful detail. Reading them reminds us that the people of the ancient world organised their lives with considerable skill and imagination, and that their concerns were often recognisably our own.",
].join("\n\n");

let server: http.Server;
let port = 0;
/** Which model each TEXT request named, in order. */
let dialled: string[] = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let model = "";
      try {
        model = String(JSON.parse(body)?.model ?? "");
      } catch {
        model = "";
      }
      dialled.push(model);
      const text = model === "bad-model" ? BAD_PASSAGE : GOOD_PASSAGE;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ candidates: [{ title: "Exploring the ancient world", text }] }),
              },
            },
          ],
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Export the chain the stub serves, and restore the environment afterwards. */
function useStubChain(): () => void {
  const saved = { ...process.env };
  process.env.AI_PROVIDER_CHAIN = "groq:bad-model,groq:good-model";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_BASE_URL = `http://127.0.0.1:${port}/v1`;
  return () => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  };
}

beforeEach(() => {
  dialled = [];
});

test("generateValidated replaces a model that writes the wrong passage", async () => {
  // End-to-end through the real transport and the real validator: the exact
  // production failure, with a good model behind the bad one.
  const restore = useStubChain();
  try {
    const ctx = buildContext({
      level: "secondary",
      grade: "3as",
      stream: "Lettres et Langues Étrangères",
      length: 150,
      unit: "u-ancient",
      topic: "Exploring the ancient world",
      examId: "ladder-stub",
    });

    const res = await generateValidated<GeneratedTextCandidate[]>({
      ctx,
      run: (impl, c) => impl.generateTextCandidates(c),
      validate: (candidates) =>
        candidates[0]
          ? validateCandidate("TEXT", { text: candidates[0].text, title: candidates[0].title }, undefined, {
              length: ctx.length,
              paragraphCount: ctx.paragraphCount,
            })
          : { ok: false, issues: ["no passage returned"] },
    });

    assert.equal(res.ok, true, res.ok ? "" : res.issues.join("; "));
    if (!res.ok) return;
    assert.equal(res.entry, "groq:good-model", "the working model served the passage");
    assert.equal(res.repaired, false, "the good model needed no corrective call");
    assert.deepEqual(
      dialled,
      ["bad-model", "bad-model", "good-model"],
      "the bad model got its one corrective call, then the chain advanced"
    );
    assert.equal(res.value[0]!.text, GOOD_PASSAGE);
  } finally {
    restore();
  }
});

test("a chain of only bad models fails with the validator's issues, not a transport error", async () => {
  const restore = useStubChain();
  try {
    process.env.AI_PROVIDER_CHAIN = "groq:bad-model";
    const ctx = buildContext({
      level: "secondary",
      grade: "3as",
      stream: "Lettres et Langues Étrangères",
      length: 150,
      unit: "u-ancient",
      topic: "Exploring the ancient world",
      examId: "ladder-stub-bad",
    });

    const res = await generateValidated<GeneratedTextCandidate[]>({
      ctx,
      run: (impl, c) => impl.generateTextCandidates(c),
      validate: (candidates) =>
        candidates[0]
          ? validateCandidate("TEXT", { text: candidates[0].text, title: candidates[0].title }, undefined, {
              length: ctx.length,
              paragraphCount: ctx.paragraphCount,
            })
          : { ok: false, issues: ["no passage returned"] },
    });

    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error, undefined, "the provider answered; the answer was simply wrong");
    assert.match(res.issues.join(" "), /word count/);
    assert.match(res.issues.join(" "), /1 paragraph\(s\) instead of 3/);
    assert.equal(dialled.length, 2, "one attempt plus one corrective call, never a loop");
  } finally {
    restore();
  }
});
