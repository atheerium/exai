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
      // Tabular skills come back with the answer cells FILLED. That is the real
      // failure the blanking stamp exists to absorb: the model answers its own
      // chart. Only the skills the payload marks as tabular get a table at all.
      const tabular = new Set(
        ((payload?.skills ?? []) as { skill: string; tableRequired: boolean }[])
          .filter((s) => s.tableRequired)
          .map((s) => s.skill)
      );
      const sets = [0, 1, 2].map(() => ({
        tasks: rules.map((r) => ({
          prompt: "1. Curiosity -> ..........",
          instruction: "Do it.",
          answer: "",
          marks: r.marks,
          skill: r.skill,
          family: "WORD_MEANING",
          ...(tabular.has(r.skill)
            ? {
                table: {
                  headers: ["Word", "Derived form"],
                  // Prefilled on purpose.
                  rows: [["curiosity", "curious"]],
                },
              }
            : {}),
        })),
      }));
      // Writing asks for topics, not tasks; the stub answers by echoing the
      // request's own shape so `parseLooseJson`/the writer parser both succeed.
      if (payload?.kind === "WRITING") {
        const setsW = [
          {
            guided: {
              kind: "GUIDED",
              title: "My favourite invention",
              situation: "You have won a prize.",
              instruction: "Write about it.",
              keywords: ["invention"],
              form: "email",
              marks: 5,
            },
            free: {
              kind: "FREE",
              title: "A person I admire",
              situation: "",
              instruction: "Write about them.",
              form: "paragraph",
              marks: 5,
            },
          },
        ];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ sets: setsW }) } }] }));
        return;
      }
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

// A repair is only a repair if the model is TOLD what was wrong. `repairOf`
// travels in the payload, and a payload field no request string mentions is
// inert -- the "corrected" call was byte-identical to the failed one.
const ISSUE = 'Task 1 targets "urge", which does not occur in the passage.';

function repairCtx() {
  return { ...ctx(PASSAGE), repairOf: ISSUE };
}

type Section = {
  label: string;
  repair: (g: any) => Promise<unknown>;
  fresh: (g: any) => Promise<unknown>;
};

const SECTIONS: Section[] = [
  {
    label: "Part One",
    repair: (g: any) => g.generatePartOneCandidates(repairCtx()),
    fresh: (g: any) => g.generatePartOneCandidates(ctx(PASSAGE)),
  },
  {
    label: "Text Exploration",
    repair: (g: any) => g.generateTextExplorationCandidates(repairCtx()),
    fresh: (g: any) => g.generateTextExplorationCandidates(ctx(PASSAGE)),
  },
  {
    label: "Writing",
    repair: (g: any) => g.generateWritingCandidates(repairCtx()),
    fresh: (g: any) => g.generateWritingCandidates(ctx(PASSAGE)),
  },
];

for (const section of SECTIONS) {
  test(`${section.label} repair request carries the validator's own complaint`, async () => {
    sent = [];
    await section.repair(createCompatibleGenerators(config));
    assert.equal(sent.length, 1);
    const request = String(sent[0].request);
    assert.match(request, /rejected for exactly these reasons/i, "request must name the failure");
    assert.ok(request.includes("urge"), "the failing target itself must be quoted back");
  });

  test(`${section.label} request stays clean when nothing was rejected`, async () => {
    sent = [];
    await section.fresh(createCompatibleGenerators(config));
    assert.doesNotMatch(String(sent[0].request), /rejected for exactly these reasons/i);
  });
}

test("no passage field is sent when no passage exists", async () => {
  sent = [];
  await createCompatibleGenerators(config).generatePartOneCandidates(ctx());
  assert.equal(sent.length, 1);
  assert.ok(!("passage" in sent[0]), "per-part generation must not gain a passage");
  assert.doesNotMatch(String(sent[0].request), /"passage" field/);
});
// ---- Tabular skills must be told the exact field, per skill ----------------
//
// Measured live 2026-10-13 through a logging proxy: the payload correctly said
// `tableRequired: true` for MORPHOLOGY and PHONOLOGY, and the reply carried no
// `table` key for either. The generic rule ("only morphology and phonology
// carry a table") did not bind, and the missing table failed the whole exam
// because the run is all-or-nothing.

test("each tabular skill is named with its marks and the literal field", async () => {
  sent = [];
  await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const request = String(sent[0].request);

  const tabular = (sent[0].skills as { skill: string; marks: number; tableRequired: boolean }[]).filter(
    (s) => s.tableRequired
  );
  assert.ok(tabular.length > 0, "fixture must contain tabular skills");

  for (const skill of tabular) {
    assert.ok(
      request.includes(`"${skill.skill}" (${skill.marks} marks) MUST carry a "table" field`),
      `${skill.skill} must be named individually, with its marks and the field`
    );
  }
  // The skeleton, not hard-coded headers: phonology headers are IPA symbols the
  // guide cannot prescribe.
  assert.match(request, /"table": \{"headers": \["\.\.\.","\.\.\."\]/);
});

test("a non-tabular skill is never told to emit a table", async () => {
  sent = [];
  await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const request = String(sent[0].request);
  const skills = sent[0].skills as { skill: string; tableRequired: boolean }[];
  const plain = skills.filter((s) => !s.tableRequired).map((s) => s.skill);
  for (const skill of plain) {
    assert.doesNotMatch(
      request,
      new RegExp(`"${skill}" \\([^)]*marks\\) MUST carry a "table" field`),
      `${skill} must not be told to carry a table`
    );
  }
});

test("a table's answer cells are emptied by code, not trusted from the model", async () => {
  // The stub replies with "curious" in the Derived form column. Those cells print
  // on the paper, and `assemble.ts` never reads the `answer` field precisely so
  // that answers cannot leak -- a prefilled table cell walks straight past that.
  sent = [];
  const sets = await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const tabular = sets[0].filter((t) => t.table);
  assert.ok(tabular.length > 0, "fixture must produce tabular tasks");
  for (const task of tabular) {
    for (const row of task.table!.rows) {
      assert.equal(row[0], "curiosity", "column 0 is the given material and must survive");
      assert.deepEqual(row.slice(1), [""], "every answer cell must be empty");
    }
  }
});

test("a non-tabular task never gains a table from the blanking stamp", async () => {
  sent = [];
  const sets = await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const plain = sets[0].filter((t) => !["MORPHOLOGY", "PHONOLOGY"].includes((t.skill ?? "").toUpperCase()));
  assert.ok(plain.length > 0);
  for (const task of plain) assert.equal(task.table, undefined);
});
