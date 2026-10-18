// Tests for `src/lib/serialize.ts`.
//
// These previously re-declared `safeParse` inline and exercised the COPY, so a
// regression in the real function would have shipped with every test green --
// the suite could not observe the code it named. It now imports the module.
// `serialize.ts` pulls in `@/lib/db`, but PrismaClient is lazy and constructs
// without a database connection, so the suite still runs offline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { safeParse, examToDto } from "./serialize";
import { DEFAULT_PARAGRAPH_COUNT } from "@/lib/generate";

test("safeParse returns default value for null input", () => {
  const result = safeParse(null, [] as string[]);
  assert.deepEqual(result, []);
});

test("safeParse returns default value for undefined input", () => {
  const result = safeParse(undefined, { foo: "bar" });
  assert.deepEqual(result, { foo: "bar" });
});

test("safeParse returns default value for empty string", () => {
  const result = safeParse("", [] as number[]);
  assert.deepEqual(result, []);
});

test("safeParse returns default value for invalid JSON", () => {
  const result = safeParse("{invalid json", { error: true });
  assert.deepEqual(result, { error: true });
});

test("safeParse parses valid JSON array", () => {
  const result = safeParse("[1, 2, 3]", [] as number[]);
  assert.deepEqual(result, [1, 2, 3]);
});

test("safeParse parses valid JSON object", () => {
  const result = safeParse('{"name":"test","value":42}', {} as { name: string; value: number });
  assert.deepEqual(result, { name: "test", value: 42 });
});

test("safeParse handles nested objects", () => {
  const result = safeParse<{ user: { id: number; name: string } }>(
    '{"user":{"id":1,"name":"Alice"}}',
    { user: { id: 0, name: "" } }
  );
  assert.equal(result.user.id, 1);
  assert.equal(result.user.name, "Alice");
});

test("safeParse handles JSON with whitespace", () => {
  const result = safeParse('  \n\t{ "key": "value" }  \n', {} as { key: string });
  assert.deepEqual(result, { key: "value" });
});

test("safeParse returns null for JSON null", () => {
  const result = safeParse("null", "default" as string | null);
  assert.equal(result, null);
});

test("safeParse parses JSON primitives", () => {
  assert.equal(safeParse("42", 0), 42);
  assert.equal(safeParse("3.14", 0), 3.14);
  assert.equal(safeParse("true", false), true);
  assert.equal(safeParse('"hello"', ""), "hello");
});

test("safeParse handles truncated JSON", () => {
  const result = safeParse('{"a":1,"b":', { error: true });
  assert.deepEqual(result, { error: true });
});

test("safeParse handles JSON with trailing garbage", () => {
  const result = safeParse('{"a":1}garbage', { error: true });
  assert.deepEqual(result, { error: true });
});

// ---- examToDto -------------------------------------------------------------

const NOW = new Date("2026-01-02T03:04:05.000Z");

/** A Prisma exam row of the shape `loadExamDto` returns. */
function examRow(over: Record<string, unknown> = {}) {
  return {
    id: "exam_1",
    title: "Advertising",
    status: "DRAFT",
    lastOpenedAt: NOW,
    updatedAt: NOW,
    createdAt: NOW,
    config: null,
    sections: [],
    sources: [],
    ...over,
  };
}

const SECTION = {
  id: "sec_1",
  type: "PART_ONE",
  heading: "A/ Comprehension",
  order: 1,
  content: null,
  tasks: [],
  topics: [],
};

test("examToDto orders tasks and topics by their stored order", async () => {
  const dto = await examToDto(
    examRow({
      sections: [
        {
          ...SECTION,
          tasks: [
            { id: "t2", skill: "READING", prompt: "two", instruction: null, answer: null, marks: 2, order: 2, manualEdited: false, family: null, tableData: null, candidates: null },
            { id: "t1", skill: "READING", prompt: "one", instruction: null, answer: null, marks: 1, order: 1, manualEdited: false, family: null, tableData: null, candidates: null },
          ],
          topics: [
            { id: "p2", kind: "FREE", title: null, situation: null, instruction: null, keywords: null, form: null, marks: 5, order: 2, manualEdited: false, candidates: null },
            { id: "p1", kind: "GUIDED", title: null, situation: null, instruction: null, keywords: null, form: null, marks: 5, order: 1, manualEdited: false, candidates: null },
          ],
        },
      ],
    })
  );
  assert.deepEqual(dto.sections[0].tasks.map((t) => t.id), ["t1", "t2"]);
  assert.deepEqual(dto.sections[0].topics.map((t) => t.id), ["p1", "p2"]);
});

test("examToDto tolerates unparseable section content instead of throwing", async () => {
  const dto = await examToDto(examRow({ sections: [{ ...SECTION, content: "{not json" }] }));
  assert.equal(dto.sections[0].text, null);
  assert.deepEqual(dto.sections[0].candidates, []);
  assert.equal(dto.sections[0].showTitle, false);
});

test("examToDto parses a section's stored text, title and source index", async () => {
  const dto = await examToDto(
    examRow({
      sections: [
        {
          ...SECTION,
          content: JSON.stringify({ text: "A passage.", title: "T", showTitle: true, sourceIndex: 2, candidates: [{ title: "c", text: "x" }] }),
        },
      ],
    })
  );
  assert.equal(dto.sections[0].text, "A passage.");
  assert.equal(dto.sections[0].textTitle, "T");
  assert.equal(dto.sections[0].showTitle, true);
  assert.equal(dto.sections[0].sourceIndex, 2);
  assert.equal(dto.sections[0].candidates.length, 1);
});

test("examToDto falls back to the default paragraph count when config omits one", async () => {
  const dto = await examToDto(
    examRow({
      config: {
        id: "cfg_1",
        level: "secondary",
        grade: "3as",
        stream: null,
        length: 150,
        paragraphCount: null,
        unit: "u1",
        topic: "Advertising",
        customTopic: false,
      },
    })
  );
  assert.equal(dto.config?.paragraphCount, DEFAULT_PARAGRAPH_COUNT);
  assert.equal(dto.config?.language, "en");
  assert.equal(dto.config?.guideVersion, null);
});

test("examToDto yields a null config rather than a half-built one", async () => {
  const dto = await examToDto(examRow({ config: null }));
  assert.equal(dto.config, null);
});

test("examToDto serialises dates to ISO strings", async () => {
  const dto = await examToDto(examRow());
  assert.equal(dto.createdAt, NOW.toISOString());
  assert.equal(dto.updatedAt, NOW.toISOString());
  assert.equal(dto.lastOpenedAt, NOW.toISOString());
});
