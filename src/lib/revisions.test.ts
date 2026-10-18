// Revision snapshots must be COMPLETE. `captureRevision` runs immediately after
// a generation writes its tasks (generate/route.ts:547-554), and a morphology or
// phonology task is only a task because of its `tableData`. A snapshot that
// omits `tableData` restores a task whose chart has vanished -- the paper prints
// a morphology instruction with no chart, which validateCandidate would have
// rejected at generation time.
//
// No database is used: `captureRevision` takes an injectable client, so a fake
// records what it was asked to store.

import { test } from "node:test";
import assert from "node:assert/strict";
import { captureRevision } from "./revisions";

/** The subset of the client `captureRevision` touches. */
function fakeClient(exam: unknown) {
  const created: any[] = [];
  return {
    created,
    client: {
      exam: { findUnique: async () => exam },
      examRevision: {
        create: async ({ data }: any) => {
          created.push(data);
          return data;
        },
        count: async () => 1,
        findMany: async () => [],
        deleteMany: async () => undefined,
      },
    } as any,
  };
}

const TABLE = { headers: ["Verb", "Noun", "Adjective"], rows: [["corrupt", "corruption", "to corrupt"]] };

function examWithTable() {
  return {
    id: "exam_1",
    title: "Advertising",
    config: {
      id: "cfg_1",
      level: "secondary",
      grade: "3as",
      stream: null,
      length: 150,
      paragraphCount: 4,
      unit: "u1",
      topic: "Advertising",
      customTopic: false,
      guideVersion: "v1",
      language: "en",
      teacherKeywords: null,
      difficulty: null,
    },
    sections: [
      {
        id: "sec_1",
        type: "TEXT_EXPLORATION",
        heading: "B/ Text Exploration",
        order: 2,
        content: null,
        tasks: [
          {
            id: "t1",
            skill: "MORPHOLOGY",
            prompt: "Complete the chart.",
            instruction: "Complete the chart as shown in the example.",
            answer: null,
            marks: 1.5,
            order: 0,
            manualEdited: false,
            family: "WORD_FAMILY",
            tableData: JSON.stringify(TABLE),
            candidates: null,
          },
        ],
        topics: [],
      },
    ],
    sources: [],
  };
}

test("a revision keeps a task's tableData and family", async () => {
  const { client, created } = fakeClient(examWithTable());
  await captureRevision("exam_1", "Text exploration generated", client);
  const snap = JSON.parse(created[0].snapshot);
  const task = snap.sections[0].tasks[0];
  assert.equal(task.tableData, JSON.stringify(TABLE), "the chart must survive a restore");
  assert.equal(task.family, "WORD_FAMILY", "the family must survive a restore");
});

test("a revision keeps the teacher's paragraph count", async () => {
  const { client, created } = fakeClient(examWithTable());
  await captureRevision("exam_1", "Manual checkpoint", client);
  const snap = JSON.parse(created[0].snapshot);
  assert.equal(snap.config.paragraphCount, 4);
});

test("captureRevision stores the label it was given", async () => {
  const { client, created } = fakeClient(examWithTable());
  await captureRevision("exam_1", "Before restore", client);
  assert.equal(created[0].label, "Before restore");
  assert.equal(created[0].examId, "exam_1");
});
