import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  chat,
  parseLooseJson,
  parseSource,
  parseTaskSets,
  candidateList as listFor,
  TEMPERATURE,
  DEFAULT_CANDIDATES,
  createCompatibleGenerators,
  type ProviderConfig,
} from "./provider";

// `chat` is the shared OpenAI/Groq transport. It owns a 30s AbortController
// timer, so every exit path must clear it — including a transport-level
// rejection, which is the easiest path to get wrong (fetch sits outside the
// try/finally that guards clearTimeout). A leaked timer is invisible to a
// unit test that only asserts on the thrown error, hence the timer census
// below.

type Mode =
  | "ok"
  | "error-status"
  | "non-json-content"
  | "fenced-json-content"
  | "bare-array-content"
  | "nested-array-content"
  | "json-validate-failed"
  | "json-validate-failed-always"
  | "empty-content";

let mode: Mode = "ok";
let requests = 0;
/** The decoded body of the most recent request, so wire fields can be asserted. */
let lastBody: Record<string, any> = {};
let server: http.Server;
let port = 0;
let closedPort = 0;

const activeTimers = (): number =>
  process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;

before(async () => {
  server = http.createServer((req, res) => {
    requests += 1;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        lastBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        lastBody = {};
      }
      respond(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;

  // Reserve then release a port so we have one that is reliably closed.
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  closedPort = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
});

function respond(res: http.ServerResponse) {
  const reply = (content: unknown) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  };
  if (mode === "error-status") {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "rate limit exceeded" } }));
  } else if (mode === "non-json-content") {
    reply("this is not json");
  } else if (mode === "fenced-json-content") {
    // Observed on OpenRouter: Gemma wraps its object in a fence even when
    // `response_format: json_object` is set.
    reply("```json\n" + JSON.stringify({ sets: [{ tasks: [] }] }) + "\n```");
  } else if (mode === "bare-array-content") {
    reply(JSON.stringify([{ title: "a", text: "one" }, { title: "b", text: "two" }]));
  } else if (mode === "nested-array-content") {
    reply(JSON.stringify([{ sets: [{ tasks: [{ title: "a", text: "one" }] }] }]));
  } else if (mode === "json-validate-failed") {
    // Groq validates the completion ITSELF when response_format is set and can
    // reject a payload that is perfectly usable. Refused once with the header,
    // then served normally without it.
    if (!lastBody.response_format) {
      reply(JSON.stringify({ sets: [{ tasks: [] }] }));
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: { message: "Failed to validate JSON. Please adjust your prompt.", code: "json_validate_failed" },
        })
      );
    }
  } else if (mode === "json-validate-failed-always") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: { message: "Failed to validate JSON. Please adjust your prompt.", code: "json_validate_failed" },
      })
    );
  } else if (mode === "empty-content") {
    reply("");
  } else {
    reply(JSON.stringify({ sets: [{ tasks: [] }] }));
  }
}

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

test("chat: salvages a fenced JSON reply instead of failing the exam", async () => {
  // Measured on OpenRouter 2026-10-11: Gemma returns a json fence even with
  // response_format set. The payload is semantically fine, so losing a whole
  // exam over cosmetics is the wrong trade.
  mode = "fenced-json-content";
  const parsed = await chat(config(), { kind: "TEXT" });
  assert.deepEqual(parsed, { sets: [{ tasks: [] }] });
});

test("chat: sends reasoning_effort and a generous max_tokens when configured", async () => {
  // The most important wire field in this file. Measured on Groq 2026-10-11
  // with openai/gpt-oss-120b: without a reasoning cap the model spent its whole
  // budget reasoning and returned EMPTY content, so Groq reported a JSON
  // validation failure (0/6 succeeded). With the cap: 6/6. Nothing in code would
  // catch a regression here except this assertion.
  mode = "ok";
  await chat(config({ reasoningEffort: "low", maxTokens: 4000 }), { kind: "TEXT" });
  assert.equal(lastBody.reasoning_effort, "low");
  assert.equal(lastBody.max_tokens, 4000);
});

test("chat: omits reasoning_effort entirely when not configured", async () => {
  // Several OpenAI-compatible endpoints reject the unknown field outright, so
  // it must be absent rather than null when a provider does not ask for it.
  mode = "ok";
  await chat(config(), { kind: "TEXT" });
  assert.ok(!("reasoning_effort" in lastBody), "field must not be sent unless asked for");
  assert.ok((lastBody.max_tokens ?? 0) >= 4000, "a default budget is always sent");
});

test("chat: temperature defaults to prose and honours an explicit override", async () => {
  // Structured tasks must not sample: a task that must emit a) b) c) on every
  // retry should produce the same shape each time.
  mode = "ok";
  await chat(config(), { kind: "TEXT" });
  assert.equal(lastBody.temperature, TEMPERATURE.prose);
  await chat(config(), { kind: "PART_ONE" }, { temperature: TEMPERATURE.structured });
  assert.equal(lastBody.temperature, TEMPERATURE.structured);
  assert.ok(TEMPERATURE.structured < TEMPERATURE.prose);
});

test("chat: the temperature override never leaks into the prompt", async () => {
  // The option lives on the call, not in the prompt object: an inlined
  // `temperature` key would be serialised into the user message.
  mode = "ok";
  await chat(config(), { kind: "PART_ONE" }, { temperature: 0.2 });
  const userMessage = lastBody.messages.find((m: any) => m.role === "user").content;
  assert.doesNotMatch(userMessage, /"temperature"/);
});

test("parseLooseJson: parses pure, fenced and prose-wrapped objects", () => {
  assert.deepEqual(parseLooseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseLooseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLooseJson('```\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseLooseJson('Sure! Here it is:\n{"a":1}\nHope that helps.'), { a: 1 });
});

test("parseLooseJson: still throws when there is genuinely no JSON", () => {
  // Salvage must not become silent acceptance of prose.
  assert.throws(() => parseLooseJson("this is not json"), /returned invalid JSON/);
  assert.throws(() => parseLooseJson(""), /returned invalid JSON/);
  assert.throws(() => parseLooseJson('{"a": '), /returned invalid JSON/);
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

test("parseTaskSets: enforces the requested set count, task count and marks total", () => {
  const set = (marks: number[]) => ({ tasks: marks.map((m) => ({ prompt: "q", marks: m })) });

  // `wanted` is passed explicitly so these assertions do not move when the
  // default proposal count changes.
  assert.throws(() => parseTaskSets({ sets: [set([1]), set([1])] }, 1, 1, undefined, 3), /missing task sets/);
  // Asked for 3 sets, so the third (which has 1 task instead of 2) is reached.
  assert.throws(() => parseTaskSets({ sets: [set([1, 1]), set([1, 1]), set([1])] }, 2, 2, undefined, 3), /expected 2/);
  assert.throws(() => parseTaskSets({ sets: [set([1]), set([1]), set([2])] }, 1, 1, undefined, 3), /marks total/);
  assert.throws(() => parseTaskSets({ sets: "nope" }, 1, 1, undefined, 3), /missing task sets/);
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
// --- Bare-array replies ----------------------------------------------------
//
// Measured live on Groq 2026-10-11: gpt-oss answered both the passage and the
// Part One request with a bare top-level array instead of the keyed object the
// prompt asked for. Both schemas exist ("candidates" and "sets"), so the key is
// resolved per call site, never guessed.

test("parseLooseJson recovers a bare array, fenced or prose-wrapped", () => {
  assert.deepEqual(parseLooseJson('[{"a":1},{"b":2}]'), [{ a: 1 }, { b: 2 }]);
  assert.deepEqual(parseLooseJson('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  // Prose-wrapped: the inner `{...}` must not win over the enclosing `[...]`.
  assert.deepEqual(parseLooseJson('Here you go:\n[{"a":1},{"b":2}]\nDone.'), [{ a: 1 }, { b: 2 }]);
});

test("parseLooseJson still prefers the leading object in a prose reply", () => {
  assert.deepEqual(parseLooseJson('Result:\n{"sets":[{"tasks":[]}]}\nEnd.'), {
    sets: [{ tasks: [] }],
  });
});

test("chat: accepts a bare-array reply under the requested key", async () => {
  // Transport-level guard for the live failure: the model returns an array, and
  // the generator must still find its candidates. Both schemas are exercised,
  // because hardcoding one key wrapped a Part One reply as `candidates` and then
  // failed to find `sets` -- worse than the original bug.
  mode = "bare-array-content";
  const parsed = await chat(config(), { kind: "TEXT" });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, "a");
});

test("candidateList unwraps a list nested inside a bare array", () => {
  // Measured live on Groq 2026-10-11: gpt-oss sometimes answers with
  // `[{"candidates":[...]}]`. Taken at face value, candidate 0 has keys
  // ["candidates"], so title/text read empty and the run died with
  // "Generated text has no title" -- blaming the validator, not the reply.
  const nested = [{ candidates: [{ title: "a", text: "one" }] }];
  const candidates = listFor(nested, "candidates") as Array<Record<string, unknown>>;
  assert.equal(candidates.length, 1);
  assert.equal(typeof candidates[0].title, "string");

  // A bare array that IS the list must be left alone.
  const flat = [{ title: "a", text: "one" }, { title: "b", text: "two" }];
  assert.equal(listFor(flat, "candidates")!.length, 2);

  // The sets schema unwraps its own key, not the passage one.
  assert.equal(listFor([{ sets: [{ tasks: [] }] }], "sets")!.length, 1);
  assert.equal(listFor([{ sets: [{ tasks: [] }] }], "candidates")!.length, 1, "still the outer array");
});

test("chat: retries once without response_format when the provider rejects its own JSON", async () => {
  // Measured live on Groq 2026-10-11: Part One returned a 400 json_validate_failed
  // for a payload that was fine. Advancing the chain cannot help (the next
  // entries were blocked models), so the only recovery is to re-ask without the
  // header -- parseLooseJson already tolerates unfenced JSON.
  mode = "json-validate-failed";
  const parsed = await chat(config(), { kind: "PART_ONE" });
  assert.deepEqual(parsed, { sets: [{ tasks: [] }] }, "recovered without the JSON header");
  assert.ok(!("response_format" in lastBody), "the retry must omit response_format");
});

test("chat: retries a JSON validation failure at most once", async () => {
  // Two calls total: the original, then the header-less retry. A third would
  // mean the recursion had no bound.
  mode = "json-validate-failed-always";
  const before = requests;
  await assert.rejects(() => chat(config(), { kind: "PART_ONE" }), /AI provider error 400/);
  assert.equal(requests - before, 2, "exactly one retry, never a loop");
});

// --- Family-keyed replies ---------------------------------------------------
//
// Captured live from Groq on 2026-10-11. Asked for {"sets":[{"tasks":[…]}]}, the
// model returned one array per FAMILY, using a different field name per family.
// 4+3+4+3 = 14 items, which is where "AI output has 14 tasks (expected 4)" came
// from: three sets flattened into one list.

const FAMILIES = [
  { family: "TRUE_FALSE", marks: 2, itemCount: 4, instruction: "Say if true or false." },
  { family: "QUESTIONS", marks: 2, itemCount: 3, instruction: "Answer the questions." },
  { family: "PARAGRAPH_ID", marks: 1.5, itemCount: 4, instruction: "Which paragraph?" },
  { family: "COHESIVE_MARKERS", marks: 1.5, itemCount: 3, instruction: "What does it refer to?" },
];

const CAPTURED = {
  TRUE_FALSE: [
    { statement: "Ruins show how cities were organised.", answer: "T" },
    { statement: "Local words never translate.", answer: "T" },
    { statement: "Museums show daily life.", answer: "T" },
    { statement: "Exact dates are given.", answer: "F" },
  ],
  QUESTIONS: [
    { question: "What do archaeologists study?", answer: "Ruins" },
    { question: "Why do words resist translation?", answer: "Cultural nuance" },
    { question: "What do museums display?", answer: "Objects" },
  ],
  PARAGRAPH_ID: [
    { idea: "Idea one.", paragraph: 1 },
    { idea: "Idea two.", paragraph: 1 },
    { idea: "Idea three.", paragraph: 1 },
    { idea: "Idea four.", paragraph: 2 },
  ],
  COHESIVE_MARKERS: [
    { underlined: "they", reference: "local languages" },
    { underlined: "objects", reference: "museums" },
    { underlined: "it", reference: "passage" },
  ],
};

test("parseTaskSets recovers a family-keyed reply using the guide as authority", () => {
  const sets = parseTaskSets(CAPTURED, 4, 7, FAMILIES);
  assert.equal(sets.length, DEFAULT_CANDIDATES, "one proposal by default");
  // 14 ITEMS become 4 TASKS: a family is a task, its itemCount is how many
  // items that task prints. That is the whole point of the adapter.
  const tasks = sets[0];
  assert.equal(tasks.length, 4);

  // Family order follows the GUIDE, not the reply's key order.
  assert.deepEqual(tasks.map((t) => t.family), ["TRUE_FALSE", "QUESTIONS", "PARAGRAPH_ID", "COHESIVE_MARKERS"]);
  // Marks come from the guide, never from the model.
  assert.equal(tasks.reduce((a, t) => a + t.marks, 0), 7);

  // Items are numbered inside the task, as the mock and normal path do.
  assert.equal(
    tasks[0].prompt,
    "1. Ruins show how cities were organised.\n2. Local words never translate.\n3. Museums show daily life.\n4. Exact dates are given."
  );
  assert.equal(tasks[0].answer, "1. T\n2. T\n3. T\n4. F");
  // The per-family field names are mapped.
  assert.match(tasks[1].prompt, /^1\. What do archaeologists study\?/);
  // A referent family has no prompt field at all; the blank is built in code.
  assert.match(tasks[3].prompt, /1\. The underlined word "they" refers to \.+?/);
  assert.match(tasks[3].answer ?? "", /local languages/);
});

test("parseTaskSets rejects a family-keyed reply with a missing family", () => {
  const partial = { ...CAPTURED };
  delete (partial as Record<string, unknown>).QUESTIONS;
  assert.throws(() => parseTaskSets(partial, 4, 7, FAMILIES), /task sets/);
});

test("parseTaskSets rejects a family-keyed reply with a corrupt entry", () => {
  // The captured COHESIVE_MARKERS value was not a list of objects at all.
  const corrupt = { ...CAPTURED, COHESIVE_MARKERS: { underlined: "they", reference: "x", 2: "objects" } };
  assert.throws(() => parseTaskSets(corrupt, 4, 7, FAMILIES), /task sets/);
});

test("parseTaskSets rejects a referent item missing its target", () => {
  // An empty blank the teacher would have to fix is worse than a rejection.
  const broken = { ...CAPTURED, COHESIVE_MARKERS: [{ underlined: "they" }, { underlined: "o", reference: "y" }] };
  assert.throws(() => parseTaskSets(broken, 4, 7, FAMILIES), /task sets/);
});

test("parseTaskSets ignores unknown keys when deciding it is family-keyed", () => {
  // An object with a key that is not a guide family is a different reply, and
  // must not be assembled into a partial exam.
  const unrelated = { TRUE_FALSE: CAPTURED.TRUE_FALSE, somethingElse: [{}] };
  assert.throws(() => parseTaskSets(unrelated, 4, 7, FAMILIES), /task sets/);
});

test("a correctly-shaped reply still takes the normal path", () => {
  const good = {
    sets: [0, 1, 2].map(() => ({
      tasks: FAMILIES.map((f) => ({
        prompt: "x", instruction: "y", answer: "z", marks: f.marks, skill: "READING", family: f.family,
      })),
    })),
  };
  const sets = parseTaskSets(good, 4, 7, FAMILIES);
  assert.equal(sets.length, DEFAULT_CANDIDATES);
  assert.equal(sets[0].length, 4);
});

// --- Flattened task lists ---------------------------------------------------
//
// Same defect as the family-keyed reply, wrapped differently: the model emits ONE
// task per ITEM instead of one per family. Captured live 2026-10-11 as
// "AI output has 14 tasks (expected 4)" -- 4+3+4+3 items inside a single set.

function flattenedSet() {
  return {
    sets: [0, 1, 2].map(() => ({
      tasks: [
        ...CAPTURED.TRUE_FALSE.map((t: any) => ({ prompt: t.statement, answer: t.answer, marks: 0.5, skill: "READING", family: "TRUE_FALSE" })),
        ...CAPTURED.QUESTIONS.map((t: any) => ({ prompt: t.question, answer: t.answer, marks: 2 / 3, skill: "READING", family: "QUESTIONS" })),
        ...CAPTURED.PARAGRAPH_ID.map((t: any) => ({ prompt: t.idea, answer: String(t.paragraph), marks: 0.375, skill: "READING", family: "PARAGRAPH_ID" })),
        ...CAPTURED.COHESIVE_MARKERS.map((t: any) => ({ prompt: t.underlined, answer: t.reference, marks: 0.5, skill: "READING", family: "COHESIVE_MARKERS" })),
      ],
    })),
  };
}

test("parseTaskSets regroups a flattened list into one task per family", () => {
  const sets = parseTaskSets(flattenedSet(), 4, 7, FAMILIES);
  const tasks = sets[0];
  assert.equal(tasks.length, 4, "14 items collapse to 4 family tasks");
  assert.deepEqual(tasks.map((t) => t.family), ["TRUE_FALSE", "QUESTIONS", "PARAGRAPH_ID", "COHESIVE_MARKERS"]);
  assert.equal(tasks.reduce((a, t) => a + t.marks, 0), 7);
  assert.equal(tasks[0].prompt.split("\n").length, 4);
  assert.match(tasks[0].prompt, /^Ruins show how cities were organised\./);
});

test("regrouping is refused when the item count does not match the guide", () => {
  // A list that is neither `count` tasks nor exactly the guide's total is some
  // other reply. It must still fail, not be sliced into something plausible.
  const wrong = { sets: [0, 1, 2].map(() => ({ tasks: [{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }] })) };
  assert.throws(() => parseTaskSets(wrong, 4, 7, FAMILIES), /has 3 tasks \(expected 4\)/);
});

test("a correctly grouped reply is never regrouped", () => {
  const good = {
    sets: [0, 1, 2].map(() => ({
      tasks: FAMILIES.map((f) => ({
        prompt: "1. x\n2. y", instruction: "i", answer: "1. a", marks: f.marks, skill: "READING", family: f.family,
      })),
    })),
  };
  const tasks = parseTaskSets(good, 4, 7, FAMILIES)[0];
  assert.equal(tasks.length, 4);
  assert.equal(tasks[0].prompt, "1. x\n2. y", "prompts must be left exactly as written");
});
