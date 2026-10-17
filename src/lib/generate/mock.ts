// Deterministic "mock" generation provider.
//
// Produces structurally valid, level-appropriate exam content from the theme
// corpus and the guide rules, without any external API. It is the default
// provider so the whole product works end-to-end offline; swap AI_PROVIDER in
// the environment to route through a real model (see index.ts).

import { getTheme, type Theme } from "@/data/themes";
import type { Guide, PartOneRule, SkillRule } from "@/data/guides";
import { countWords, Seeded } from "./rng";
import { candidateCount } from "./candidates";
import { pickReferents } from "./referents";
import { occursInPassage, passageVocabulary } from "./grounding";
import {
  DERIVATION_EXAMPLE,
  DERIVATION_HEADERS,
  PHONOLOGY_GROUPS,
  officialTable,
  rulePrescribesTable,
  taskHasTable,
} from "@/lib/export/tables";
import type { GeneratedSource, GeneratedTask, GeneratedText, GeneratedTextCandidate, GeneratedTopic } from "@/types";

export interface MockContext {
  grade: string;
  unit: string;
  topic: string;
  length: number;
  guide: Guide;
  themeKey: string;
  seed: string;
  teacherKeywords?: string | null;
  difficulty?: string | null;
  /** Passage paragraphs, 3 or 4 (teacher choice, default 3). */
  paragraphCount?: number;
  /**
   * The passage already generated for this exam, when the caller has one.
   *
   * With it, task material is drawn from the printed text rather than the
   * theme corpus, so vocabulary and referent items are answerable from the
   * page. Absent it (per-part generation) the generators fall back to the
   * theme corpus exactly as before.
   */
  groundingText?: string | null;
}

// ---------------------------------------------------------------------------
// Passage assembly
// ---------------------------------------------------------------------------

const MIN_PARAGRAPHS = 3;
const MAX_PARAGRAPHS = 5;
const SENTENCES_PER_PARAGRAPH = 3;

/**
 * Assemble sentences into `wantedCount` paragraphs.
 *
 * `wantedCount` is the teacher's explicit choice and is honoured EXACTLY when
 * there are enough sentences to fill it: a 4-paragraph passage when 3 was asked
 * for is a different artefact, not a near miss, and validateCandidate rejects
 * it. Fewer sentences than paragraphs is the only case that cannot be honoured,
 * and there it returns what it can rather than padding with filler.
 *
 * SENTENCES ARE DISTRIBUTED EVENLY, not chunked by a fixed stride. Chunking by
 * `ceil(n / wanted)` silently under-delivers: 9 sentences at 3 per paragraph is
 * 3 paragraphs, not the 4 that were asked for. The remainder is spread one
 * sentence at a time across the leading paragraphs instead.
 */
export function toParagraphs(sentences: string[], wantedCount?: number): string {
  if (wantedCount === undefined && sentences.length <= MIN_PARAGRAPHS) return sentences.join(" ");
  const wanted =
    wantedCount ??
    Math.min(
      MAX_PARAGRAPHS,
      Math.max(MIN_PARAGRAPHS, Math.round(sentences.length / SENTENCES_PER_PARAGRAPH))
    );
  return splitEvenly(sentences, wanted).join("\n\n");
}

/** Split into exactly `count` non-empty groups, spreading any remainder evenly. */
function splitEvenly(sentences: string[], count: number): string[] {
  const groups = Math.max(1, Math.min(count, sentences.length));
  const base = Math.floor(sentences.length / groups);
  const remainder = sentences.length % groups;
  const out: string[] = [];
  let i = 0;
  for (let g = 0; g < groups; g++) {
    const size = base + (g < remainder ? 1 : 0);
    out.push(sentences.slice(i, i + size).join(" "));
    i += size;
  }
  return out;
}

export function splitParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [text];
}

export function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/);
}

export function splitLongSentences(sentences: string[]): string[] {
  return sentences.flatMap((s) => {
    const parts = s.split(", ");
    if (parts.length > 2) {
      const head = parts[0].replace(/[.,;:]$/, "") + ".";
      const tail = parts.slice(1).join(", ");
      return [head, tail.charAt(0).toUpperCase() + tail.slice(1)];
    }
    return [s];
  });
}

const PLAIN_CONNECTIVES: [RegExp, string][] = [
  [/\bhowever\b/gi, "but"],
  [/\btherefore\b/gi, "so"],
  [/\bmoreover\b/gi, "also"],
  [/\bnevertheless\b/gi, "still"],
];

const ADVANCED_CONNECTIVES: [RegExp, string][] = [
  [/\bbut\b/g, "however"],
  [/\bso\b/g, "therefore"],
  [/\balso\b/g, "moreover"],
];

function substitute(sentence: string, pairs: [RegExp, string][]): string {
  return pairs.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), sentence);
}

export function normaliseDifficulty(difficulty?: string | null): "standard" | "harder" | "simpler" {
  const value = (difficulty ?? "").trim().toLowerCase();
  if (value === "harder") return "harder";
  if (value === "simpler") return "simpler";
  return "standard";
}

interface PassagePart {
  text: string;
  keep: boolean;
}

function applyDifficulty(
  parts: PassagePart[],
  difficulty: "standard" | "harder" | "simpler",
  extraDetail: string[]
): PassagePart[] {
  if (difficulty === "simpler") {
    return parts.flatMap((p) =>
      splitLongSentences([p.text]).map((t) => ({ text: substitute(t, PLAIN_CONNECTIVES), keep: p.keep }))
    );
  }
  if (difficulty === "harder") {
    const harder = parts.map((p) => ({ ...p, text: substitute(p.text, ADVANCED_CONNECTIVES) }));
    const insertAt = Math.max(1, harder.length - 1);
    harder.splice(insertAt, 0, ...extraDetail.map((text) => ({ text, keep: false })));
    return harder;
  }
  return parts;
}

export function mockSource(ctx: MockContext): GeneratedSource {
  return {
    title: "Exai original passage",
    author: null,
    publication: null,
    url: null,
    adaptationNote: `Original passage generated by Exai from the "${ctx.unit}" theme corpus. No external source was used for this draft.`,
    isExternal: false,
  };
}

export function generateText(ctx: MockContext, variant = 0): GeneratedText {
  const theme = getTheme(ctx.themeKey);
  const rng = new Seeded(ctx.seed + `:text:${variant}`);
  const topic = ctx.topic;
  const fill = (s: string) => s.replace(/\{topic\}/g, topic.toLowerCase());

  const body = rng.shuffle(theme.body);
  // Lead and conclusion carry the passage arc; the rest is droppable so the
  // assembly can be trimmed to the requested length band.
  const parts: PassagePart[] = [...rng.take(theme.lead, 2)].map((text) => ({ text, keep: true }));
  parts.push(...body.slice(0, 8).map((text) => ({ text, keep: false })));
  if (ctx.length >= 200) {
    const detail = rng.take(theme.detail, 5);
    const insertAt = 2 + Math.floor(8 / 2);
    parts.splice(insertAt, 0, ...detail.map((text) => ({ text, keep: false })));
  }
  parts.push(...rng.take(theme.conclusion, 2).map((text) => ({ text, keep: true })));

  // When teacherKeywords are provided, weave keyword-derived sentences into the passage.
  if (ctx.teacherKeywords && ctx.teacherKeywords.trim()) {
    const keywords = ctx.teacherKeywords.split(/[,;/]/).map((k) => k.trim()).filter(Boolean);
    if (keywords.length > 0) {
      const keywordSentences = keywords.map(
        (kw) => `One important aspect is ${kw.toLowerCase()}, which plays a key role in daily life.`
      );
      // Insert keyword sentences after the lead sentences, mixed into the body
      const insertPos = 2 + Math.min(3, Math.floor(body.length / 2));
      parts.splice(
        insertPos,
        0,
        ...rng.take(keywordSentences, Math.min(keywords.length, 2)).map((text) => ({ text, keep: false }))
      );
    }
  }

  const difficulty = normaliseDifficulty(ctx.difficulty);
  const extraDetail = difficulty === "harder" ? rng.take(theme.detail, 2) : [];
  const resolved = applyDifficulty(parts, difficulty, extraDetail);
  const wordCount = () => countWords(resolved.map((p) => fill(p.text)).join(" "));

  // validateCandidate() (src/lib/generate/index.ts) rejects anything outside
  // the guide's ±20% length band, so trim to fit before the teacher sees it.
  //
  // The budget must leave room for the topic anchors added in
  // `anchorParagraphs`, which run AFTER this trim. Counting them up front is
  // what keeps the passage inside the band: trimming to exactly the ceiling and
  // then appending ~10 words per unanchored paragraph pushed it over by ~14.
  const anchorReserve = countAnchorWords(resolved.map((p) => fill(p.text)), topic, ctx.paragraphCount);
  const maxWords = Math.ceil(ctx.length * 1.2) - anchorReserve;
  for (let i = resolved.length - 1; i >= 0 && wordCount() > maxWords; i--) {
    if (!resolved[i].keep) resolved.splice(i, 1);
  }

  // Pad with an extra body sentence if below target length. A padded sentence can
  // only add an anchor, never remove one, so the reserve stays valid.
  while (wordCount() < ctx.length - 15) {
    resolved.push({ text: body[rng.int(body.length)], keep: false });
  }

  const sentences = resolved.map((p) => fill(p.text));
  const text = anchorParagraphs(sentences, topic, ctx.paragraphCount);
  const title = theme.title.replace(/\{topic\}/g, titleCaseTopic(topic));
  return { title, text, words: countWords(text), source: mockSource(ctx) };
}

/**
 * How many words the topic anchors will add to a passage built from `sentences`.
 *
 * Measured, not estimated from the longest template: each paragraph is checked
 * for the phrase and only the ones without it contribute, so the trim reserves
 * exactly what will be appended. Over-reserving is harmless (the passage is
 * merely shorter); under-reserving pushes it outside the ±20% band.
 */
function countAnchorWords(sentences: string[], topic: string, wantedCount?: number): number {
  const needle = topic.toLocaleLowerCase().trim();
  if (!needle) return 0;
  const paragraphs = toParagraphs(sentences, wantedCount).split(/\n{2,}/).filter(Boolean);
  return paragraphs.filter((p) => !p.toLocaleLowerCase().includes(needle)).length * ANCHOR_WORD_BUDGET;
}

/** Generous per-anchor cost: template wording plus the topic phrase itself. */
const ANCHOR_WORD_BUDGET = 12;

/**
 * Assemble the passage and name the topic in every paragraph that would drift.
 *
 * The theme corpus is topic-neutral by design — `lead` carries the `{topic}`
 * slot and `body`/`detail`/`conclusion` are generic sentences that read well
 * under any title. That is fine for a corpus and wrong for a passage: the
 * validator (and the real provider's prompt, and the reported bug this fixes)
 * require every paragraph to stay on its topic, and three of four paragraphs
 * were previously topic-free.
 *
 * `checkTopicAnchoring` in grounding.ts uses word-boundary phrase containment,
 * so the whole phrase must appear, not a prefix of it.
 */
function anchorParagraphs(sentences: string[], topic: string, wantedCount?: number): string {
  const needle = topic.toLocaleLowerCase().trim();
  const paragraphs = toParagraphs(sentences, wantedCount)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!needle) return paragraphs.join("\n\n");

  return paragraphs
    .map((paragraph, i) => {
      if (paragraph.toLocaleLowerCase().includes(needle)) return paragraph;
      // First and last keep the lead-in / lead-out shape; a middle paragraph gets
      // a connecting clause, which is what the "one aspect per paragraph" arc wants.
      if (i === 0) {
        return `When people talk about ${needle}, ${paragraph.charAt(0).toLocaleLowerCase()}${paragraph.slice(1)}`;
      }
      if (i === paragraphs.length - 1) return `${paragraph} That is why ${needle} matters.`;
      return `${paragraph} The same point shapes ${needle} in practice.`;
    })
    .join("\n\n");
}

function titleCaseTopic(topic: string): string {
  return topic
    .split(" ")
    .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function textAlternatives(ctx: MockContext, count = 3): GeneratedTextCandidate[] {
  const out: GeneratedTextCandidate[] = [];
  for (let i = 1; i <= count; i++) {
    const t = generateText(ctx, i);
    out.push({ title: t.title, text: t.text, source: t.source });
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
    if (variant === 0) {
      // Primary set: use today's families exactly
      tasks.push(generatePartOnePrimary(rule, theme, rng, ctx));
    } else {
      // Alternatives: use genuinely different task types with same marks
      tasks.push(generatePartOneAlternate(rule, theme, rng, variant));
    }
  }
  return tasks;
}

function generatePartOnePrimary(
  rule: PartOneRule,
  theme: ReturnType<typeof getTheme>,
  rng: Seeded,
  ctx?: MockContext
): GeneratedTask {
  const itemCount = rule.itemCount ?? rule.constraints?.maxStatements ?? rule.constraints?.maxQuestions ?? rule.constraints?.maxIdeas ?? rule.constraints?.maxWords ?? 4;
  const instruction = rule.exactWording ?? rule.instruction;
  // Tables are allowlisted by section and skill (user instruction, 2026-10-11):
// Part A never carries one. The guide flag is deliberately ignored here so a
// legacy `tableRequired: true` on a Part One rule cannot reintroduce a chart the
// official paper does not have.
const needsTable = taskHasTable("PART_ONE", { family: rule.family });

  if (rule.family === "QUESTIONS") {
    const qs = rng.take(theme.questions, itemCount);
    return {
      skill: "READING",
      family: "QUESTIONS",
      prompt: qs.map((q, i) => `${i + 1}. ${q.q}`).join("\n"),
      instruction,
      answer: qs.map((q, i) => `${i + 1}. ${q.a}`).join("\n"),
      marks: rule.marks,
    };
  } else if (rule.family === "TRUE_FALSE") {
    const sts = rng.take(theme.trueFalse, itemCount);
    const task: GeneratedTask = {
      skill: "READING",
      family: "TRUE_FALSE",
      prompt: sts.map((s, i) => `${i + 1}. ${s.statement}`).join("\n"),
      instruction,
      answer: sts.map((s, i) => `${i + 1}. ${s.truth ? "True" : "False"}. ${s.justification}`).join("\n"),
      marks: rule.marks,
    };
    if (needsTable) {
      task.table = {
        headers: ["Statement", "Answer"],
        // The answer column stays empty: students write True/False themselves.
        rows: sts.map((s) => [s.statement, ""]),
      };
    }
    return task;
  } else if (rule.family === "PARAGRAPH_ID") {
    const ideas = rng.take([
      "People learn to cooperate and build trust through friendship.",
      "Forgiveness is essential for keeping relationships healthy.",
      "Teachers encourage teamwork because it builds patience.",
      "Modern technology helps friends stay in touch across distances.",
    ], itemCount);
    const task: GeneratedTask = {
      skill: "READING",
      family: "PARAGRAPH_ID",
      prompt: `Read the text and match each idea with the paragraph where it is mentioned.\n${ideas.map((idea, i) => `${String.fromCharCode(65 + i)}. ${idea}`).join("\n")}`,
      instruction,
      answer: ideas.map((idea, i) => `${String.fromCharCode(65 + i)}. Paragraph ${rng.int(5) + 1}`).join("\n"),
      marks: rule.marks,
    };
    if (needsTable) {
      task.table = {
        headers: ["Idea", "Paragraph"],
        // Paragraph numbers are the answer key, so the cell is left blank.
        rows: ideas.map((idea) => [idea, ""]),
      };
    }
    return task;
  } else if (rule.family === "COHESIVE_MARKERS") {
    // Targets must be referents with a noun antecedent (they, it, which, ...),
    // never content words, so draw them from the passage itself. Prefer the
    // grounding text: it is the passage the teacher will actually print, so the
    // underlined words are guaranteed to appear on the page.
    const groundingText = ctx?.groundingText ?? null;
    const fromPassage = groundingText ? pickReferents(groundingText, itemCount) : [];
    // A passage with no usable referent must not produce an empty item, so fall
    // back to the theme corpus. The family is preserved either way: switching it
    // would break the guide's exactWording check.
    const targets = fromPassage.length > 0 ? fromPassage : pickReferents(themeBody(theme), itemCount);
    if (targets.length === 0) {
      throw new Error("No referent could be derived for the cohesive-markers task.");
    }
    const task: GeneratedTask = {
      skill: "READING",
      family: "COHESIVE_MARKERS",
      prompt: `Who or what do the underlined words refer to in the text?\n${targets.map((w, i) => `${i + 1}. "${capitalise(w)}" (underlined)`).join("\n")}`,
      instruction,
      answer: targets.map((w, i) => `${i + 1}. ${w}`).join("\n"),
      marks: rule.marks,
    };
    if (needsTable) {
      task.table = {
        headers: ["Word", "Refers to"],
        rows: targets.map((w) => [w, ""]),
      };
    }
    return task;
  } else {
    const titles = rng.shuffle(["The Importance of Friendship", "Building Strong Relationships", "Why Friends Matter", "Connections That Last"]);
    return {
      skill: "READING",
      family: "TITLE_OR_IDEA",
      prompt: "Give a title to the text / Choose the general idea of the text.",
      instruction,
      answer: titles[0],
      marks: rule.marks,
    };
  }
}

function generatePartOneAlternate(rule: PartOneRule, theme: ReturnType<typeof getTheme>, rng: Seeded, variant: number): GeneratedTask {
  const altType = variant % 2; // alternates between two alternate types

  if (rule.family === "TRUE_FALSE") {
    // Alternate: YES_NO_NOT_GIVEN — same marks, different format
    const max = rule.constraints?.maxStatements ?? 4;
    const sts = rng.take(theme.trueFalse, max);
    return {
      skill: "READING",
      family: "YES_NO_NOT_GIVEN",
      prompt: sts.map((s, i) => `${i + 1}. ${s.statement}`).join("\n"),
      instruction: "Are the following statements True, False, or Not Given according to the text? Write T, F, or NG next to each statement.",
      answer: sts.map((s, i) => `${i + 1}. ${s.truth ? "True" : "False"}. ${s.justification}`).join("\n"),
      marks: rule.marks,
    };
  } else if (rule.family === "QUESTIONS") {
    if (altType === 0) {
      // Alternate 1: MCQ — multiple choice A/B/C
      const max = rule.constraints?.maxQuestions ?? 3;
      const qs = rng.take(theme.questions, max);
      const distractors = ["This information is not mentioned in the text.", "The text states the opposite.", "This is only partially correct."];
      return {
        skill: "READING",
        family: "MCQ",
        prompt: qs.map((q, i) => {
          const options = rng.shuffle([q.a, ...rng.take(distractors, 2)]);
          return `${i + 1}. ${q.q}\n   A. ${options[0]}\n   B. ${options[1]}\n   C. ${options[2]}`;
        }).join("\n"),
        instruction: "Choose the correct answer (A, B, or C) for each question.",
        answer: qs.map((q, i) => `${i + 1}. A`).join("\n"),
        marks: rule.marks,
      };
    } else {
      // Alternate 2: FILL_CHART — complete a table
      const max = rule.constraints?.maxQuestions ?? 3;
      const qs = rng.take(theme.questions, max);
      return {
        skill: "READING",
        family: "FILL_CHART",
        prompt: "Complete the table below based on the text.\n" + qs.map((q, i) => `${i + 1}. ${q.q} → ..........`).join("\n"),
        instruction: "Fill in the chart with information from the text.",
        answer: qs.map((q, i) => `${i + 1}. ${q.a}`).join("\n"),
        marks: rule.marks,
        table: {
          headers: ["Question", "Answer"],
          rows: qs.map((q) => [q.q, ""]),
        },
      };
    }
  } else if (rule.family === "PARAGRAPH_ID") {
    if (altType === 0) {
      // Alternate 1: MATCHING — match statements to paragraphs
      const max = rule.constraints?.maxIdeas ?? 4;
      const ideas = rng.take([
        "People learn to cooperate and build trust through friendship.",
        "Forgiveness is essential for keeping relationships healthy.",
        "Teachers encourage teamwork because it builds patience.",
        "Modern technology helps friends stay in touch across distances.",
      ], max);
      const paragraphs = ["A. Paragraph 1", "B. Paragraph 2", "C. Paragraph 3", "D. Paragraph 4", "E. Paragraph 5"];
      const shuffled = rng.shuffle(paragraphs);
      return {
        skill: "READING",
        family: "MATCHING",
        prompt: `Match each statement with the correct paragraph.\nStatements:\n${ideas.map((idea, i) => `${i + 1}. ${idea}`).join("\n")}\n\nParagraphs:\n${shuffled.join("\n")}`,
        instruction: "Match each statement (1-" + ideas.length + ") with the correct paragraph (A-E).",
        answer: ideas.map((idea, i) => `${i + 1}. ${shuffled[rng.int(shuffled.length)]}`).join("\n"),
        marks: rule.marks,
      };
    } else {
      // Alternate 2: ORDERING — put events/ideas in logical order
      const max = rule.constraints?.maxIdeas ?? 4;
      const ideas = rng.take([
        "People learn to cooperate and build trust through friendship.",
        "Forgiveness is essential for keeping relationships healthy.",
        "Teachers encourage teamwork because it builds patience.",
        "Modern technology helps friends stay in touch across distances.",
      ], max);
      return {
        skill: "READING",
        family: "ORDERING",
        prompt: `Put the following ideas in the order they appear in the text.\n${rng.shuffle(ideas).map((idea, i) => `${String.fromCharCode(65 + i)}. ${idea}`).join("\n")}`,
        instruction: "Number the ideas (1-" + ideas.length + ") in the order they appear in the text.",
        answer: ideas.map((idea, i) => `${i + 1}. ${idea}`).join("\n"),
        marks: rule.marks,
      };
    }
  } else if (rule.family === "COHESIVE_MARKERS") {
    // Alternate: FILL_CHART — who/what do words refer to, presented as a chart
    const max = rule.constraints?.maxWords ?? 3;
    const targets = pickReferents(themeBody(theme), max);
    return {
      skill: "READING",
      family: "FILL_CHART",
      prompt: `Complete the table showing what each underlined word refers to.\n${targets.map((w, i) => `${i + 1}. "${capitalise(w)}" (underlined)`).join("\n")}`,
      instruction: "Fill in the chart to show who or what each underlined word refers to.",
      answer: targets.map((w, i) => `${i + 1}. ${w}`).join("\n"),
      marks: rule.marks,
      table: {
        headers: ["Word", "Refers to"],
        rows: targets.map((w) => [w, ""]),
      },
    };
  } else {
    // TITLE_OR_IDEA alternate: ORDERING — put paragraphs in logical order
    return {
      skill: "READING",
      family: "ORDERING",
      prompt: "Put the following paragraph summaries in the order they appear in the text.\nA. The introduction presents the topic.\nB. Examples and details support the main idea.\nC. The conclusion summarises the key points.",
      instruction: "Number the summaries (1-3) in the correct order.",
      answer: "1. A, 2. B, 3. C",
      marks: rule.marks,
    };
  }
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
    if (variant === 0) {
      tasks.push(generateTextExplorationPrimary(skillRule, theme, rng, ctx.groundingText));
    } else {
      tasks.push(generateTextExplorationAlternate(skillRule, theme, rng, variant));
    }
  }
  return tasks;
}

/**
 * Vocabulary/morphology targets for a task, taken from the passage when one is
 * available and from the theme corpus otherwise.
 *
 * The fallback is reported rather than silent: `deriveVocabTargets` returns
 * null when the passage cannot supply enough words, and the caller falls back
 * to the corpus so generation degrades instead of crashing. The caller surfaces
 * this as a validation issue (see `generateTextExplorationGroundingIssues`) so a
 * teacher is told the exam is theme-level rather than passage-grounded.
 */
/**
 * Vocabulary targets for a grounded task.
 *
 * Every target occurs in the passage, so the item is answerable from the page.
 * Corpus words that appear in the passage are preferred because the corpus also
 * supplies their definition, giving a real answer key. The passage pool is much
 * larger than the corpus (61 vs 7 in practice), so when the corpus cannot fill
 * the item the remainder is topped up with other passage content words — and
 * those are marked in the answer key as teacher-supplied rather than given a
 * fake definition. An answer key that restates the question teaches nothing; an
 * acknowledged gap is actionable.
 */
function deriveGroundedVocab(
  passage: string,
  needed: number,
  rng: Seeded,
  theme: ReturnType<typeof getTheme>
): { word: string; definition: string | null }[] {
  const known = rng.shuffle(theme.vocab.filter((v) => occursInPassage(passage, v.word)));
  const out: { word: string; definition: string | null }[] = known.map((v) => ({
    word: v.word,
    definition: wordDef(theme, v.word),
  }));

  if (out.length < needed) {
    const taken = new Set(out.map((o) => o.word));
    const extras = passageVocabulary(passage, 60)
      .map((v) => v.word)
      .filter((w) => !taken.has(w));
    for (const w of rng.shuffle(extras)) {
      if (out.length >= needed) break;
      out.push({ word: w, definition: null });
    }
  }
  return out.slice(0, Math.max(needed, out.length));
}

/**
 * Word-family targets for a grounded morphology row. Only corpus words carry a
 * family, so this cannot be topped up from the passage; the row count follows
 * what the passage actually supports. `itemCount` is unprescribed for this
 * skill in every guide (verified), so a shorter row is still valid.
 *
 * Returns null only when the passage shares no corpus word at all, which the
 * caller reports as a clear failure: a corpus-only task could not pass
 * `checkTaskLinkage`, so falling back would just become an opaque 422 later.
 */
function deriveGroundedMorphology(
  passage: string,
  wanted: number,
  rng: Seeded,
  theme: ReturnType<typeof getTheme>
) {
  const known = theme.vocab.filter((v) => occursInPassage(passage, v.word));
  if (known.length === 0) return null;
  return rng.shuffle(known).slice(0, Math.min(wanted, known.length));
}

function generateTextExplorationPrimary(
  skillRule: SkillRule,
  theme: ReturnType<typeof getTheme>,
  rng: Seeded,
  groundingText?: string | null
): GeneratedTask {
  if (skillRule.skill === "VOCABULARY") {
    // Grounded path: targets are unit words the student can actually find in the
    // passage, so the definition is answerable from the page and the answer key
    // is a real definition rather than a restatement of the prompt.
    if (groundingText) {
      const words = deriveGroundedVocab(groundingText, 4, rng, theme);
      const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
      const task: GeneratedTask = {
        skill: "VOCABULARY",
        prompt: words
          .map((w, i) => `${i + 1}. ${cap(w.word.replace(/s$/, ""))} → ..........`)
          .join("\n"),
        instruction: `Find the meaning of each of the following words as they are used in the text. ${words
          .map((w, i) => `${i + 1}) ${w.word}:`)
          .join("  ")}`,
        // A known corpus word gets its real definition. A passage-only word has
        // none to give, so say so instead of inventing one.
        answer: words
          .map((w, i) => `${i + 1}. ${w.word} = ${w.definition ?? "(supply the meaning as used in the text)"}`)
          .join("\n"),
        marks: skillRule.marks,
      };
      if (rulePrescribesTable(skillRule)) {
        task.table = {
          headers: ["Word (in the text)", "Meaning"],
          // The meaning IS the answer — never prefill it.
          rows: words.map((w) => [w.word, ""]),
        };
      }
      return task;
    }

    const words = rng.take(theme.vocab, 4);
    const task: GeneratedTask = {
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
    };
    if (rulePrescribesTable(skillRule)) {
      task.table = {
        headers: ["Word", "Meaning"],
        // The definition IS the answer for this matching task — never prefill it.
        rows: words.map((w) => [w.word, ""]),
      };
    }
    return task;
  } else if (skillRule.skill === "MORPHOLOGY") {
    // The official chart is built by `officialTable` in `export/tables.ts`, the
    // same function the live providers stamp with. The mock must honour the same
    // contract as the real providers, or every test that exercises a validator
    // rule through it silently stops covering that rule (AGENTS.md).
    //
    // Same intersection as VOCABULARY: the base word must be findable in the
    // passage, and the corpus must supply its word family so the answer key is
    // real instead of three dotted cells.
    const grounded = groundingText ? deriveGroundedMorphology(groundingText, 3, rng, theme) : null;
    if (groundingText && !grounded) {
      throw new Error(
        "Cannot ground the morphology task: the passage shares no word with the unit vocabulary, " +
          "so no word family can be drawn from it. Generate a different passage, or generate this section without passage grounding."
      );
    }
    const words = grounded ?? rng.take(theme.vocab, 3);

    /**
     * One target word per row. The word is always the corpus entry itself — never
     * one of its derived forms — because a derivation target has to occur in the
     * passage (`checkTaskLinkage`) and `deriveGroundedMorphology` hands back
     * passage words.
     *
     * It sits in the column matching the part of speech it actually is, so the
     * three columns get used as the corpus allows rather than on a fixed order
     * (user instruction, 2026-10-13). A word that is its own verb keeps the bare
     * form: "to respect" is not the word the passage contains.
     */
    const targets = words.map((w) => {
      const column = w.family.verb === w.word ? 0 : w.family.adjective === w.word ? 2 : 1;
      return { column, word: w.word, entry: w };
    });

    const given = targets.map((t) => {
      const row = ["", "", ""];
      row[t.column] = t.word;
      return row;
    });

    return {
      skill: "MORPHOLOGY",
      family: "WORD_FAMILY",
      // The words live in the table cells, so the prompt is only the numbering
      // the validator counts; `tabularTaskPrintsItems` stops the paper printing
      // it as lettered questions.
      prompt: targets.map((t, i) => `${i + 1}. "${t.word}" → ..........`).join("\n"),
      instruction: skillRule.instruction,
      answer: targets
        .map(
          (t, i) =>
            `${i + 1}. from "${t.word}": verb ${t.entry.family.verb ?? "—"}, noun ${t.entry.family.noun ?? "—"}, adjective ${
              t.entry.family.adjective ?? "—"
            }`
        )
        .join("\n"),
      marks: skillRule.marks,
      table: officialTable({
        skill: "MORPHOLOGY",
        instruction: skillRule.instruction,
        table: { headers: [...DERIVATION_HEADERS], rows: [[...DERIVATION_EXAMPLE], ...given] },
      }) ?? undefined,
    };
  } else if (skillRule.skill === "PHONOLOGY") {
    const useEd = rng.next() > 0.5;
    const build = (words: string[], groups: readonly string[], classify: (word: string) => string | undefined) => ({
      skill: "PHONOLOGY",
      family: "SOUND_CLASS",
      // The bank comes FIRST and in `List: [...]` form so `extractWordBank` finds
      // it: these words are printed centred under the instruction, and the table
      // below them is one empty box per sound group.
      prompt: `List: [${words.join(", ")}]\nClassify the following words according to the pronunciation of the final ${useEd ? "-ed" : "-s"}.`,
      instruction: skillRule.instruction,
      answer: groups
        .map((g) => `${g}: ${words.filter((w) => classify(w) === g).join(", ")}`)
        .filter((s) => !s.endsWith(": "))
        .join("\n"),
      marks: skillRule.marks,
      table: officialTable({
        skill: "PHONOLOGY",
        instruction: skillRule.instruction,
        table: { headers: [...groups], rows: [[...groups].map(() => "")] },
      }) ?? undefined,
    });

    if (useEd) {
      const edWords = rng.take(theme.vocab.filter((v) => v.finalEd), 4);
      const words = edWords.map((w) => w.edWord ?? w.word);
      const map: Record<string, string> = { t: "/t/", d: "/d/", id: "/ɪd/" };
      const index = new Map(edWords.map((w, i) => [w.edWord ?? w.word, map[w.finalEd ?? "t"] ?? "/t/"]));
      return build(words, PHONOLOGY_GROUPS.ed, (word) => index.get(word));
    }
    const sWords = rng.take(theme.vocab.filter((v) => v.word.endsWith("s") || v.word.endsWith("z")), 4);
    const words = sWords.map((v) => v.word);
    const list = words.length >= 4 ? words : theme.vocab.slice(0, 4).map((v) => v.word);
    const map: Record<string, string> = { s: "/s/", z: "/z/", iz: "/ɪz/" };
    const index = new Map(theme.vocab.map((v) => [v.word, map[v.finalS ?? "s"] ?? "/s/"]));
    return build(list, PHONOLOGY_GROUPS.s, (word) => index.get(word));
  } else if (skillRule.skill === "GRAMMAR") {
    const exs = rng.take(theme.grammar, 2);
    return {
      skill: "GRAMMAR",
      prompt: exs.map((e, i) => `${i + 1}. ${e.sentence}`).join("\n"),
      instruction: skillRule.instruction,
      answer: exs.map((e, i) => `${i + 1}. ${e.rewritten} (${e.note})`).join("\n"),
      marks: skillRule.marks,
    };
  } else {
    const d = theme.discourse;
    // The word bank is part of the CONTRACT, not decoration: GAP_FILL's
    // instruction refers to "the list given", so a prompt without one produces an
    // unanswerable question. The validator rejects it (and the mock must honour
    // the same rules as the real providers, or every test that exercises a
    // validator rule through the mock silently stops covering that rule).
    //
    // Shape matches `WORD_BANK_RULE`: `List: [a, b, c]`, one line, first.
    const bank = d.options.join(", ");
    // One SENTENCE per line for a word-bank task, because that is what the paper
    // prints: the parser treats bare lines as items, so a single line holding
    // three sentences became one giant question a) rather than a), b), c).
    const sentences = d.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const isWordBank = skillRule.instruction.toLowerCase().includes("list");
    const task: GeneratedTask = {
      skill: "DISCOURSE",
      prompt: isWordBank ? `List: [${bank}]\n${sentences.join("\n")}` : d.text,
      instruction: skillRule.instruction,
      answer: d.options.filter((o) => d.answers.includes(o)).join(", "),
      marks: skillRule.marks,
    };
    if (rulePrescribesTable(skillRule)) {
      const gaps = d.text.match(/___/g) || [];
      task.table = {
        headers: ["Gap", "Word"],
        // d.answers is the answer key — the Word column is left for the student.
        rows: d.answers.map((_, i) => [String(i + 1), ""]),
      };
    }
    return task;
  }
}

function generateTextExplorationAlternate(skillRule: SkillRule, theme: ReturnType<typeof getTheme>, rng: Seeded, variant: number): GeneratedTask {
  const altType = variant % 2;

  if (skillRule.skill === "VOCABULARY") {
    if (altType === 0) {
      // SYNONYM_MATCH — find synonyms from a list
      const words = rng.take(theme.vocab, 4);
      const allWords = theme.vocab.map((v) => v.word);
      const distractors = rng.take(allWords.filter((w) => !words.some((ww) => ww.word === w)), 3);
      return {
        skill: "VOCABULARY",
        family: "SYNONYM_MATCH",
        prompt: words
          .map((w, i) => `${i + 1}. ${w.word.charAt(0).toUpperCase() + w.word.slice(1)} → ..........`)
          .join("\n"),
        instruction: `Find the synonym for each word. Choose from: ${rng.shuffle([...words.map((w) => w.word), ...distractors]).join(", ")}.`,
        answer: words.map((w, i) => `${i + 1}. ${w.word}`).join("\n"),
        marks: skillRule.marks,
      };
    } else {
      // DEFINITION_GAP — fill in the definition
      const words = rng.take(theme.vocab, 4);
      return {
        skill: "VOCABULARY",
        family: "DEFINITION_GAP",
        prompt: words
          .map((w, i) => `${i + 1}. "${w.word}" means ".........."`)
          .join("\n"),
        instruction: "Complete each definition with the correct word from the text.",
        answer: words.map((w, i) => `${i + 1}. ${w.word} = ${wordDef(theme, w.word)}`).join("\n"),
        marks: skillRule.marks,
      };
    }
  } else if (skillRule.skill === "MORPHOLOGY") {
    if (altType === 0) {
      // PREFIX_SUFFIX — add prefix or suffix
      const words = rng.take(theme.vocab, 3);
      return {
        skill: "MORPHOLOGY",
        family: "PREFIX_SUFFIX",
        prompt: words
          .map((w, i) => `${i + 1}. "${w.word.replace(/s$/, "")}" → add a prefix or suffix to form a new word`)
          .join("\n"),
        instruction: "Add a suitable prefix or suffix to each word to form a new word.",
        answer: words.map((w, i) => {
          const noun = w.family.noun ?? "";
          return `${i + 1}. ${w.word.replace(/s$/, "")} → ${noun || w.word}`;
        }).join("\n"),
        marks: skillRule.marks,
      };
    } else {
      // WORD_BUILDING — build words from roots
      const words = rng.take(theme.vocab, 3);
      return {
        skill: "MORPHOLOGY",
        family: "WORD_BUILDING",
        prompt: words
          .map((w, i) => `${i + 1}. Build a word using: "${w.family.verb ?? w.family.noun ?? w.word}" + appropriate affix`)
          .join("\n"),
        instruction: "Build a new word from each root by adding a prefix or suffix.",
        answer: words.map((w, i) => {
          const adj = w.family.adjective ?? "";
          return `${i + 1}. ${w.word.replace(/s$/, "")} → ${adj || w.word}`;
        }).join("\n"),
        marks: skillRule.marks,
      };
    }
  } else if (skillRule.skill === "PHONOLOGY") {
    if (altType === 0) {
      // STRESS_PATTERN — identify stressed syllables
      const words = rng.take(theme.vocab, 4);
      return {
        skill: "PHONOLOGY",
        family: "STRESS_PATTERN",
        prompt: `Where is the stress in each word?\n${words.map((w) => w.word).join(" — ")}`,
        instruction: "Mark the stressed syllable in each word with an uppercase letter.",
        answer: words.map((w) => `${w.word}: ${w.word.charAt(0).toUpperCase()}${w.word.slice(1)}`).join("\n"),
        marks: skillRule.marks,
      };
    } else {
      // SILENT_LETTER — identify silent letters
      const words = rng.take(theme.vocab, 4);
      return {
        skill: "PHONOLOGY",
        family: "SILENT_LETTER",
        prompt: `Which letters are silent in these words?\n${words.map((w) => w.word).join(" — ")}`,
        instruction: "Identify the silent letter(s) in each word.",
        answer: words.map((w) => `${w.word}: no silent letters`).join("\n"),
        marks: skillRule.marks,
      };
    }
  } else if (skillRule.skill === "GRAMMAR") {
    if (altType === 0) {
      // CHOOSE_CORRECT_FORM — choose between two forms
      const exs = rng.take(theme.grammar, 2);
      return {
        skill: "GRAMMAR",
        family: "CHOOSE_CORRECT_FORM",
        prompt: exs.map((e, i) => `${i + 1}. ${e.sentence}\n   A. ${e.rewritten}\n   B. ${e.sentence}`).join("\n"),
        instruction: "Choose the correct form (A or B) that means the same as sentence A.",
        answer: exs.map((e, i) => `${i + 1}. A`).join("\n"),
        marks: skillRule.marks,
      };
    } else {
      // CORRECT_THE_MISTAKE — find and correct the error
      const exs = rng.take(theme.grammar, 2);
      return {
        skill: "GRAMMAR",
        family: "CORRECT_THE_MISTAKE",
        prompt: exs.map((e, i) => `${i + 1}. ${e.sentence.replace(/\./g, " (containing a mistake).")}`).join("\n"),
        instruction: "Find and correct the grammatical mistake in each sentence.",
        answer: exs.map((e, i) => `${i + 1}. ${e.rewritten}`).join("\n"),
        marks: skillRule.marks,
      };
    }
  } else {
    if (altType === 0) {
      // JUMBLED_SENTENCES — put sentences in order
      const d = theme.discourse;
      const sentences = d.text.split(/[.!?]+\s+/).filter(Boolean);
      return {
        skill: "DISCOURSE",
        family: "JUMBLED_SENTENCES",
        prompt: `Put these sentences in the correct order to make a coherent text.\n${rng.shuffle(sentences).map((s, i) => `${String.fromCharCode(65 + i)}. ${s.trim()}`).join("\n")}`,
        instruction: "Number the sentences (1-" + sentences.length + ") in the correct order.",
        answer: sentences.map((s, i) => `${i + 1}. ${s.trim()}`).join("\n"),
        marks: skillRule.marks,
      };
    } else {
      // COHESIVE_LINKERS — choose the correct linker
      const d = theme.discourse;
      return {
        skill: "DISCOURSE",
        family: "COHESIVE_LINKERS",
        prompt: d.text,
        instruction: "Choose the correct cohesive linker for each gap from the list: " + d.options.join(", "),
        answer: d.options.filter((o) => d.answers.includes(o)).join(", "),
        marks: skillRule.marks,
      };
    }
  }
}

const capitalise = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);

// Every sentence a theme can contribute to a passage, so referent targets are
// drawn from language the passage actually contains.
function themeBody(theme: Theme): string {
  return [...theme.lead, ...theme.body, ...theme.detail, ...theme.conclusion].join(" ");
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

export function generateWriting(ctx: MockContext, variant = 0): { guided: GeneratedTopic; free: GeneratedTopic | null } {
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

  if (w.singleTopic) {
    const instructionText = w.instruction ?? "Write a text of about 80\u2013120 words in response to the following situation.";
    const guided: GeneratedTopic = {
      kind: "GUIDED",
      title: "Topic 1",
      situation: ctx.teacherKeywords && ctx.teacherKeywords.trim()
        ? `Your school magazine is preparing a special issue about ${topic}. You have been asked to write about ${ctx.teacherKeywords.split(/[,;/]/).map((k) => k.trim()).filter(Boolean).join(" and ")}, explaining why ${topic} matters for young people.`
        : `Your school magazine is preparing a special issue about ${topic}. You have been asked to write a text explaining why ${topic} matters for young people.`,
      instruction: instructionText,
      keywords,
      form,
      marks: w.marks,
    };
    return { guided, free: null };
  }

  const guided: GeneratedTopic = {
    kind: "GUIDED",
    title: "Topic 1",
    situation: ctx.teacherKeywords && ctx.teacherKeywords.trim()
      ? `Your school magazine is preparing a special issue about ${topic}. You have been asked to write ${form} about ${ctx.teacherKeywords.split(/[,;/]/).map((k) => k.trim()).filter(Boolean).join(" and ")}, explaining why ${topic} matters for young people.`
      : `Your school magazine is preparing a special issue about ${topic}. You have been asked to write ${form} explaining why ${topic} matters for young people.`,
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

export function topicAlternatives(ctx: MockContext, count = 3): { guided: GeneratedTopic; free: GeneratedTopic | null }[] {
  const out: { guided: GeneratedTopic; free: GeneratedTopic | null }[] = [];
  for (let v = 1; v <= count; v++) {
    out.push(generateWriting(ctx, v));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Facade entry points (same shape as the OpenAI provider, PRD 15.3)
// ---------------------------------------------------------------------------

// The mock honours `candidateCount()` for the same reason it honours the
// paragraph count and topic anchoring: it is the offline stand-in for the real
// providers, and a test double that returns a different SHAPE from the code it
// stands in for silently stops covering that code.
export function generateTextCandidates(ctx: MockContext): GeneratedTextCandidate[] {
  const n = candidateCount();
  const primary = generateText(ctx, 0);
  return [
    { title: primary.title, text: primary.text, source: primary.source },
    ...textAlternatives(ctx, n - 1),
  ];
}

export function generatePartOneCandidates(ctx: MockContext): GeneratedTask[][] {
  return [generatePartOne(ctx, 0), ...taskAlternatives(ctx, "PART_ONE", candidateCount() - 1)];
}

export function generateTextExplorationCandidates(ctx: MockContext): GeneratedTask[][] {
  return [
    generateTextExploration(ctx, 0),
    ...taskAlternatives(ctx, "TEXT_EXPLORATION", candidateCount() - 1),
  ];
}

export function generateWritingCandidates(ctx: MockContext): { guided: GeneratedTopic; free: GeneratedTopic | null }[] {
  return [generateWriting(ctx, 0), ...topicAlternatives(ctx, candidateCount() - 1)];
}

// ---------------------------------------------------------------------------
// Rewrite tools (US-023): simplify or make a passage harder
// ---------------------------------------------------------------------------

export function generateRewrite(
  ctx: MockContext,
  opts: { text: string; title?: string; target: "simpler" | "harder" },
  variant = 0
): GeneratedText {
  const theme = getTheme(ctx.themeKey);
  const rng = new Seeded(ctx.seed + `:rewrite:${opts.target}:${variant}`);
  const topic = ctx.topic.toLowerCase();

  const paragraphs = splitParagraphs(opts.text);
  const title = opts.title || theme.title.replace(/\{topic\}/g, titleCaseTopic(topic));

  if (opts.target === "simpler") {
    // Split long sentences at commas and drop subordinate clauses.
    let out = paragraphs
      .map((p) => splitLongSentences(splitSentences(p)).join(" "))
      .join("\n\n");
    // Guarantee a visible change even when the passage is already simple.
    if (out === opts.text) {
      out = opts.text
        .replace(/\bhowever\b/g, "but")
        .replace(/\btherefore\b/g, "so")
        .replace(/\badditionally\b/g, "also");
    }
    return { title, text: out, words: countWords(out) };
  }

  // Harder: merge sentences with connectors and insert detail sentences.
  const detail = rng.take(theme.detail, 2).map((s) => s.replace(/\{topic\}/g, topic));
  const merged = paragraphs.map((p) => {
    const sentences = splitSentences(p);
    return sentences.map((s, i) => (i > 0 && i % 2 === 1 ? "; " + s : s)).join(" ");
  });
  const lastIndex = merged.length - 1;
  const lastSentences = splitSentences(merged[lastIndex]);
  lastSentences.splice(Math.max(1, lastSentences.length - 1), 0, ...detail);
  merged[lastIndex] = lastSentences.join(" ");
  const out = merged.join("\n\n");
  return { title, text: out, words: countWords(out) };
}

export function generateRewriteCandidates(
  ctx: MockContext,
  opts: { title?: string; text: string; target: "simpler" | "harder" }
): GeneratedTextCandidate[] {
  const primary = generateRewrite(ctx, opts, 0);
  const alts = [1, 2].map((v) => generateRewrite(ctx, opts, v));
  return [primary, ...alts].map((c) => ({ title: c.title, text: c.text, source: c.source }));
}

// Re-exported helper for the dispatch layer
export { countWords };
