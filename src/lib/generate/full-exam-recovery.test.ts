// Proven recovery of the 2026-10-26 production failure: validation lives inside
// the chain (`runChainLadder`), not after it. A bad model that writes a 1-paragraph
// passage must not win; the same entry gets one corrective call, then the chain
// advances to the good model. Fixtures: BAD/GOOD text from ladder.test.ts
// (verified fixtures from the established chain ladder); partOne/textExploration/
// writing fixtures from mock provider output (recorded command below).
//
// Recording attempt (failed): `timeout 300 npx tsx /tmp/opencode/fix.ts` — first
// module resolution error (fixed with absolute imports), then Groq 429 rate-limit
// (`Rate limit reached for model openai/gpt-oss-120b ... Limit 8000`).
// Fixtures fall back to verified mock provider output (run with `node --import tsx`)
// and ladder.test.ts fixtures; no invented content.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { generateFullExam } from "./full-exam";
import { BAD_TEXT_CONTENT, GOOD_TEXT_CONTENT, PART_ONE_FIXTURE, TEXT_EXPLORATION_FIXTURE, WRITING_FIXTURE } from "./full-exam-fixtures";

let server: http.Server;
let port = 0;
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

      // Route by the `kind` the provider actually sends, never by request
      // ordinal: an ordinal-based stub keeps serving plausible fixtures after a
      // behaviour change, so the test would pass for the wrong reason. `kind`
      // lives inside the serialised message payload, not at the body's top
      // level, so it is matched against the raw body rather than a field.
      const kindOf = (raw: string): string => {
        try {
          const parsed = JSON.parse(raw);
          const content = parsed?.messages?.find?.((m: { role?: string }) => m.role === "user")?.content;
          if (typeof content !== "string") return "";
          return String(JSON.parse(content)?.kind ?? "");
        } catch {
          return "";
        }
      };
      const kind = kindOf(body);

      let contentStr: string;
      if (kind === "TEXT") {
        // The one deliberately bad reply: a valid JSON passage of 1 paragraph /
        // ~60 words, i.e. the production 422.
        contentStr = model === "bad-model" ? BAD_TEXT_CONTENT : GOOD_TEXT_CONTENT;
      } else if (kind === "PART_ONE") {
        contentStr = PART_ONE_FIXTURE;
      } else if (kind === "TEXT_EXPLORATION") {
        contentStr = TEXT_EXPLORATION_FIXTURE;
      } else {
        contentStr = WRITING_FIXTURE;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: contentStr } }],
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

beforeEach(() => {
  dialled = [];
});

function restoreEnv(saved: Record<string, string | undefined>): () => void {
  return () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  };
}

test("generateFullExam recovers when the first model writes a bad passage", async () => {
  const saved = { ...process.env };
  try {
    process.env.AI_PROVIDER = "";
    process.env.AI_PROVIDER_CHAIN = "groq:bad-model,groq:good-model";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_BASE_URL = `http://127.0.0.1:${port}/v1`;

    const result = await generateFullExam({
      level: "secondary",
      grade: "3as",
      stream: "Lettres et Langues Étrangères",
      length: 150,
      unit: "u-ancient",
      topic: "Exploring the ancient world",
      examId: "full-exam-recovery",
      singleTopic: false,
    });

    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues));
    if (!result.ok) return;

    // The passage must be the GOOD one (3 paragraphs, 120-180 words)
    const goodText = JSON.parse(GOOD_TEXT_CONTENT).candidates[0].text;
    assert.equal(result.text!.text, goodText);
    const paras = result.text!.text.split(/\n{2,}/).filter((p) => p.trim()).length;
    assert.equal(paras, 3, `expected 3 paragraphs, got ${paras}`);

    // Chain: bad-model gets attempt + corrective call, then chain advances to good-model
    assert.ok(dialled.length >= 3, `expected at least 3 dials (bad attempt + bad repair + good), got ${JSON.stringify(dialled)}`);
    assert.equal(dialled[0], "bad-model", "first dial must be bad-model");
    assert.equal(dialled[1], "bad-model", "second dial must be bad-model (corrective call)");
    assert.equal(dialled[2], "good-model", "third dial must advance to good-model");

    // Non-empty downstream sections (all-or-nothing contract: they must exist)
    assert.ok(result.partOne && result.partOne.length > 0, "partOne must be non-empty");
    assert.ok(result.textExploration && result.textExploration.length > 0, "textExploration must be non-empty");
    assert.ok(result.writing && result.writing.length > 0, "writing must be non-empty");
  } finally {
    restoreEnv(saved)();
  }
});

test("when both models return the bad passage, generateFullExam fails with TEXT issues", async () => {
  const saved = { ...process.env };
  try {
    process.env.AI_PROVIDER = "";
    process.env.AI_PROVIDER_CHAIN = "groq:bad-model";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_BASE_URL = `http://127.0.0.1:${port}/v1`;

    const result = await generateFullExam({
      level: "secondary",
      grade: "3as",
      stream: "Lettres et Langues Étrangères",
      length: 150,
      unit: "u-ancient",
      topic: "Exploring the ancient world",
      examId: "full-exam-recovery-bad",
      singleTopic: false,
    });

    assert.equal(result.ok, false);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].section, "TEXT");
    const messages = result.issues[0].messages.join(" ");
    assert.match(messages, /word count/i, "message must mention word count");
    assert.match(messages, /1 paragraph\(s\) instead of 3/i, "message must mention paragraph count mismatch");

    // Never a thrown error, never a partial payload
    assert.equal(result.text, undefined, "no partial text payload on failure");
    assert.equal(result.partOne, undefined, "no partial partOne payload");

    // Exactly one attempt + one corrective call = 2 dials
    assert.equal(dialled.length, 2, `expected exactly 2 dials (attempt + repair), got ${JSON.stringify(dialled)}`);
    assert.deepEqual(dialled, ["bad-model", "bad-model"]);
  } finally {
    restoreEnv(saved)();
  }
});
