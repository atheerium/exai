import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildContext, generateTextCandidates, generatePartOneCandidates, generateTextExplorationCandidates, generateWritingCandidates, generateRewriteCandidates, validateCandidate } from "./index";

function makePartOneTasks() {
  const sets: any[] = [];
  for (let s = 0; s < 3; s++) {
    sets.push({
      tasks: [
        { prompt: "1." + (s + 1) + "a Schools will disappear completely.", instruction: "Are the following statements true or false?", answer: "False.", marks: 1.5, skill: "READING" },
        { prompt: "2." + (s + 1) + "b Why is education changing?", instruction: "Answer the following questions.", answer: "Because of technology.", marks: 2, skill: "READING" },
        { prompt: "3." + (s + 1) + "c In which paragraph is it mentioned that technology helps students?", instruction: "In which paragraph?", answer: "Paragraph 2", marks: 1.5, skill: "READING" },
        { prompt: "4." + (s + 1) + "d Who or what do the underlined words refer to?", instruction: "Who or what do the underlined words refer to?", answer: "students", marks: 1, skill: "READING" },
        { prompt: "5." + (s + 1) + "e Choose the best title for the text.", instruction: "Give a title.", answer: "The future of education", marks: 1, skill: "READING" },
      ],
    });
  }
  return sets;
}

function makeTextExplorationTasks() {
  const sets: any[] = [];
  for (let s = 0; s < 3; s++) {
    sets.push({
      tasks: [
        { prompt: "1." + (s + 1) + " Match words.", instruction: "Find synonyms.", answer: "learn - knowledge", marks: 1.5, skill: "VOCABULARY" },
        { prompt: "2." + (s + 1) + " education -> adjective", instruction: "Give derived form.", answer: "educational", marks: 1.5, skill: "MORPHOLOGY" },
        { prompt: "3." + (s + 1) + " Classify words.", instruction: "Classify by pronunciation.", answer: "/t/: practised", marks: 1, skill: "PHONOLOGY" },
        { prompt: "4." + (s + 1) + " Rewrite.", instruction: "Rewrite sentence.", answer: "Same meaning.", marks: 2, skill: "GRAMMAR" },
        { prompt: "5." + (s + 1) + " Fill gaps.", instruction: "Fill in gaps.", answer: "but", marks: 1, skill: "DISCOURSE" },
      ],
    });
  }
  return sets;
}

function makeWritingSets() {
  const sets: any[] = [];
  for (let s = 0; s < 3; s++) {
    sets.push({
      guided: { kind: "GUIDED", title: "Topic 1", situation: "Write about education (v" + (s + 1) + ").", instruction: "Write a paragraph.", keywords: "technology/teachers", form: "a paragraph", marks: 3 },
      free: { kind: "FREE", title: "Topic 2", situation: "Education will change (v" + (s + 1) + ").", instruction: "Give your opinion.", form: "an opinion paragraph", marks: 3 },
    });
  }
  return sets;
}

function makeRewriteCandidates() {
  return [
    { title: "Learning", text: "Education changes. Teachers use tools, students learn at their pace (r1)." },
    { title: "Learning", text: "Education changes. Teachers use tools, students learn at their pace (r2)." },
    { title: "Learning", text: "Education changes. Teachers use tools, students learn at their pace (r3)." },
  ];
}

const CANNED: Record<string, any> = {
  TEXT: {
    candidates: [
      { title: "Learning for life", text: "Education is changing quickly across the world. Teachers use new tools to help students learn, and learners take more responsibility for their own progress." },
      { title: "The classroom of tomorrow", text: "Classrooms are becoming more interactive. Technology helps teachers explain difficult ideas." },
      { title: "A fairer education", text: "Education should be open to everyone. Digital tools help students in small villages follow the same lessons." },
    ],
  },
  PART_ONE: { sets: makePartOneTasks() },
  TEXT_EXPLORATION: { sets: makeTextExplorationTasks() },
  WRITING: { sets: makeWritingSets() },
  REWRITE: { candidates: makeRewriteCandidates() },
};

let server: http.Server;
let port = 0;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let kind = "TEXT";
      try {
        const parsed = JSON.parse(body);
        const user = parsed.messages?.find((m: any) => m.role === "user")?.content;
        kind = JSON.parse(user).kind ?? "TEXT";
      } catch { kind = "TEXT"; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(CANNED[kind] ?? CANNED.TEXT) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as any).port;
  process.env.AI_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_BASE_URL = "http://127.0.0.1:" + port + "/v1";
  process.env.GROQ_MODEL = "stub-model";
});

after(async () => {
  server.close();
  delete process.env.AI_PROVIDER;
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_BASE_URL;
  delete process.env.GROQ_MODEL;
});

const input = {
  level: "secondary",
  grade: "3as",
  stream: "Lettres et Langues Étrangères",
  length: 150,
  unit: "u-education",
  topic: "The future of education",
  examId: "groq-exam",
};

test("groq provider: text candidates flow through the stub and validate", async () => {
  const candidates = await generateTextCandidates(buildContext(input));
  assert.equal(candidates.length, 3);
  for (const c of candidates) {
    assert.ok(c.text.length > 50);
    assert.ok(c.title);
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("groq provider: part one sets validate", async () => {
  const sets = await generatePartOneCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const v = validateCandidate("PART_ONE", set, buildContext(input).guide.marks.partOne);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("groq provider: text exploration sets validate", async () => {
  const sets = await generateTextExplorationCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const set of sets) {
    const v = validateCandidate("TEXT_EXPLORATION", set, buildContext(input).guide.marks.textExploration);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("groq provider: writing sets validate", async () => {
  const sets = await generateWritingCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const pair of sets) {
    const v = validateCandidate("WRITING", pair);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("groq provider: rewrite candidates validate", async () => {
  const base = await generateTextCandidates(buildContext(input));
  const rewritten = await generateRewriteCandidates(buildContext(input), { text: base[0].text, title: base[0].title, target: "simpler" });
  assert.equal(rewritten.length, 3);
  for (const c of rewritten) {
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("groq provider: missing API key fails with a clear error", async () => {
  const key = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  await assert.rejects(() => generateTextCandidates(buildContext(input)), /GROQ_API_KEY/);
  process.env.GROQ_API_KEY = key;
});
