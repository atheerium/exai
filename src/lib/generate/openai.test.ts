import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildContext, generateTextCandidates, generatePartOneCandidates, generateTextExplorationCandidates, generateWritingCandidates, generateRewriteCandidates, validateCandidate } from "./index";

// Canned OpenAI-compatible responses keyed by the "kind" field the provider
// embeds in its prompt. These let us validate the full provider plumbing
// (request shape, parsing, schema validation, retry-safe errors) with no key.

function makePartOneTasks() {
  const sets: any[] = [];
  for (let s = 0; s < 3; s++) {
    sets.push({
      tasks: [
        { prompt: "1." + (s + 1) + "a Schools will disappear completely.", instruction: "Are the following statements true or false? Write T or F next to the letter.", answer: "False. Schools will still matter.", marks: 1.5, skill: "READING" },
        { prompt: "2." + (s + 1) + "b Why is education changing?", instruction: "Answer the following questions according to the text.", answer: "Because of new technology and learner responsibility.", marks: 2, skill: "READING" },
        { prompt: "3." + (s + 1) + "c In which paragraph is it mentioned that technology helps students?", instruction: "In which paragraph is it mentioned that...?", answer: "Paragraph 2", marks: 1.5, skill: "READING" },
        { prompt: "4." + (s + 1) + "d Who or what do the underlined words refer to?", instruction: "Who or what do the underlined words refer to in the text?", answer: "students and teachers", marks: 1, skill: "READING" },
        { prompt: "5." + (s + 1) + "e Choose the best title for the text.", instruction: "Give a title to the text / Choose the general idea of the text.", answer: "The future of education", marks: 1, skill: "READING" },
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
        { prompt: "1." + (s + 1) + " Match the words with their definitions.", instruction: "Find in the text words or phrases closest in meaning.", answer: "learn - to gain knowledge", marks: 1.5, skill: "VOCABULARY" },
        { prompt: "2." + (s + 1) + " education -> (adjective)", instruction: "Give the noun/verb/adjective derived from the words.", answer: "educational", marks: 1.5, skill: "MORPHOLOGY" },
        { prompt: "3." + (s + 1) + " Classify: learned, practised, connected", instruction: "Classify the words by the pronunciation of the final -ed.", answer: "/t/: practised /d/: learned /id/: connected", marks: 1, skill: "PHONOLOGY" },
        { prompt: "4." + (s + 1) + " Technology helps students learn faster.", instruction: "Rewrite sentence B so that it means the same as sentence A.", answer: "Students learn faster thanks to technology.", marks: 2, skill: "GRAMMAR" },
        { prompt: "5." + (s + 1) + " Schools will still matter, ___ they will work differently.", instruction: "Fill in the gaps with words from the list given.", answer: "but", marks: 1, skill: "DISCOURSE" },
      ],
    });
  }
  return sets;
}

function makeWritingSets() {
  const sets: any[] = [];
  for (let s = 0; s < 3; s++) {
    sets.push({
      guided: {
        kind: "GUIDED",
        title: "Topic 1",
        situation: "Your school magazine asks you to write about the future of education (variant " + (s + 1) + ").",
        instruction: "Write a paragraph of about 80-100 words using the notes below.",
        keywords: "technology/teachers/students",
        form: "a paragraph",
        marks: 3,
      },
      free: {
        kind: "FREE",
        title: "Topic 2",
        situation: "In a few years, education will change completely (variant " + (s + 1) + "). Do you agree?",
        instruction: "Write a paragraph of about 80-100 words giving your opinion.",
        form: "an opinion paragraph",
        marks: 3,
      },
    });
  }
  return sets;
}

function makeRewriteCandidates() {
  const candidates: any[] = [];
  for (let i = 0; i < 3; i++) {
    candidates.push({
      title: "Learning for life",
      text: "Education is changing quickly. Teachers use new tools, and students practise at their own pace (rewrite variant " + (i + 1) + "). Schools will still matter, but they will work differently, with more projects and less memorisation. Every learner should have access to good teaching, wherever they live.",
    });
  }
  return candidates;
}

const CANNED: Record<string, any> = {
  TEXT: {
    candidates: [
      { title: "Learning for life", text: "Education is changing quickly across the world. Teachers use new tools to help students learn, and learners take more responsibility for their own progress. In the future every classroom may be connected to the internet, giving students access to knowledge from anywhere." },
      { title: "The classroom of tomorrow", text: "Classrooms are becoming more interactive and more personal. Technology helps teachers explain difficult ideas, while students practise at their own pace. Schools will still matter, but they will work differently, with more projects and less memorisation." },
      { title: "A fairer education", text: "Education should be open to everyone. With digital tools, students in small villages can follow the same lessons as students in big cities. Parents, teachers and students will cooperate to make learning fairer and more useful for every learner." },
    ],
  },
  PART_ONE: { sets: makePartOneTasks() },
  TEXT_EXPLORATION: { sets: makeTextExplorationTasks() },
  WRITING: { sets: makeWritingSets() },
  REWRITE: { candidates: makeRewriteCandidates() },
};

let server: http.Server;
let port = 0;
let requests = 0;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests += 1;
      let kind = "TEXT";
      try {
        const parsed = JSON.parse(body);
        const user = parsed.messages?.find((m: any) => m.role === "user")?.content;
        kind = JSON.parse(user).kind ?? "TEXT";
      } catch {
        kind = "TEXT";
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(CANNED[kind] ?? CANNED.TEXT) } }],
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as any).port;
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "http://127.0.0.1:" + port + "/v1";
  process.env.OPENAI_MODEL = "stub-model";
});

after(async () => {
  server.close();
  delete process.env.AI_PROVIDER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
});

const input = {
  level: "secondary",
  grade: "3as",
  stream: "Lettres et Langues Étrangères",
  length: 150,
  unit: "u-education",
  topic: "The future of education",
  examId: "openai-exam",
};

test("openai provider: text candidates flow through the stub and validate", async () => {
  const candidates = await generateTextCandidates(buildContext(input));
  assert.equal(candidates.length, 3);
  for (const c of candidates) {
    assert.ok(c.text.length > 50);
    assert.ok(c.title);
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("openai provider: part one sets validate (5 tasks, 7 marks)", async () => {
  const sets = await generatePartOneCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const set of sets) {
    assert.equal(set.length, 5);
    const v = validateCandidate("PART_ONE", set, buildContext(input).guide.marks.partOne);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("openai provider: text exploration sets validate (5 skills, 7 marks)", async () => {
  const sets = await generateTextExplorationCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const set of sets) {
    assert.equal(set.length, 5);
    const v = validateCandidate("TEXT_EXPLORATION", set, buildContext(input).guide.marks.textExploration);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("openai provider: writing sets validate (guided keywords, free without)", async () => {
  const sets = await generateWritingCandidates(buildContext(input));
  assert.equal(sets.length, 3);
  for (const pair of sets) {
    assert.equal(pair.guided.kind, "GUIDED");
    assert.ok(pair.guided.keywords?.includes("/"));
    assert.equal(pair.free.kind, "FREE");
    assert.equal(pair.free.keywords, undefined);
    const v = validateCandidate("WRITING", pair);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("openai provider: rewrite candidates flow through the stub and validate", async () => {
  const base = await generateTextCandidates(buildContext(input));
  const rewritten = await generateRewriteCandidates(buildContext(input), {
    text: base[0].text,
    title: base[0].title,
    target: "simpler",
  });
  assert.equal(rewritten.length, 3);
  for (const c of rewritten) {
    assert.ok(c.text.length > 50);
    const v = validateCandidate("TEXT", c);
    assert.ok(v.ok, v.issues.join("; "));
  }
});

test("openai provider: missing API key fails with a clear error", async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(() => generateTextCandidates(buildContext(input)), /OPENAI_API_KEY/);
  process.env.OPENAI_API_KEY = key;
});

test("openai provider: all five generation types reached the stub", () => {
  assert.ok(requests >= 5, "expected >= 5 stub requests, got " + requests);
});
