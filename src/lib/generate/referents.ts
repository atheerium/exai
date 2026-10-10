// Cohesive-marker rules for the "find what or who the underlined words refer to"
// task (question 4 and its variants elsewhere).
//
// An underlined target is valid under exactly two conditions.
//
//  1. It is a PRONOUN -- personal, demonstrative, relative, interrogative or
//     reflexive. These stand in for a noun phrase already mentioned.
//  2. It is a REPETITION-AVOIDING SUBSTITUTE -- a word or expression that lets
//     the writer avoid naming the same subject twice ("the former", "the same",
//     "also", "such", "the latter").
//
// Anything else is a content word. Adjectives and abstract nouns such as
// "honest", "trust", "curiosity" and "motivated" have no recoverable
// antecedent, so an item built on them cannot be answered from the text and is
// meaningless in context.

export type ReferentCategory =
  | "personal"
  | "demonstrative"
  | "relative"
  | "interrogative"
  | "reflexive"
  | "possessive"
  | "repetition-avoiding";

/**
 * Pronouns by grammatical class. Keys are the only words accepted in category 1.
 * A word may belong to more than one class ("that" is both demonstrative and
 * relative), so each set is independent.
 */
export const PRONOUNS: Record<Exclude<ReferentCategory, "repetition-avoiding">, ReadonlySet<string>> = {
  personal: new Set([
    "i", "you", "he", "she", "it", "we", "they",
    "me", "him", "her", "us", "them",
  ]),
  demonstrative: new Set([
    "this", "that", "these", "those", "such",
    "this one", "that one", "these ones", "those ones",
  ]),
  relative: new Set([
    "who", "whom", "whose", "which", "that", "what",
  ]),
  interrogative: new Set([
    "who", "whom", "whose", "which", "what",
  ]),
  reflexive: new Set([
    "myself", "yourself", "himself", "herself", "itself", "ourselves",
    "yourselves", "themselves",
  ]),
  possessive: new Set([
    "my", "your", "his", "its", "our", "their",
    "mine", "yours", "hers", "ours", "theirs",
  ]),
};

/**
 * Words and fixed expressions whose whole job is to avoid repeating a subject.
 * "the former" / "the latter" name an already-mentioned pair; "also", "too" and
 * "as well" add a repeat referent; "one"/"ones" and "the same" stand in for a
 * previously named noun phrase.
 */
export const REPETITION_AVOIDING: ReadonlySet<string> = new Set([
  // Paired reference: names one of two things already mentioned.
  "the former", "the latter", "the first", "the second", "the third",
  // Additive reference: adds a further instance of the same subject.
  "also", "too", "as well", "as such",
  // Generic reference: stands in for an already-named noun phrase.
  "one", "ones", "the same", "such", "the others", "others", "another",
  // Textual substitution: points back at earlier content without naming it.
  "then", "there", "here", "so",
  // Deliberately excluded: "such as" and "the same as" are subordinators that
  // introduce examples, so they point forward instead of substituting for an
  // earlier noun phrase. Bare "such" is a valid demonstrative substitute.
]);

const PRONOUN_SETS: ReadonlySet<string>[] = Object.values(PRONOUNS);
const ALL_PRONOUNS: ReadonlySet<string> = new Set(PRONOUN_SETS.flatMap((s) => [...s]));

/** Lower-cased, punctuation-stripped lookup form for any target string. */
function normalise(word: string): string {
  return word.trim().toLowerCase().replace(/^[^\p{L}\p{N}' ]+|[^\p{L}\p{N}' ]+$/gu, "");
}

/** Every grammatical class a word belongs to, e.g. "that" -> relative, demonstrative. */
export function referentCategories(word: string): ReferentCategory[] {
  const key = normalise(word);
  const out: ReferentCategory[] = [];

  for (const [category, set] of Object.entries(PRONOUNS)) {
    if (set.has(key)) out.push(category as ReferentCategory);
  }
  if (REPETITION_AVOIDING.has(key)) out.push("repetition-avoiding");
  return out;
}

/** True when the word satisfies constraint 1 or constraint 2. */
export function isReferentWord(word: string): boolean {
  const key = normalise(word);
  return ALL_PRONOUNS.has(key) || REPETITION_AVOIDING.has(key);
}

/** True only for category 2, the repetition-avoiding substitutes. */
export function isRepetitionAvoiding(word: string): boolean {
  return REPETITION_AVOIDING.has(normalise(word));
}

/** Every accepted referent, for callers that need to iterate the vocabulary. */
export const REFERENT_WORDS: ReadonlySet<string> = new Set([
  ...ALL_PRONOUNS,
  ...REPETITION_AVOIDING,
]);

/**
 * Multi-word substitutes ("the former", "as well") are matched against the raw
 * token stream, so they are handled here rather than by the single-word path.
 */
function matchesMultiWord(text: string, target: string): boolean {
  return new RegExp(`(?:^|\\s)${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s.,;:!?])`, "i").test(text);
}

/**
 * Picks referent targets actually present in the passage, in order of first
 * appearance and without repeats, so every item is answerable from the text.
 * Multi-word substitutes are considered before single words so "the former"
 * wins over a stray "the".
 */
export function pickReferents(passage: string, count: number): string[] {
  const lower = passage.toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const firstIndex = new Map<string, number>();

  for (const phrase of REPETITION_AVOIDING) {
    if (phrase.includes(" ") && matchesMultiWord(lower, phrase)) {
      firstIndex.set(phrase, lower.indexOf(phrase));
    }
  }

  for (const [token, index] of [...firstIndex].sort((a, b) => a[1] - b[1])) {
    seen.add(token);
    out.push(token);
    if (out.length >= count) return out;
  }

  for (const raw of passage.split(/\s+/)) {
    const word = normalise(raw);
    if (word.length < 2 || seen.has(word) || !ALL_PRONOUNS.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Zero-based paragraph index of the first paragraph containing the word, or
 * null when absent. Paragraphs are separated by blank lines, which is how
 * passages are stored (`toParagraphs`).
 */
export function paragraphIndexOf(passage: string, word: string): number | null {
  const needle = normalise(word);
  if (needle.length < 2) return null;

  const paragraphs = passage.split(/\n{2,}/);
  for (let i = 0; i < paragraphs.length; i++) {
    const tokens = paragraphs[i].toLowerCase().split(/\s+/);
    const hit = tokens.some((t) => normalise(t) === needle);
    if (hit) return i;
  }
  return null;
}