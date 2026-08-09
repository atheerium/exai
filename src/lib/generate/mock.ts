// Deterministic "mock" generation provider.
//
// Produces structurally valid, level-appropriate exam content from the theme
// corpus and the guide rules, without any external API. It is the default
// provider so the whole product works end-to-end offline; swap AI_PROVIDER in
// the environment to route through a real model (see index.ts).

import { getTheme, type Theme } from "@/data/themes";
import type { Guide } from "@/data/guides";
import { countWords, Seeded } from "./rng";
import type { GeneratedTask, GeneratedText, GeneratedTopic } from "@/types";

export interface MockContext {
  grade: string;
  unit: string;
  topic: string;
  length: number;
  guide: Guide;
  themeKey: string;
  seed: string;
}

// ---------------------------------------------------------------------------
// Passage assembly
// ---------------------------------------------------------------------------

export function generateText(ctx: MockContext, variant = 0): GeneratedText {
  const theme = getTheme(ctx.themeKey);
  const rng = new Seeded(ctx.seed + `:text:${variant}`);
  const topic = ctx.topic;

  const body = rng.shuffle(theme.body);
  const sentences: string[] = [...rng.take(theme.lead, 2)];
  sentences.push(...body.slice(0, 8));
  if (ctx.length >= 200) {
    const detail = rng.take(theme.detail, 5);
    const insertAt = 2 + Math.floor(8 / 2);
    sentences.splice(insertAt, 0, ...detail);
  }
  sentences.push(...rng.take(theme.conclusion, 2));

  let text = sentences.map((s) => s.replace(/\{topic\}/g, topic.toLowerCase())).join(" ");
  // Pad with an extra body sentence if below target length.
  while (countWords(text) < ctx.length - 15) {
    const extra = body[rng.int(body.length)].replace(/\{topic\}/g, topic.toLowerCase());
    text += " " + extra;
  }

  const title = theme.title.replace(/\{topic\}/g, titleCaseTopic(topic));
  return { title, text, words: countWords(text) };
}

function titleCaseTopic(topic: string): string {
  return topic
    .split(" ")
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function textAlternatives(ctx: MockContext, count = 3): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const t = generateText(ctx, i);
    out.push({ title: t.title, text: t.text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Part One — reading comprehension
// ---------------------------------------------------------------------------

export function generatePartOne(ctx: MockContext, variant = 0): GeneratedTask[] {
  const theme = getTheme(ctx.themeKey);
  const rng = new Seeded(ctx.seed + `:p1:${variant}`);
  const rules = ctx.guide.partOne;
  const tasks: GeneratedTask[] = [];

  for (const rule of rules) {
    if (rule.family === "QUESTIONS") {
      const qs = rng.take(theme.questions, 2);
      tasks.push({
        skill: "READING",
        prompt: qs.map((q, i) => `${i + 1}. ${q.q}`).join("\n"),
        instruction: rule.instruction,
        answer: qs.map((q, i) => `${i + 1}. ${q.a}`).join("\n"),
        marks: rule.marks,
      });
    } else if (rule.family === "TRUE_FALSE") {
      const sts = rng.take(theme.trueFalse, 3);
      tasks.push({
        skill: "READING",
        prompt: sts.map((s, i) => `${i + 1}. ${s.statement}`).join("\n"),
        instruction: rule.instruction,
        answer: sts.map((s, i) => `${i + 1}. ${s.truth ? "True" : "False"}. ${s.justification}`).join("\n"),
        marks: rule.marks,
      });
    } else if (rule.family === "LEXIS_MEANING") {
      const pairs = rng.take(theme.lexisMeaning, 3);
      tasks.push({
        skill: "READING",
        prompt: pairs.map((p, i) => `${i + 1}. ${p.given}: .........`).join("\n"),
        instruction: rule.instruction,
        answer: pairs.map((p, i) => `${i + 1}. ${p.answer}`).join("\n"),
        marks: rule.marks,
      });
    } else if (rule.family === "LEXIS_OPPOSITE") {
      const pairs = rng.take(theme.lexisOpposite, 3);
      tasks.push({
        skill: "READING",
        prompt: pairs.map((p, i) => `${i + 1}. ${p.given}: .........`).join("\n"),
        instruction: rule.instruction,
        answer: pairs.map((p, i) => `${i + 1}. ${p.answer}`).join("\n"),
        marks: rule.marks,
      });
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Part Two — text exploration (B. Text exploration, 08 pts)
// ---------------------------------------------------------------------------

export function generateTextExploration(ctx: MockContext, variant = 0): GeneratedTask[] {
  const theme = getTheme(ctx.themeKey);
  const rng = new Seeded(ctx.seed + `:p2:${variant}`);
  const skills = ctx.guide.textExploration.skills;
  const tasks: GeneratedTask[] = [];

  for (const skillRule of skills) {
    if (skillRule.skill === "VOCABULARY") {
      const words = rng.take(theme.vocab.filter((v) => v.inText), 4);
      tasks.push({
        skill: "VOCABULARY",
        prompt: words
          .map((w, i) => {
            const target = w.word.replace(/s$/, "");
            return `${i + 1}. ${target.charAt(0).toUpperCase() + target.slice(1)} → ..........`;
          })
          .join("\n"),
        instruction: `Match each word with its definition. Choose from: ${words
          .map((w) => wordDef(theme, w.word))
          .join(", ")}.`,
        answer: words.map((w, i) => `${i + 1}. ${w.word} = ${wordDef(theme, w.word)}`).join("\n"),
        marks: skillRule.marks,
      });
    } else if (skillRule.skill === "MORPHOLOGY") {
      const words = rng.take(theme.vocab, 3);
      const rows = words.map((w) => {
        const col = w.family.noun ? "noun" : w.family.adjective ? "adjective" : w.family.verb ? "verb" : "adverb";
        const form = (w.family[col as keyof typeof w.family] ?? w.word) as string;
        return { base: w.word.replace(/s$/, ""), form, col };
      });
      tasks.push({
        skill: "MORPHOLOGY",
        prompt: rows.map((r, i) => `${i + 1}. "${r.base}" → (${r.col}) ..........`).join("\n"),
        instruction: skillRule.instruction,
        answer: rows.map((r, i) => `${i + 1}. ${r.form}`).join("\n"),
        marks: skillRule.marks,
      });
    } else if (skillRule.skill === "PHONOLOGY") {
      const useEd = rng.next() > 0.5;
      if (useEd) {
        const words = rng.take(theme.vocab.filter((v) => v.finalEd), 5);
        const groups = ["/t/", "/d/", "/ɪd/"] as const;
        const map: Record<string, string> = { t: "/t/", d: "/d/", id: "/ɪd/" };
        tasks.push({
          skill: "PHONOLOGY",
          prompt: `Classify the following words according to the pronunciation of the final "-ed".\n${words
            .map((w) => w.edWord ?? w.word)
            .join(" — ")}\n${groups.join(" | ")}`,
          instruction: skillRule.instruction,
          answer: groups
            .map((g) => `${g}: ${words.filter((w) => map[w.finalEd!] === g).map((w) => w.edWord ?? w.word).join(", ")}`)
            .filter((s) => !s.endsWith(": "))
            .join("\n"),
          marks: skillRule.marks,
        });
      } else {
        const words = rng.take(theme.vocab.filter((v) => v.word.endsWith("s") || v.word.endsWith("z")), 4).map((v) => v.word);
        const list = words.length >= 4 ? words : theme.vocab.slice(0, 4).map((v) => v.word);
        const groups = ["/s/", "/z/", "/ɪz/"] as const;
        const map: Record<string, string> = { s: "/s/", z: "/z/", iz: "/ɪz/" };
        const classified = theme.vocab
          .filter((v) => list.includes(v.word))
          .map((v) => ({ word: v.word, pron: map[v.finalS] }));
        tasks.push({
          skill: "PHONOLOGY",
          prompt: `Classify the following words according to the pronunciation of the final "-s".\n${list.join(" — ")}\n${groups.join(" | ")}`,
          instruction: skillRule.instruction,
          answer: groups
            .map((g) => `${g}: ${classified.filter((c) => c.pron === g).map((c) => c.word).join(", ")}`)
            .filter((s) => !s.endsWith(": "))
            .join("\n"),
          marks: skillRule.marks,
        });
      }
    } else if (skillRule.skill === "GRAMMAR") {
      const exs = rng.take(theme.grammar, 2);
      tasks.push({
        skill: "GRAMMAR",
        prompt: exs.map((e, i) => `${i + 1}. ${e.sentence}`).join("\n"),
        instruction: skillRule.instruction,
        answer: exs.map((e, i) => `${i + 1}. ${e.rewritten} (${e.note})`).join("\n"),
        marks: skillRule.marks,
      });
    } else if (skillRule.skill === "DISCOURSE") {
      const d = theme.discourse;
      tasks.push({
        skill: "DISCOURSE",
        prompt: d.text,
        instruction: skillRule.instruction,
        answer: d.options.filter((o) => d.answers.includes(o)).join(", "),
        marks: skillRule.marks,
      });
    }
  }
  return tasks;
}

function wordDef(theme: Theme, word: string): string {
  const v = theme.vocab.find((x) => x.word === word);
  if (!v) return "the word " + word;
  const noun = v.family.noun ?? v.family.adjective ?? v.word;
  if (v.family.noun && v.family.adjective) {
    return `the ${v.family.adjective} quality of being ${v.family.noun}`;
  }
  return noun;
}

// ---------------------------------------------------------------------------
// Written expression — guided + free topics
// ---------------------------------------------------------------------------

export function generateWriting(ctx: MockContext, variant = 0): { guided: GeneratedTopic; free: GeneratedTopic } {
  const theme = getTheme(ctx.themeKey);
  const rng = new Seeded(ctx.seed + `:w:${variant}`);
  const w = ctx.guide.writing;
  const form = rng.pick(w.forms);
  const topic = ctx.topic.toLowerCase();

  const keyVocab = theme.vocab
    .map((v) => v.family.noun ?? v.family.verb ?? v.family.adjective ?? v.word)
    .filter((w2) => w2.length > 3)
    .slice(0, 3);
  const keywords = (keyVocab.length >= 3 ? keyVocab : ["importance", "habits", "future"]).join("/");

  const guided: GeneratedTopic = {
    kind: "GUIDED",
    title: "Topic 1",
    situation: `Your school magazine is preparing a special issue about ${topic}. You have been asked to write ${form} explaining why ${topic} matters for young people.`,
    instruction: w.guidedInstruction.replace("on the following topic, using the notes given.", "about the situation above, using the following notes."),
    keywords,
    form,
    marks: w.marks,
  };

  const freeForms = ["an opinion paragraph", "a short article", "a letter to a friend", "a speech"];
  const freeForm = rng.pick(freeForms);
  const free: GeneratedTopic = {
    kind: "FREE",
    title: "Topic 2",
    situation: `In the coming years, ${topic} will play an even bigger role in our lives. Some people are excited about this change; others are worried.`,
    instruction: w.freeInstruction.replace("on the following topic.", "on the situation above, giving your opinion and examples."),
    form: freeForm,
    marks: w.marks,
  };

  return { guided, free };
}

// ---------------------------------------------------------------------------
// Alternatives for tasks and topics
// ---------------------------------------------------------------------------

export function taskAlternatives(ctx: MockContext, kind: "PART_ONE" | "TEXT_EXPLORATION", count = 3): GeneratedTask[][] {
  const sets: GeneratedTask[][] = [];
  for (let v = 1; v <= count; v++) {
    sets.push(kind === "PART_ONE" ? generatePartOne(ctx, v) : generateTextExploration(ctx, v));
  }
  return sets;
}

export function topicAlternatives(ctx: MockContext, count = 3): { guided: GeneratedTopic; free: GeneratedTopic }[] {
  const out: { guided: GeneratedTopic; free: GeneratedTopic }[] = [];
  for (let v = 1; v <= count; v++) {
    out.push(generateWriting(ctx, v));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Facade entry points (same shape as the OpenAI provider, PRD 15.3)
// ---------------------------------------------------------------------------

export function generateTextCandidates(ctx: MockContext): { title: string; text: string }[] {
  return [generateText(ctx, 0), ...textAlternatives(ctx, 2)];
}

export function generatePartOneCandidates(ctx: MockContext): GeneratedTask[][] {
  return [generatePartOne(ctx, 0), ...taskAlternatives(ctx, "PART_ONE", 2)];
}

export function generateTextExplorationCandidates(ctx: MockContext): GeneratedTask[][] {
  return [generateTextExploration(ctx, 0), ...taskAlternatives(ctx, "TEXT_EXPLORATION", 2)];
}

export function generateWritingCandidates(ctx: MockContext): { guided: GeneratedTopic; free: GeneratedTopic }[] {
  return [generateWriting(ctx, 0), ...topicAlternatives(ctx, 2)];
}

// Re-exported helper for the dispatch layer
export { countWords };
