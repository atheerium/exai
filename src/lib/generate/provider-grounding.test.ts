// The passage must actually reach the model.
//
// `groundingRule()` instructs the model to ground every task on the passage,
// but an instruction naming a field the payload does not contain is worse than
// useless: the model falls back to theme-level material, `checkTaskLinkage`
// rejects it against the real passage, and the all-or-nothing full-exam run
// returns 422 with nothing written. That failure is invisible in unit tests
// unless something inspects the request body, which is what this file does.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createCompatibleGenerators, type ProviderConfig } from "./provider";
import { buildContext } from "./index";
import { GRADES, getGuide } from "@/data/guides";

let server: http.Server;
let port = 0;
/** Bodies of the chat requests the generators sent, newest last. */
let sent: Record<string, unknown>[] = [];

const PASSAGE = "Curiosity shapes honest research in every classroom. Pupils ask many questions.";

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
        const userContent = parsed?.messages?.map((m: any) => m?.content).join("\n") ?? "";
        // The transport flattens the payload into the user message; recover the
        // JSON object so assertions can inspect named fields.
        const start = userContent.indexOf("{");
        sent.push(start >= 0 ? JSON.parse(userContent.slice(start)) : { __raw: userContent });
      } catch {
        sent.push({ __unparsed: raw });
      }
      // Answer by echoing what the request itself asked for. Task counts and mark
      // totals differ per stream and per kind, and parseTaskSets rejects any
      // mismatch -- so deriving them from the payload keeps the stub honest for
      // whichever guide the context resolved.
      const payload = sent[sent.length - 1] as any;
      const rules: { marks: number; skill: string }[] =
        payload?.kind === "TEXT_EXPLORATION"
          ? (payload.skills ?? []).map((s: any) => ({ marks: s.marks, skill: s.skill }))
          : (payload?.families ?? []).map((f: any) => ({ marks: f.marks, skill: "READING" }));
      const sets = [0, 1, 2].map(() => ({
        tasks: rules.map((r) => ({
          prompt: "1. Curiosity -> ..........",
          instruction: "Do it.",
          answer: "",
          marks: r.marks,
          skill: r.skill,
          family: "WORD_MEANING",
        })),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sets }) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function config(): ProviderConfig {
  return {
    apiKey: "test-key",
    baseUrl: `http://127.0.0.1:${port}/v1`,
    model: "stub-model",
    providerLabel: "openai",
  };
}

function ctx(groundingText?: string) {
  const gd = GRADES["3as"]!;
  const stream = gd.streams?.[0];
  const unit = gd.units.find((u) => !u.streams || !stream || u.streams.includes(stream!)) ?? gd.units[0];
  return {
    ...buildContext({
      level: gd.level,
      grade: "3as",
      stream,
      length: getGuide("3as", "en", stream)!.defaultLength,
      unit: unit.key,
      topic: unit.topics[0],
      examId: "grounding-test",
      groundingText: groundingText ?? null,
    }),
  };
}

test("Part One payload carries the passage when grounding is requested", async () => {
  sent = [];
  await createCompatibleGenerators(config).generatePartOneCandidates(ctx(PASSAGE));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].passage, PASSAGE);
});

test("Text Exploration payload carries the passage when grounding is requested", async () => {
  sent = [];
  await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].passage, PASSAGE);
});

test("the prompt names the passage field it must ground on", async () => {
  sent = [];
  await createCompatibleGenerators(config).generatePartOneCandidates(ctx(PASSAGE));
  const request = String(sent[0].request);
  assert.match(request, /"passage" field/, "instruction must point at the payload field");
  assert.ok(
    !/passage is given above/i.test(request),
    "must not claim the passage arrives as prose above the request"
  );
});

test("no passage field is sent when no passage exists", async () => {
  sent = [];
  await createCompatibleGenerators(config).generatePartOneCandidates(ctx());
  assert.equal(sent.length, 1);
  assert.ok(!("passage" in sent[0]), "per-part generation must not gain a passage");
  assert.doesNotMatch(String(sent[0].request), /"passage" field/);
});