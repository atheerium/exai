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
import { isBlankCell } from "@/lib/export/tables";

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
                // Wrong column order and every cell filled, on purpose: the shape
                // the model actually returns. `officialTable` maps by header NAME
                // and rebuilds the chart, so this must still print legally.
                table:
                  r.skill === "MORPHOLOGY"
                    ? {
                        headers: ["Adjective", "Noun", "Verb"],
                        rows: [
                          ["corrupt", "corruption", "to corrupt"],
                          ["fraudulent", "", ""],
                        ],
                      }
                    : { headers: ["Word", "Derived form"], rows: [["curiosity", "curious"]] },
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

test("Part One prompt asks for direct True/False statements without source attribution", async () => {
  sent = [];
  await createCompatibleGenerators(config).generatePartOneCandidates(ctx(PASSAGE));
  const request = String(sent[0].request);
  assert.match(request, /For TRUE_FALSE items, write each statement as a direct, natural claim/i);
  assert.match(request, /avoid phrases such as "the passage\/text states", "according to the text"/i);
  assert.match(request, /write "Colour and music can trigger subconscious cravings\." rather than/i);
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
  // The shapes are now stated per skill, literally, because the generic
  // skeleton did not bind. They are a REQUEST: `officialTable` rebuilds the
  // layout from whatever arrives, so this asserts the model is told the real
  // shape rather than that it obeyed.
  assert.match(request, /"headers": \["Verb","Noun","Adjective"\]/);
  assert.match(request, /\["to corrupt","corruption","corrupt"\]/);
  assert.match(request, /"headers": \["prefix","root","suffix"\]/);
  assert.match(request, /\["\/t\/","\/d\/","\/ɪd\/"\]/);
  assert.match(request, /\["\/s\/","\/z\/","\/ɪz\/"\]/);
  assert.match(request, /exactly ONE row, all three cells EMPTY/i);
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
  // The stub fills in every cell it is given. Those cells print on the paper, and
  // `assemble.ts` never reads the `answer` field precisely so that answers cannot
  // leak -- a prefilled table cell walks straight past that.
  sent = [];
  const sets = await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const tabular = sets[0].filter((t) => t.table);
  assert.ok(tabular.length > 0, "fixture must produce tabular tasks");
  for (const task of tabular) {
    // A derivation chart's row 0 is the SOLVED EXAMPLE and is fully filled by
    // design: the instruction is "Complete the chart as shown in the example",
    // so the example is the instruction, not an answer. It is a different word
    // family from every test row, so it cannot answer one.
    const exampleRow = task.table!.headers.join(" ").toLowerCase().includes("verb") ? 1 : 0;
    for (const row of task.table!.rows.slice(exampleRow)) {
      // Only one cell per row may hold material; everything else is the student's.
      const filled = row.filter((cell) => !isBlankCell(cell));
      assert.ok(filled.length <= 1, `at most one given cell per row, got ${JSON.stringify(row)}`);
    }
  }
  // The phonology table is a classification chart: one row, nothing in it. Which
  // sound group it names depends on the task wording, which this stub does not
  // give, so either official triple is correct here.
  const phonology = tabular.find((t) => (t.skill ?? "").toUpperCase() === "PHONOLOGY");
  const groups: string[][] = [["/t/", "/d/", "/ɪd/"], ["/s/", "/z/", "/ɪz/"]];
  assert.ok(
    groups.some((g) => g.join() === phonology!.table!.headers.join()),
    `official sound groups, got ${JSON.stringify(phonology!.table!.headers)}`
  );
  assert.deepEqual(phonology!.table!.rows, [["", "", ""]], "exactly ONE empty row to sort into");
});

test("an official chart is rebuilt in code, whatever order the model used", async () => {
  // The shape the model returns is content, not layout: `officialTable` decides
  // the headers, the example row and the dotted cells. This stub answers with the
  // columns in the WRONG order and every cell filled, and the stamped table must
  // still be the official one with no derived form left in it.
  sent = [];
  const sets = await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const derivation = sets[0].find((t) => (t.skill ?? "").toUpperCase() === "MORPHOLOGY");
  assert.ok(derivation?.table, "the morphology task must carry a table");
  assert.deepEqual(
    derivation.table!.headers,
    ["Verb", "Noun", "Adjective"],
    "canonical column order, whatever came back"
  );
  // Row 0 is the solved example; every later row has exactly one given word and
  // dotted lines everywhere else.
  assert.equal(derivation.table!.rows[0].filter(Boolean).length, 3, "the example row is fully solved");
  for (const row of derivation.table!.rows.slice(1)) {
    const given = row.filter((cell) => cell !== "" && !/^\.+$/.test(cell));
    assert.equal(given.length, 1, `exactly one given word per row, got ${JSON.stringify(row)}`);
  }
  // The model's own second row (`fraudulent | fraud | to defraud`) is a TEST row
  // with three derived answers in it. Only the given word may survive.
  const testRows = derivation.table!.rows.slice(1);
  assert.ok(testRows.length > 0, "the test row must survive the rebuild");
  const survived = testRows.flat().filter((cell) => cell !== "" && !/^\.+$/.test(cell));
  assert.deepEqual(survived, ["fraudulent"], "only the given word reaches the paper");
  assert.ok(testRows.flat().every((cell) => cell === "" || cell === "fraudulent" || /^\.+$/.test(cell)));
});

test("a non-tabular task never gains a table from the blanking stamp", async () => {
  sent = [];
  const sets = await createCompatibleGenerators(config).generateTextExplorationCandidates(ctx(PASSAGE));
  const plain = sets[0].filter((t) => !["MORPHOLOGY", "PHONOLOGY"].includes((t.skill ?? "").toUpperCase()));
  assert.ok(plain.length > 0);
  for (const task of plain) assert.equal(task.table, undefined);
});
