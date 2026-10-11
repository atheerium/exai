// Passage grounding: the guarantee that every question the teacher sees can be
// answered from the passage printed above it.
//
// Why this exists
// ---------------
// The generators historically drew task material from the *theme corpus*, not
// from the passage that was actually printed. `provider.ts` even permitted it
// in the prompt ("tasks may draw from the broader theme/content of the unit,
// not strictly constrained to the passage verbatim"). A vocabulary item could
// therefore name a word the student never sees, and the task is unanswerable.
//
// What is and is not guaranteed here
// ----------------------------------
// GUARANTEED (mechanically checked, enforced by `checkTaskLinkage`):
//   - every vocabulary / morphology target word occurs in the passage;
//   - every referent target occurs in the passage;
//   - table cells the student must fill are empty strings.
// NOT GUARANTEED (not mechanically checkable, constrained by prompt only):
//   - that a question is *semantically* answerable, i.e. that the passage
//     supports the judgement being asked for.
// Do not describe this module as proving answerability. It proves that the
// material referenced by the task is physically present in the text.

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Lower-cased, accent- and punctuation-insensitive token form.
 *
 * Uses `toLocaleLowerCase()` rather than a byte-wise lowercase so French
 * material ("ÉTÉ", "Élève") folds correctly; a naive lowercase is already
 * correct for ASCII but silently mismatches on accented capitals, which would
 * make French linkage checks fail for the wrong reason.
 */
export function normaliseToken(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Words that never make a useful vocabulary target: function words and the
 * ultra-common verbs/adjectives that appear in every passage. Kept deliberately
 * small and English-only-in-spirit: French passages fall back to the same list
 * plus a length filter, which still removes the worst offenders.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "the", "and", "or", "but", "so", "because", "as", "if", "than", "then",
  "of", "in", "on", "at", "to", "for", "from", "by", "with", "without", "into",
  "onto", "over", "under", "about", "after", "before", "between", "through",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "do", "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "shall", "should", "may", "might", "must", "let",
  "this", "that", "these", "those", "there", "here", "it", "its",
  "he", "she", "they", "we", "you", "i", "him", "her", "them", "us", "me",
  "his", "hers", "their", "our", "your", "my", "mine", "yours", "theirs",
  "who", "whom", "whose", "which", "what", "where", "when", "why", "how",
  "not", "no", "nor", "very", "too", "also", "just", "only", "even", "more",
  "most", "some", "any", "all", "each", "every", "both", "other", "such",
  "one", "ones", "up", "out", "off", "own", "same", "again", "once", "while",
  "whoever", "whatever", "however", "although", "though", "until", "upon",
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "mais",
  "que", "qui", "quoi", "dans", "sur", "pour", "avec", "sans", "au", "aux",
  "est", "sont", "etre", "avoir", "ce", "cette", "ces", "il", "elle", "nous",
  "vous", "ils", "elles", "on", "ne", "pas", "plus", "aussi", "tres",
]);

/** All normalised tokens of a passage, in order, duplicates preserved. */
export function passageTokens(passage: string): string[] {
  return passage.split(/\s+/).map(normaliseToken).filter((t) => t.length > 0);
}

/**
 * Inflection-tolerant membership test.
 *
 * A vocabulary target is "friend" while the passage may read "friends",
 * "friendly" or "friendship". Requiring an exact token match would reject
 * perfectly answerable items, so the base word counts as present when a
 * passage token extends it by a regular English inflection. The suffix set is
 * closed and short on purpose: an open-ended stemmer would let a completely
 * unrelated word satisfy the check, which is the failure this module exists to
 * prevent.
 */
const INFLECTIONS: readonly string[] = [
  "", "s", "es", "d", "ed", "ing", "er", "est", "ers", "ly",
];

function tokenVariants(base: string): string[] {
  return INFLECTIONS.map((suf) => base + suf);
}

/**
 * True when `word` (a vocabulary target or referent) is recoverable from the
 * passage by exact token match or a regular inflection of it.
 */
export function occursInPassage(passage: string, word: string): boolean {
  const base = normaliseToken(word);
  if (base.length < 2) return false;
  const tokens = passageTokens(passage);
  const allowed = new Set(tokenVariants(base));
  // Possessives: "friend's" normalises to "friend's" (apostrophe is kept inside
  // the token), so also accept the bare stem followed by a possessive suffix.
  return tokens.some((t) => allowed.has(t) || t.startsWith(`${base}'`));
}

// ---------------------------------------------------------------------------
// Vocabulary extraction from the passage
// ---------------------------------------------------------------------------

export interface PassageVocabItem {
  /** The word exactly as it should be printed as the target. */
  word: string;
  /** Zero-based paragraph the word first occurs in. */
  paragraph: number;
}

const MIN_TARGET_LENGTH = 4;

/**
 * Content words from the passage, in order of first appearance, de-duplicated
 * case-insensitively and stripped of stopwords.
 *
 * This is the material the vocabulary and morphology tasks are built from when
 * a passage is available. Returning the *printed* form (not the normalised
 * one) keeps the task and the passage spelling consistent.
 */
export function passageVocabulary(passage: string, limit = 40): PassageVocabItem[] {
  const paragraphs = passage.split(/\n{2,}/);
  const seen = new Set<string>();
  const out: PassageVocabItem[] = [];

  // Labelled loop, not forEach: a `return` inside a forEach callback exits only
  // that callback, so a limit check there would silently stop applying after
  // the first paragraph.
  outer: for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    for (const raw of paragraphs[paragraphIndex].split(/\s+/)) {
      const token = normaliseToken(raw);
      if (token.length < MIN_TARGET_LENGTH) continue;
      if (STOPWORDS.has(token)) continue;
      if (!/^[\p{L}]+$/u.test(token)) continue; // skip numbers and mixed forms
      if (seen.has(token)) continue;
      seen.add(token);
      out.push({ word: raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), paragraph: paragraphIndex });
      if (out.length >= limit) break outer;
    }
  }

  return out;
}

/**
 * Pronouns and repetition-avoiding substitutes that actually occur in the
 * passage, re-exported from the referent rule module so callers have one
 * import for all passage-derived material.
 */
export { pickReferents } from "./referents";

// ---------------------------------------------------------------------------
// Linkage validation
// ---------------------------------------------------------------------------

/** Minimal shape needed to check a task; kept local so this module has no
 *  dependency on the generator or the Prisma types. */
export interface LinkableTask {
  skill?: string | null;
  family?: string | null;
  prompt?: string | null;
  instruction?: string | null;
  answer?: string | null;
  table?: { headers: string[]; rows: string[][] } | null;
}

/**
 * Words pulled out of a task prompt for lexical checking: the numbered target
 * lines (`1. Word -> .........`) and any explicitly quoted span.
 *
 * Deliberately conservative. When a task carries no extractable target the
 * function returns an empty list and the caller treats that task as
 * "not mechanically checkable" rather than as a failure — a false rejection
 * here would block a legitimate exam, and the teacher's review is the backstop
 * for semantics.
 */
export function extractTaskTargets(task: LinkableTask): string[] {
  const text = [task.prompt, task.instruction].filter(Boolean).join("\n");
  const out: string[] = [];

  // Numbered target lines: "1. Curiosity -> .........." / "1. \"Habit\" (…)"
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*\d+[.)]\s*"?([^"->…]+?)\s*(?:->|→|\(underlined\)|…|$)/u);
    if (m) {
      const w = normaliseToken(m[1]);
      if (w.length >= 2 && !STOPWORDS.has(w)) out.push(w);
    }
  }

  // Quoted spans: "the former" (underlined), "they"
  for (const m of text.matchAll(/"([^"]{2,60})"/g)) {
    const span = normaliseToken(m[1]);
    if (span.includes(" ")) continue; // multi-word: referents module handles these
    if (span.length >= 2 && !STOPWORDS.has(span)) out.push(span);
  }

  return [...new Set(out)];
}

/** Skills whose targets are expected to be literally present in the passage. */
const LEXICAL_SKILLS: ReadonlySet<string> = new Set(["VOCABULARY", "MORPHOLOGY"]);

/**
 * Reject a passage that drifts off its topic between paragraphs.
 *
 * Motivation (user report, 2026-10-11): a generated passage opened on
 * "advertising", then moved to ancient monuments, then traditional music, then
 * archaeologists — four paragraphs, four subjects. That reads as four unrelated
 * texts stapled together, and the questions then have no stable referent.
 *
 * The rule is deliberately mechanical: every paragraph must mention the topic
 * or one of the teacher keywords. That catches the reported failure without
 * pretending to judge style. It does NOT prove full coherence — a paragraph can
 * name the topic once and then wander. Stated plainly so nobody reads this as
 * more than it is.
 *
 * Short paragraphs are exempt by word count: a one-sentence closing paragraph
 * that merely refers back ("In the end, …") is normal, and demanding a literal
 * topic mention there produces false rejections.
 */
export function checkTopicAnchoring(
  passage: string,
  opts: { topic: string; keywords?: string | null; minWords?: number }
): string[] {
  const issues: string[] = [];
  const paragraphs = passage.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return issues;

  const minWords = opts.minWords ?? 12;
  const topicAnchors = buildAnchors(opts.topic);
  const keywordAnchors = (opts.keywords ?? "")
    .split(/[,;/]/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);

  if (topicAnchors.length === 0 && keywordAnchors.length === 0) return issues;

  paragraphs.forEach((paragraph, i) => {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    if (words < minWords) return;
    // Filler-only matches are ignored: accepting "and" or "exploring" would
    // anchor every paragraph, which is the failure this check exists to stop.
    const anchored =
      topicAnchors.some((forms) => forms.some((f) => mentionsAnchor(paragraph, f))) ||
      keywordAnchors.some((k) => mentionsAnchor(paragraph, k));
    if (!anchored) {
      issues.push(
        `Paragraph ${i + 1} does not mention "${opts.topic}" or any teacher keyword, so it is off-topic.`
      );
    }
  });
  return issues;
}

/**
 * The forms of a topic that count as a mention: the whole phrase, then each of
 * its content words individually.
 *
 * The topic the code receives is the CURRICULUM LABEL, not a short noun. Live on
 * 2026-10-11 it was "Exploring the ancient world" and "Friendship and being a
 * good friend". Requiring that phrase verbatim in every paragraph rejects
 * perfectly good passages — a paragraph about ancient monuments does not contain
 * the string "Exploring the ancient world", and a passage about friendship does
 * not contain "Friendship and being a good friend". Four out of four live exams
 * failed on exactly this, which is how the flaw surfaced.
 *
 * So a content word of the topic ("ancient", "world", "friendship") also anchors.
 * That still rejects genuine drift: traditional music, rhythms and musicians
 * contain no content word of either topic above.
 *
 * Filler is excluded deliberately — "and", "being", "good", "exploring" carry no
 * topic meaning, and accepting them would anchor every paragraph.
 */
const TOPIC_FILLER = new Set([
  "and", "being", "good", "exploring", "about", "with", "into", "from",
  "their", "them", "they", "your", "yours", "more", "than", "when", "what",
  "which", "while", "where", "does", "doing", "using", "through", "across",
]);

function buildAnchors(topic: string): string[][] {
  const whole = topic.toLocaleLowerCase().trim();
  if (!whole) return [];
  const contentWords = whole
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && !TOPIC_FILLER.has(w) && !STOPWORDS.has(w));
  return contentWords.length > 0 ? [[whole], ...contentWords.map((w) => [w])] : [[whole]];
}

/**
 * Phrase-aware anchor test.
 *
 * `occursInPassage` deliberately matches a SINGLE token with inflections, which
 * is right for a vocabulary target or a referent ("monuments" matches
 * "monument") but wrong for an anchor: topics are routinely multi-word ("digital
 * literacy", "heritage preservation"), and running them through a single-token
 * comparison can never match, so every paragraph would be reported off-topic.
 *
 * Word-boundary containment is used instead, which handles both a one-word and a
 * multi-word anchor without needing two code paths. Deliberately NOT stemmed:
 * accepting a prefix would let "advert" anchor a paragraph about advertising
 * appliances, which is exactly the drift this check exists to catch.
 */
function mentionsAnchor(paragraph: string, anchor: string): boolean {
  const haystack = " " + paragraph
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim() + " ";
  const needle = anchor
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!needle) return false;
  return haystack.includes(` ${needle} `);
}

/**
 * Mechanically checkable linkage between a section's tasks and the passage.
 *
 * Returns an empty array when everything holds. Issues are human-readable and
 * name the task, because they surface verbatim in the API's 422 body and the
 * teacher needs to know which section to regenerate.
 */
export function checkTaskLinkage(tasks: LinkableTask[], passage: string): string[] {
  const issues: string[] = [];
  if (!passage || passage.trim().length === 0) return issues;

  tasks.forEach((task, i) => {
    const label = `Task ${i + 1}`;

    // 1. Answer cells the student must fill are blank.
    if (task.table) {
      task.table.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          // Column 0 is the given material for every task type in the corpus;
          // every column to its right is a student's answer and must be empty.
          if (c > 0 && cell.trim() !== "") {
            issues.push(`${label} table row ${r + 1} column ${c + 1} is prefilled ("${cell.trim()}"); answer cells must be empty.`);
          }
        });
      });
    }

    // 2. Vocabulary / morphology targets must occur in the passage.
    const skill = (task.skill ?? "").toUpperCase();
    const lexical = LEXICAL_SKILLS.has(skill);
    // Referent families are grounded for any skill: the target is quoted from
    // the text by definition, whichever part the task belongs to.
    const isReferent = (task.family ?? "").toUpperCase().includes("COHESIVE");

    if (lexical || isReferent) {
      const targets = extractTaskTargets(task);
      for (const t of targets) {
        if (!occursInPassage(passage, t)) {
          issues.push(
            `${label} targets "${t}", which does not occur in the passage; the task cannot be answered from the text.`
          );
        }
      }
    }
  });

  return issues;
}