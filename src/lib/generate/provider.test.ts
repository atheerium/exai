import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chat, parseSource, parseTaskSets, type ProviderConfig } from "./provider";

// `chat` is the shared OpenAI/Groq transport. It owns a 30s AbortController
// timer, so every exit path must clear it — including a transport-level
// rejection, which is the easiest path to get wrong (fetch sits outside the
// try/finally that guards clearTimeout). A leaked timer is invisible to a
// unit test that only asserts on the thrown error, hence the timer census
// below.

type Mode = "ok" | "error-status" | "non-json-content" | "empty-content";

let mode: Mode = "ok";
let requests = 0;
let server: http.Server;
let port = 0;
let closedPort = 0;

const activeTimers = (): number =>
  process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

before(async () => {
  server = http.createServer((_req, res) => {
    requests += 1;
    const reply = (content: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    };
    if (mode === "error-status") {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limit exceeded" } }));
    } else if (mode === "non-json-content") {
      reply("this is not json");
    } else if (mode === "empty-content") {
      reply("");
    } else {
      reply(JSON.stringify({ sets: [{ tasks: [] }] }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;

  // Reserve then release a port so we have one that is reliably closed.
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  closedPort = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function config(over: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    apiKey: "test-key",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    model: "stub-model",
    providerLabel: "openai",
    ...over,
  };
}

test("chat: returns the parsed JSON payload", async () => {
  mode = "ok";
  const parsed = await chat(config(), { kind: "TEXT" });
  assert.deepEqual(parsed, { sets: [{ tasks: [] }] });
});

test("chat: surfaces a non-OK status with a body snippet", async () => {
  mode = "error-status";
  await assert.rejects(
    () => chat(config(), { kind: "TEXT" }),
    /AI provider error 429.*rate limit exceeded/
  );
});

test("chat: reports a non-JSON payload as invalid JSON", async () => {
  mode = "non-json-content";
  await assert.rejects(() => chat(config(), { kind: "TEXT" }), /returned invalid JSON/);
});

test("chat: reports an empty completion distinctly from bad JSON", async () => {
  mode = "empty-content";
  await assert.rejects(() => chat(config(), { kind: "TEXT" }), /returned no content/);
});

test("chat: rejects without an API key and never reaches the network", async () => {
  const before = requests;
  await assert.rejects(() => chat(config({ apiKey: undefined }), {}), /OPENAI_API_KEY/);
  assert.equal(requests, before);
});

test("chat: clears the abort timer on every exit path", async () => {
  const exits: Array<[string, () => Promise<unknown>]> = [
    ["success", () => (mode = "ok", chat(config(), {}))],
    ["http error status", () => (mode = "error-status", chat(config(), {}))],
    ["invalid JSON content", () => (mode = "non-json-content", chat(config(), {}))],
    ["transport rejection", () => chat(config({ baseUrl: `http://127.0.0.1:${closedPort}/v1` }), {})],
  ];

  for (const [name, run] of exits) {
    const before = activeTimers();
    await run().catch(() => undefined);
    assert.equal(activeTimers(), before, `chat() leaked an abort timer on the ${name} path`);
  }
});

test("parseSource: rejects non-objects and entries with nothing usable", () => {
  assert.equal(parseSource(null), null);
  assert.equal(parseSource("a string"), null);
  assert.equal(parseSource({}), null);
  assert.equal(parseSource({ author: "Someone" }), null);
});

test("parseSource: fills defaults and flags external citations", () => {
  const original = parseSource({ adaptationNote: "Written for this exam." });
  assert.deepEqual(original, {
    title: "Source",
    author: null,
    publication: null,
    url: null,
    adaptationNote: "Written for this exam.",
    isExternal: false,
  });

  const cited = parseSource({ title: "The Economist", url: "https://example.com/a" });
  assert.equal(cited?.title, "The Economist");
  assert.equal(cited?.isExternal, true);
  assert.equal(cited?.adaptationNote, "Adapted for classroom use.");
});

test("parseTaskSets: enforces three sets, task count and marks total", () => {
  const set = (marks: number[]) => ({ tasks: marks.map((m) => ({ prompt: "q", marks: m })) });

  assert.throws(() => parseTaskSets({ sets: [set([1]), set([1])] }, 1, 1), /missing task sets/);
  assert.throws(() => parseTaskSets({ sets: [set([1, 1]), set([1, 1]), set([1])] }, 2, 2), /expected 2/);
  assert.throws(() => parseTaskSets({ sets: [set([1]), set([1]), set([2])] }, 1, 1), /marks total/);
  assert.throws(() => parseTaskSets({ sets: "nope" }, 1, 1), /missing task sets/);
});

test("parseTaskSets: keeps only the first three sets and coerces fields", () => {
  const json = {
    sets: Array.from({ length: 5 }, () => ({
      tasks: [
        {
          prompt: 42,
          marks: "1.5",
          answer: 0,
          skill: { toString: () => "READING" },
          table: { headers: [1, 2], rows: [[1, 2], "flat"] },
        },
      ],
    })),
  };
  const [first] = parseTaskSets(json, 1, 1.5);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0], {
    prompt: "42",
    instruction: "",
    // A falsy answer (here 0) is dropped rather than stringified.
    answer: undefined,
    marks: 1.5,
    skill: "READING",
    family: undefined,
    table: { headers: ["1", "2"], rows: [["1", "2"], ["flat"]] },
  });
});