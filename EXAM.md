# EXAM.md — The Official Exam Paper

> **This file is the single source of truth for the exam format and structure.**
> It is organised by task. Everything needed to rebuild the exam builder — or
> any single exam — is specified here: section order, headings, marks, wording,
> typography, per-task item counts and rendering. If the code and this document
> disagree, this document is correct and the code is wrong.
>
> **Maintenance rule:** whenever the user states a format, structure, wording,
> constraint or styling rule for the exam, it must be written into this file in
> the same change that implements it. This file grows monotonically; nothing
> here is removed when an implementation detail changes.

This document is the contract for what an Exaai exam looks like on paper. It is
derived from three sources, and where they disagree the **screenshot of a real
paper wins**:

1. The official BAC English paper layout (the screenshots) — governs
   *presentation*.
2. The BAC English Examination Specifications & Task Pool master guide (the PDF)
   — governs *content*: which task families exist, their exact wording, and
   their item counts.
3. Direct instructions from the user — govern both, and are added here verbatim
   in intent so nothing is lost.

`src/lib/export/paper.ts` implements section 5 below. That module is the single
source of layout truth: the PDF renderer, the DOCX renderer and the builder
preview all walk the same block list, so the three surfaces cannot drift apart.
Change the layout there and all three follow.

### Where each rule is enforced

| Rule | Enforced in |
|---|---|
| No answers on the paper | `src/lib/export/assemble.ts`, `src/lib/generate/mock.ts` |
| Paper structure and headings | `src/lib/export/assemble.ts` |
| Typography, tables, Arabic header | `src/lib/export/pdf.ts`, `src/lib/export/arabic.ts` |
| Block model (single layout source) | `src/lib/export/paper.ts` |
| Prompt parsing, letter labelling | `src/lib/export/paper.ts` |
| Referent rules (section 7) | `src/lib/generate/referents.ts`, `src/lib/export/paper.ts` |
| Marks per grade/stream | `src/data/guides.ts` |
| Task wordings and item counts | `src/data/guides.ts` |

---

### Contents

1. [No answers on the paper](#1-the-non-negotiable-rule-no-answers-on-the-paper)
2. [Paper structure](#2-paper-structure)
3. [Typography rules](#3-typography-rules)
4. [Marks](#4-marks)
5. [Block model](#5-block-model)
6. [Prompt parsing](#6-prompt-parsing)
7. [Referent items (question 4)](#7-referent-items-pronouns-only-with-paragraph-references)
8. [Specifications by stream](#8-specifications-by-stream) — includes the **per-task pool** (comprehension, text exploration, written expression)
9. [Verification](#9-verification)

### How this document is organised

Sections 1-7 are **cross-cutting rules** that apply to every task: no answers,
structure, typography, marks, the block model, prompt parsing, and the referent
rules. Section 8 is **organised by task** and carries each task's official
wording, its item constraint and how it is rendered.

When adding a task, add it to the section 8 table with all three columns. When
adding a rule that applies everywhere, add a new cross-cutting section.

## 1. The non-negotiable rule: no answers on the paper

The student-facing paper contains **questions and empty answer slots only**.
Answers live in the `answer` field of a task and are shown solely in the
teacher-facing "Answer key" toggle.

Two mechanisms enforce this:

- Every generated table leaves the answer column **empty** (column 0 holds the
  stimulus; all later columns are blank). Enforced by a regression test that
  walks all 7 grades x 3 variants.
- The live providers (`provider.ts`) are instructed: any table cell the student
  must fill is an empty string; the correct value goes only in `answer`.

Exports (`assemble.ts`) never read the `answer` field, so PDF and DOCX cannot
carry an answer key. `buildPaper` drops it structurally.

## 2. Paper structure

### The shared skeleton

All three reference exams follow the same order. This is the canonical
structure; anything that varies between them is cosmetic.

```
[Arabic ruled institutional header]        <- BAC only
Part One: Reading.                          (15 pts)     bold, marks flush right
A/ Comprehension.                           (08 pts)
Read the text carefully and do the activities.          bold italic
[passage: justified, first-line indent, target words bold+underlined]
Adapted from <source>                                  bold italic, right
1. <task stem in bold italic>
   a.) <item>                          <- items lettered a.)
   b.) <item>
2. <task stem>
   ...
B/ Text Exploration.                       (07 pts)
1. <task stem>
   ...
Part Two: Written Expression.             (05 pts)
Choose only ONE of the following topics.               bold italic
Topic One:                                              bold italic, underlined
```

Task order common to all three: a comprehension opener (text type, multiple
choice or true/false), paragraph identification, direct questions, then the
referent question.

Variants seen across the three, all acceptable:

- Heading punctuation: `Part One: Reading` / `Part One: Reading:` (trailing
  colon on the section sub-heading).
- Task numbering: `1.` or `1)` or `1-` — the digit and punctuation are bold,
  the stem that follows is bold italic.
- Item labels: `a.` or `a)`. We use `a.)`.
- Instruction wording: "Read the text carefully and do the activities."
- Marks may be `(15 pts)`, `(15 Points)` or `15 points)` depending on the
  original. We standardise on `(15 pts)`.

### Order of elements

For `bac` guides (secondary,1as-3as):

```
[Arabic institutional header - 5 centred lines]
[Title]
[Subtitle]
[Meta line: Level / Grade / Stream / Unit / Topic / Length / Language / Duration]

Part One: Reading.                              (15 points)
[passage title]
[passage paragraphs, justified, target words underlined]
[Adapted from <source>, right-aligned]

A/ Comprehension.                               (08 points)
Read the text carefully to do the activities.
  1.  Say whether the following statements are true or false.
      a. ...
      b. ...
  2.  Identify the paragraphs in which the following ideas are mentioned.
      ...

B/ Text Exploration.                           (07 points)
  1.  ...

Part Two: Written Expression                   (06 points)
Choose ONE of the following topics
  Topic One:
    [situation]
    [instruction]
    Make the best use of the following notes:
      - note
      - note
  Topic Two:
    ...

---------------------------------------------------------------
                            4   ص1
```

For `bem` guides (middle school, 1am-4am) there is no Arabic header and no page
footer; the three sections are `A. Reading Comprehension`, `B. Text exploration`,
`C. Written expression`.

## 3. Typography rules

The three reference exams (food labelling, organ trafficking, fast food) are the
source of truth here, and they agree on every point below.

The paper is set in **Times New Roman** (`public/fonts/TimesNewRoman.ttf`). Body
text is **12pt** across the passage, tasks and items — the reference papers set
everything at one size. Bold / italic / underline carry real meaning and must
not be substituted. The bundled file ships the regular weight only, so bold and
italic fall back to pdfkit's metric-compatible Standard Times faces; add
`TimesNewRoman-Bold.ttf`, `-Italic.ttf` and `-BoldItalic.ttf` beside it and
register them in `WEIGHTS` (`src/lib/export/pdf.ts`) to use the genuine cuts.

| Element | Rule |
|---|---|
| Body / passage / tasks / items | Times New Roman **12pt**, one size throughout |
| Section heading | Times-Bold 13pt flush left; marks **bold 12pt flush right, same line** |
| Marks label | `(15 pts)` — parenthetical, zero-padded: `(08 pts)`, `(07 pts)`, `(05 pts)` |
| Instruction line | Times-Bold**Italic** 12pt under the first heading |
| Passage | Times New Roman 12pt, **justified**, first-line indent 16pt, 1.32 line height |
| Passage target words | **Bold *and* underlined**, scoped to the single word (never the whole line) |
| Paragraph numbers | **Not printed** — the reference lives only on the item, as `its (§1)` |
| Source note | Times-BoldItalic 9.5pt, **right-aligned** |
| Task number | Times-Bold `1.` |
| Task stem | Times-**BoldItalic** — the wording itself is bold italic |
| Item label | Times-**Bold** `a.)` |
| Item text | Times New Roman 12pt, never bold |
| Referent items | **Two-up on one line**: `a.) its (§2) ……  b.) them (§1) ……` |
| Paragraph ref | `(§2)` after the item word, regular weight |
| Answer gaps | `……` dotted leaders inline after the item |
| Table headers | Times-Bold, **centred**, 0.8pt black grid, **no shading, no zebra** |
| Topic label | Times-BoldItalic and **underlined**: `Topic One:` |
| Notes heading | Times-Bold, full sentence with a colon |
| Notes items | `•` bullet, Times New Roman |
| Running header (page 2+) | Arabic subject line under a full-width rule |
| Page footer | 0.7pt black rule, then centred `صفحة X من Y` |

### Arabic header

BAC papers open with a ruled institutional block, drawn only when the Arabic
font is available:

```
──────────────────────────────────────────────
        الجمهورية الجزائرية الديمقراطية الشعبية   (bold)
              وزارة التربية الوطنية                (bold)
        الديوان الوطني للامتحانات والمسابقات
──────────────────────────────────────────────
                          امتحان بكالوريا التعليم الثانوي   (bold right)
                              Foreign Languages   (regular left)
──────────────────────────────────────────────
        اختبار في مادة:  اللغة الإنجليزية        (label bold, value regular)
  03 سا 00 د
──────────────────────────────────────────────
      على المترشح أن يخترأ أحد الموضوعين الآتيين :      (centred bold)
                    الموضوع الأول                          (centred bold)
```

The label/value pairs are right-aligned with the value immediately left of its
bold label, so each line reads as one RTL phrase. Latin values (French stream
names, years) are **never** passed through the Arabic shaper.

### Bold, italic and underline contract

These three styles are **semantic**, not decorative. They must never be
substituted for one another or dropped. The full mapping:

| Where | Bold | Italic | Underline |
|---|---|---|---|
| Section heading | yes | — | — |
| Marks label `(15 points)` | yes | — | — |
| Global instruction line | yes | yes | — |
| Passage target word (Q4 referents, Q1A targets) | **yes** | — | **yes** |
| Paragraph reference `(§2)` on the item | — | — | — |
| Task number (`1.`) | yes | — | — |
| Task stem (the instruction wording) | yes | yes | — |
| Item letter (`a.`) | yes | — | — |
| Item text | — | — | — |
| Paragraph reference `(§2)` | — | — | — |
| Source note ("Adapted from…") | yes | yes | — |
| Table header cell | yes | — | — |
| Topic label (`Topic One:`) | yes | yes | **yes** |
| Notes heading | yes | — | — |
| Notes item | — | — | — |

Rules:

- **Underline appears in exactly two places**: a passage target word, and a
  topic label. Nothing else is underlined.
- **Bold + underline together** only on a passage target word. A target is
  never underlined alone.
- Item letters are bold; item text is never bold. This contrast is what makes
  the list scannable.
- A task stem is always bold *italic*, never bold alone.
- When a word is emphasised in the passage, only the word itself is affected —
  surrounding punctuation and the rest of the line keep their normal weight.

### pdfkit constraints worth knowing

- `underline` on a continued run underlines the **whole line width**. Word-scoped
  underlining therefore cannot use the normal text path: `richText` measures
  each word, packs lines, justifies them, and draws words at a pinned baseline.
- `underline: true` with `lineBreak: false` and **no** `width` produces a `NaN`
  coordinate and throws. Always pass the measured width.
- Arabic must be pre-shaped with `ArabicShaper`; pdfkit then draws it correctly
  right-to-left. **Do not reverse the shaped string** — that renders every glyph
  backwards. `arabic.test.ts` guards this.

## 4. Marks
Marks are **per-guide and computed** (`getGuide(grade).marks`), never hardcoded
in a renderer. As shipped, every grade uses the same split:

| Grade | Part One | Text Exploration | Writing | Umbrella (Part One) |
|---|---|---|---|---|
| 1am-4am (BEM) | 7 | 7 | 6 | n/a |
| 1as-3as (BAC) | 7 | 7 | 6 | 14 |

`assemble.ts` zero-pads to two digits for the BAC labels: `07 pts`, `14 pts`.
The BEM labels are unpadded: `7 pts`.

`validateCandidate` falls back to 7 (Part One) / 8 (Text Exploration) **only**
when `expectedMarks` is omitted; real totals always come from `guides.ts`.
Per-stream overrides (Foreign Languages 14/6, Literature 15/5, Scientific 15/5)
are specified in section 7 but are **not yet modelled per stream** in
`guides.ts` — every stream currently receives the same 7/7/6. That gap is
deliberately left visible rather than papered over.

## 5. Block model

`buildPaper(doc)` returns an ordered `PaperBlock[]`:

| Block | Emitted for |
|---|---|
| `masthead` | title, subtitle, meta (suppressed in the PDF; the Arabic header carries identification) |
| `sectionHead` | heading + marks |
| `instruction` | the "Read the text carefully..." line |
| `passage` | title, paragraphs, emphasis words to underline |
| `sourceNote` | the "Adapted from..." line |
| `task` | number, instruction, lead lines, lettered items, optional word list, optional table |
| `wordList` | a centred `a - b - c` list under an affix task stem |
| `table` | a task's table, rendered separately for pagination |
| `topic` | writing topic label, lines, notes |
| `colophon` | generator credit |

Emphasis words are collected in a **first pass** over all sections, because the
passage block is emitted before the tasks that name the words it must underline.

## 6. Prompt parsing

Generated prompts are flat newline-separated text in one of two shapes. Both
must render as lettered items:

```
1. first item          A. first item
2. second item         B. second item
```

- A free-standing line **before** any item is a lead-in, rendered under the stem.
- A free-standing line **after** an item continues that item.
- A line equal to the task instruction is dropped (the stem already shows it).
- A trailing dotted run (`→ ..........`) marks the item as an answer gap: the dots
  are stripped and re-rendered as a dotted leader.
- `(§2)` is a paragraph reference: it is pulled out of the text and reprinted
  inline after the item, so the stem stays clean.
- `"Word" (underlined)` names a passage target word to underline.

## 7. Referent items: pronouns only, with paragraph references

Question 4 ("Find what or who the underlined words in the text refer to") has two
hard rules, enforced in `src/lib/generate/referents.ts`.

### Rule 1 — the target must be a pronoun

The underlined word must be a **personal, demonstrative, relative,
interrogative or reflexive pronoun**:

| Category | Words |
|---|---|
| Personal (subject) | `i` `you` `he` `she` `it` `we` `they` |
| Personal (object) | `me` `him` `her` `us` `them` |
| Demonstrative | `this` `that` `these` `those` `such` `this one` `that one` |
| Relative | `who` `whom` `whose` `which` `that` `what` |
| Interrogative | `who` `whom` `whose` `which` `what` |
| Reflexive | `myself` `yourself` `himself` `herself` `itself` `ourselves` `yourselves` `themselves` |
| Possessive | `my` `your` `his` `its` `our` `their` `mine` `hers` `ours` `theirs` |

A word may belong to more than one class — `that` is both demonstrative and
relative, `who` is both relative and interrogative. The sets are independent.

### Rule 2 — the target must avoid subject repetition

The underlined word may instead be a **word or expression whose purpose is to
avoid repeating a subject already named in the text**:

| Sub-kind | Expressions |
|---|---|
| Paired reference | `the former` `the latter` `the first` `the second` `the third` |
| Additive reference | `also` `too` `as well` `as such` |
| Generic reference | `one` `ones` `the same` `such` `another` `others` `the others` |
| Textual substitution | `then` `there` `here` `so` |

Multi-word expressions are matched against the raw token stream, so `the former`
is preferred over a stray `the`. Subordinators that point *forward* are
excluded: `such as` and `the same as` introduce examples rather than substituting
for an earlier noun phrase, so they are invalid targets. Bare `such` is valid.

### Rule 3 — everything else is rejected

**Content words are invalid**, including adjectives and abstract nouns:
`honest`, `trust`, `curiosity`, `motivated`, `organise`, `school`. They satisfy
neither rule 1 nor rule 2: they have no noun-phrase antecedent and they do not
substitute for a repeated subject, so the item cannot be answered from the text
and is meaningless in context. A generator that emits them produces a broken
question even when every other rule passes.

`pickReferents(passage, count)` draws targets from the passage itself, in order
of first appearance and without repeats, so every target is guaranteed present.

### Rule 4 — every item carries its paragraph

The passage itself carries **no printed paragraph numbers** — the reference
appears only on the item, so the passage stays clean prose. Each referent item
prints the paragraph its word belongs to:

```
School is not only a place for lessons; it is where young people learn how to
live together. ...
Pupils who organise their time carefully usually remember their lessons better.

4.  Find what or who the underlined words in the text refer to.
    a.) It (§2) ……    b.) They (§1) ……    c.) Their (§4) ……
```

- Items run **two-up on one line**, separated by a wide gap. They fall back to
  one per line only when a pair would overflow the measure.
- The symbol is `(§N)` — U+00A7 SECTION SIGN inside parentheses, one-based.
- `N` is the paragraph containing the **first non-sentence-initial** occurrence,
  chosen so several items do not all collapse to `(§1)`.
- `resolveReferents` (`src/lib/export/paper.ts`) runs at **export** time, not
  generation time, because generation is a separate request that never sees the
  accepted passage. This means existing saved exams pick the behaviour up too.
- The target word in the passage is **bold + underlined**; the `(§N)` marker in
  the item is plain.

### Rule 5 — no duplicate chart

A referent task is fully expressed by its lettered `(§N)` items, so its
Word/Refers-to table is suppressed. Printing both repeats the same content.

## 8. Specifications by stream

From the master guide PDF. "Coefficient" and "Duration" are metadata; the task
selection rule is how many comprehension and text-exploration tasks the paper
carries.

### Foreign Languages Stream
Duration 3 hours, coefficient 5. Passage 150-200 words. Total 20 points
(Part 1: 14, Part 2: 6). **Select exactly 5 comprehension + 5 text exploration.**
*(Part 1 duration/section weighting is carried in `guide.streamInfo`; marks are
still 7/7/6 — see section 4.)*

### Literature and Philosophy Stream
Duration 2 hours, coefficient 3. Passage 120-150 words. Total 20 points
(Part 1: 15 = 7 comprehension + 8 text exploration, Part 2: 5).
**Select exactly 4 + 4.**

### Scientific and Technical Streams
Duration 2 hours, coefficient 2. Passage 120-150 words. Total 20 points
(Part 1: 15 = 8 comprehension + 7 text exploration, Part 2: 5).
**Select exactly 4 + 4.**

### Comprehension task pool (Section A)

Each row gives the official wording, the item constraint, and how the task is
rendered. "Gap" means the item ends in a dotted leader the student writes into.

| Task | Wording | Constraint | Rendering |
|---|---|---|---|
| 1A Text type | "The text is a..." / "The text is an extract from an email, a web article, or a newspaper article." | exactly 3 options | lettered items, no gap |
| 1B True/False | "Say whether the following statements are true or false." | 3-4 statements | lettered items; optional Statement/Answer chart with blank answer column |
| 1C True/False + correction | "Say whether the following statements are true or false and correct the false ones." | 3-4 statements | as 1B |
| 1D Multiple choice | "Write the letter that corresponds to the right answer." / "Choose the answer to complete each statement." | <=4 items, exactly 3 choices each | lettered items with choices inline |
| 2A Paragraph identification | "Identify the paragraph in which the following ideas are mentioned." | 2 ideas from 2 different paragraphs | lettered ideas; optional Idea/Paragraph chart |
| 2B Sentence ordering | "Put the following ideas in the order they appear in the text." | 3-4 ideas | lettered items |
| 2C Table completion | "Fill in the following table with information from the text." | exactly 4 items filled | table, answer column blank |
| 3 Direct/inferential | "Answer the following questions according to the text." | 3-4 questions, exactly 1 inference | lettered questions |
| 4 Cohesive markers | "Find who or what the underlined words refer to in the text." | 2-4 referents (section 7) | lettered items, each `(§N)` + gap; **no chart** |
| 5A Title | "Copy the title you think is the most appropriate." / "Give a title to the text." | 3 suggested titles, or open | lettered options |
| 5B General idea | "Choose the general idea of the text." / "Give the general idea of the text." | 3 options, or open | lettered options |
| 5C Discourse type | "The text is... a) descriptive b) narrative c) argumentative d) prescriptive." | only if one type dominates | lettered options |

### Text exploration task pool (Section B)

| Task | Wording | Constraint | Rendering |
|---|---|---|---|
| 1A Synonyms/antonyms | "Find in the text words or phrases that are closest in meaning to..." / "...opposite in meaning to..." | 2-3 items, paragraph numbers given | target words **bold+underlined** in the passage, `(§N)` + gap per item |
| 1B Matching table | "Match the following words with their corresponding synonyms / opposites / definitions." | 2-3 items | Word/Definition chart, answer column blank |
| 1C Definition match | "Find words in the text whose definitions follow:" | 2-3 items | lettered items with gaps |
| 2A Chart completion | "Complete the chart as shown in the example." | 1 solved example + 3-4 derived words | Word/Noun/Verb/Adjective chart, only the base word given |
| 2B Affix separation | "Divide the following words into roots and affixes." / "Give the opposites of the following words keeping the same root." | 3-4 words | **centred** `a - b - c` word list, then Prefix/Root/Suffix chart |
| 3A Sentence rephrasing | "Rewrite sentence B so that it means the same as sentence A." | 2-3 sentences | lettered sentences |
| 3B Sentence combination | "Combine each pair of sentences with one of the connectors provided. Make changes where necessary." | 2-3 pairs | lettered pairs |
| 3C Verb tense | "Give the correct form of the verbs in brackets." | 4 verbs in brackets | lettered sentences with bracketed verbs |
| 3D Question formation | "Ask questions which the underlined words answer." | max 2 questions | lettered items |
| 4A/4B/4C/4D Phonology tables | "Classify the following words according to..." | 3-4 words | classification chart, blank answer cells |
| 4E Silent letter | "Circle or write the silent letter in each of the following words." | — | lettered words |
| 4F Rhyming pairs | "Match the pairs that rhyme." | exactly 2 pairs | lettered pairs |
| 5A Gap fill with list | "Fill in the gaps with words from the list given." | 4 gaps / 4 words, or 4 gaps / 6 words | passage with `___` gaps, then Gap/Word chart |
| 5B Open gap fill | "Fill in the gaps so that the text makes sense." | 4 gaps, no list | passage with `___` gaps |
| 5C Paragraph reordering | "Reorder the following sentences to get a coherent passage." | 4 statements | lettered sentences |
| 5D Dialogue completion | "Imagine what A or B says, and complete the following dialogue." | 3 missing utterances | dialogue with gaps |

### Written expression (Part 2)

Topic 1 guided (notes provided) **or** Topic 2 free (no notes), 80-120 words.
Scoring: relevance, coherence, use of linguistic resources, excellence.

Rendering, exactly as printed:

```
Part Two: Written Expression.                       (05 points)
Choose only ONE of the following topics.              <- bold italic

Topic One:                                            <- bold italic, UNDERLINED
    <situation paragraph, justified, indented>

    Make the best use of the following notes:          <- bold, full sentence
        • note one
        • note two

Topic Two:                                            <- bold italic, UNDERLINED
    <situation paragraph>
```

- The topic label is the only underlined element in Part Two.
- Notes are a `•` bullet list under a bold sentence ending in a colon, not the
  older `Key words: a, b, c` form.
- BEM guides have a single topic (`singleTopic: true`), so `Topic One:` is the
  only label printed.

## 9. Passage grounding: every question must be answerable from the text

A task that names a word the student cannot find in the passage, or asks about
an event the passage never states, is broken no matter how well it follows the
official format. Grounding is therefore a cross-cutting rule, not a per-task
one.

### Rule 1 — vocabulary and morphology targets occur in the passage

Every word used as a target in a Part Two vocabulary or morphology task must be
present in the passage the student is given. Targets are drawn from the passage's
own content words (`passageVocabulary`), not from the unit corpus.

Matching tolerates regular inflections: target `friend` matches `friends`,
`friendly`, `friend's`. It does **not** use open-ended stemming — an unrelated
word must never satisfy the check.

### Rule 2 — referent targets occur in the passage

The underlined pronoun must occur in the passage, per section 7. When a passage
supplies no usable referent the item falls back to the unit corpus rather than
printing an empty item, and the fallback is reported rather than silent.

### Rule 3 — answer cells stay empty

In every task table, column 0 is given material; every column after it is the
student's answer and must be an empty string.

### What is mechanically enforced, and what is not

| Property | Enforced by | How |
|---|---|---|
| vocab/morphology target in passage | `src/lib/generate/grounding.ts` | `checkTaskLinkage` |
| referent target in passage | `src/lib/generate/grounding.ts` | `checkTaskLinkage` |
| answer cells empty | `src/lib/generate/grounding.ts` | `checkTaskLinkage` |
| **that the question is semantically answerable** | **prompt only** | `groundingRule` in `provider.ts` |

The last row is the honest limit. "Is the passage sufficient to *judge* this
statement?" is not decidable mechanically in the mock path; for LLM providers it
rests on the model obeying the grounding clause. Do not describe the grounding
module as proving answerability — it proves the referenced material is present.

### Which task families are grounded today

Grounding is per family, not global. Current state:

| Family | Grounded? | How |
|---|---|---|
| Part Two VOCABULARY | yes | targets are passage words; corpus-known ones preferred for a real answer key |
| Part Two MORPHOLOGY | yes | bases are passage words; row count follows the passage |
| Part One COHESIVE_MARKERS | yes | `pickReferents` runs on the passage |
| Part One QUESTIONS | **no** | still drawn from the unit corpus |
| Part One TRUE_FALSE | **no** | still drawn from the unit corpus |
| Part One PARAGRAPH_ID | **no** | paragraph numbers are not verified against the passage |
| Part One TITLE_OR_IDEA | **no** | n/a — the title task is open-ended |
| Part Two PHONOLOGY / GRAMMAR / DISCOURSE | **no** | still drawn from the unit corpus |

The ungrounded rows are the honest residual gap: an item about a statement the
passage never made is not answerable from the text, and no check catches it.
Closing them means deriving comprehension items from passage sentences (and
verifying PARAGRAPH_ID against real paragraph boundaries) — worth doing, but it
is a separate change with its own validation rules. Do not describe the exam as
fully passage-grounded until then.

### Full-exam generation must preserve this

`generateFullExam` (`src/lib/generate/full-exam.ts`) generates the passage
first and passes it as `groundingText` to every question generator, so a
one-click draft is bound by the same rules as a per-section draft. The full run
is **all-or-nothing**: any section failing validation aborts the whole run, so a
partially grounded exam never reaches the teacher.

### Stale alignment after edits

A passage can be changed after questions exist, which silently unlinks them.
The builder therefore asks before regenerating a passage or rewriting it once
questions are present, and a full run over an exam with content requires an
explicit `overwrite: true`.

Two further paths can unlink an exam and are checked rather than prompted:

- **Alternatives** are generated without the passage (only the primary set is
  grounded), and switching the passage alternative moves the ground under the
  questions. Every replacement re-runs `checkTaskLinkage` and warns when the
  result no longer fits.
- **Hand-editing the passage** raises a dismissible banner on both question
  stages. Client-side and ephemeral; it re-arms on the next edit.

Known limit: replacing a passage *alternative* is checked for lexical grounding
only, so it will not catch a comprehension item whose claim is absent from the
text (see the table above).

## 10. Paper format rules

Set by direct user instruction on 2026-10-11, from a review of the rendered
exam. These are format rules, not preferences: the official Algerian papers do
not vary on them.

### 10.1 No passage title unless the teacher opts in

The official papers print the passage with no title. Every generated text used to
carry one.

- `showTitle` on the TEXT section content, **default false**, toggled in the Text
  stage (`builder.showPassageTitle`).
- `assemble.ts` gates `ExportSection.text.title` on the flag. Preview, PDF and
  DOCX follow from the content model, so they cannot disagree.
- The title is still generated and stored, so turning the toggle on needs no
  regeneration.

### 10.2 Paragraphs are separated by whitespace, never indented

No first-line indent on passage paragraphs. The separation between them is
vertical space:

| Surface | Value |
|---|---|
| PDF | `PARA_GAP` in `pdf.ts` (line units) |
| DOCX | `PASSAGE_GAP_AFTER` in `docx.ts` (twentieths of a point) |
| Preview | `mt-4` with `first:mt-0` |

The passage stays justified. Tune the two constants together against a real
render; they express one rhythm.

### 10.2a Line spacing and the label/text gap

Set against the Ministry reference sheet on 2026-10-11: the previous rhythm read
as double-spaced, and option labels sat far from their text.

| Property | Value | Note |
|---|---|---|
| PDF passage lines | `LINE_HEIGHT` = `BODY * 1.14` | was `1.32` |
| PDF item advance | `ITEM_ADVANCE` = `BODY * 1.22` | was `1.5` |
| DOCX line spacing | `LINE_SPACING` pinned | left to Word it followed the substituted font's metrics, so DOCX drifted from PDF |
| Label → text | **exactly one space**, all three surfaces | DOCX used a 0.22in tab stop; the preview used a 1.25rem label box plus a 0.5rem flex gap |

The PDF was already correct on the label gap; DOCX and the preview were the
offenders. Verify with `npx tsx scripts/render-check.ts`, then unzip the DOCX and
confirm there are no `<w:tab/>` elements.

### 10.3 Times New Roman

| Surface | Face |
|---|---|
| PDF | `public/fonts/TimesNewRoman.ttf` (verified: family name table reads "Times New Roman"), with Times-Bold/Italic/BI for bold and italic |
| DOCX | `FONT` in `docx.ts`, applied by the single `t()` run factory |
| Preview | `@font-face` "ExaaiExamFont" scoped to `.print-block`, from the same TTF |

Two traps: **no DOCX run may be built outside `t()`** (DOCX previously set no
font at all and rendered Calibri), and **Arabic runs must bypass `t()`** and name
Amiri, because Times New Roman has no Arabic glyphs. The app UI keeps its own
sans stack; only the paper is Times New Roman.

### 10.4 Choice labels are lowercase `a)`, bold

Never `a.` and never `A.` (previously printed as `A.)`, because the PDF appended
its own parenthesis to a label that already ended in a period).

- `letterLabel()` in `paper.ts` emits `a)`, `b)`, `c)`, `d)` and is the single
  source; renderers print `item.label` **verbatim** and never append a separator.
- The label is bold on all three surfaces.
- Exactly **one space** separates the label from its text (see 10.2a).
- `validateCandidate`'s `choiceCount` check matches `/^[a-d]\)/`, so generated
  options are held to this form automatically.

### 10.5 Tables are allowlisted, never default

**Part A never carries a table.** True/False and paragraph matching print the
sentences only; the answer key lives on a separate sheet, which is what 90% of
teachers use (this sheet is not the one students write on).

**Part B carries a table only for inherently tabular tasks:**

| Task | Table |
|---|---|
| Morphology — roots, prefixes, suffixes | yes |
| Phonology — classification of final `-s` / `-ed`, syllable work | yes |
| Vocabulary — meaning, synonyms | **no** |
| Discourse — gap fill | **no** |
| Grammar | **no** |

`src/lib/export/tables.ts` is the single authority (`taskHasTable`,
`rulePrescribesTable`), consumed by generation, validation and rendering.

Three consequences to keep in mind:

1. **Validation enforces both directions.** A missing table where one belongs is a
   failure; so is a table where none does. The second case is the important one —
   it is what stops tables creeping back.
2. **Rendering strips disallowed tables.** Exams saved before this rule still hold
   a table in the DTO, and `paper.ts` drops it at render time. There is no data
   migration (user decision, 2026-10-11: strip, don't migrate).
3. **The guide flags were realigned** so data and rule agree: Part One
   `tableRequired` cleared, VOCABULARY and DISCOURSE set to false, PHONOLOGY set
   to true. Adding a skill to `TABULAR_SKILLS` is a spec change — update this
   table in the same commit.

### 10.6 Official table style

From the user's reference sheet:

- table **centred**, narrower than the text block (`TABLE_MAX_WIDTH` in PDF,
  `TABLE_WIDTH_PCT` in DOCX) — not full content width;
- header row **bold italic, centred** (`prefix | root | suffix`);
- the word list **centred above** the table, separated by hyphens;
- task stem in the `N- {instruction}` form, bold italic;
- answer cells empty, with a fixed visible height so empty rows still show.

### 10.7 Prompt-level enforcement

The same rules appear in the generation prompts (`provider.ts`), because the
prompt is what the model reads:

- `PART_ONE_TABLE_RULE` — Part One never carries a table, even when the rule
  object says `tableRequired`;
- `PART_TWO_TABLE_RULE` — tables only for morphology and phonology;
- `CHOICE_LABEL_RULE` — lowercase `a)`–`d)`, one per line.

These are instructions; `export/tables.ts` and `validateCandidate` are the
enforcement. A model that ignores the prompt still fails validation.

## 11. Verification

```bash
npm test                # every test, incl. paper, arabic, referents, grounding, full-exam
npm run typecheck       # rm -f tsconfig.tsbuildinfo && tsc --noEmit
npm run build           # types enforced in the build path too
```

To eyeball a real render without a database:

```bash
npx tsx -e "..."        # assemble a generated exam, call renderPdf, rasterize
```

`src/lib/export/paper.test.ts` is the executable version of this document: it
asserts letter labelling, lead-in handling, gap detection, emphasis collection,
passage splitting, table emission and answer non-leakage. If a layout rule above
changes, that test is what should fail first.

`src/lib/export/arabic.test.ts` guards the Arabic shaping contract, in
particular that the shaped string is not reversed.

`src/lib/export/full-exam-paper.test.ts` guards that an exam persisted by a
full run renders through `buildPaper` identically, for both the `bac` and `bem`
layouts, and that no stored answer reaches a block.

`src/lib/generate/grounding.test.ts` and `src/lib/generate/full-exam.test.ts`
guard section 9: the linkage rules across all seven grades, determinism per
exam id, and the BEM single-topic case.

`src/lib/generate/referents.test.ts` guards the two referent rules of section 7
(pronoun class, repetition-avoiding substitute), the rejection of content words,
and the paragraph lookup.

`src/lib/generate/chain.test.ts` guards section 12.3-12.4: chain parsing and
resolution, the advance policy (never advance past auth or validation), and a
pin on the dead `meta-llama` default. It is pure functions over env-shaped input
and makes **no network calls** — that holds for the whole suite.

`src/lib/generate/provider.test.ts` asserts the wire fields of section 12.3 at
the transport boundary: `reasoning_effort` is sent for gpt-oss and **absent**
otherwise, `max_tokens` is always generous, and the temperature split (0.7 prose
/ 0.2 structured) reaches the request without leaking into the prompt.

`src/lib/generate/mock.test.ts` guards section 12.1-12.2 on the mock provider.
The mock is the offline test double: if it drifts from the real contract, every
test that exercises a validator rule through the mock silently stops covering
it.

## 12. Passage shape and model roster

Set by user instruction and by live measurement on 2026-10-11.

### 12.1 One topic across every paragraph

A generated passage opened on advertising, moved to ancient monuments, then
traditional music, then archaeologists. Four paragraphs, four subjects: the
result reads as four unrelated texts stapled together, and the questions have no
stable referent.

Enforced in two places, because one alone is not enough:

| Half | Where | What it does |
|---|---|---|
| Instruction | `coherenceNote()` in `provider.ts` | States the paragraph count, names the topic, and requires the arc lead → aspects → close |
| Mechanical | `checkTopicAnchoring()` in `grounding.ts` | Rejects any paragraph that mentions neither the topic nor a teacher keyword |

**What this guarantees: anchoring, not coherence.** Every paragraph names the
topic somewhere. It does **not** prove a paragraph develops it — one token
mentioning the topic does not make the rest of the paragraph on-subject. Do not
describe the passage as fully coherent on this evidence.

Two deliberate exemptions, both to avoid false rejections on good passages:

- **Short paragraphs** (under 12 words) are skipped. A one-sentence closer that
  merely refers back is normal prose, not drift.
- **Matching is by whole phrase**, not stem or prefix, so "digital literacy"
  cannot be anchored by a paragraph that merely contains "digital".

### 12.2 Paragraph count is a teacher choice: 3 or 4, default 3

- `paragraphCount` on `ExamConfig` (`Int @default(3)`), chosen in Parameters
  (`builder.paragraphs`), validated by `validateConfigInputs`.
- Only **3** and **4** are offered. The passage arc is lead → aspects → close;
  other counts do not produce a well-formed paper.
- `normaliseParagraphCount()` clamps anything else to 3 rather than throwing.
  Silently turning a teacher's explicit choice into a hard error would be worse
  than the default.
- `validateCandidate("TEXT", ...)` enforces the count **exactly** when the caller
  passes it: a 4-paragraph passage when 3 was asked for is a different artefact,
  not a near miss. Callers with no teacher choice (REWRITE, alternatives) pass
  nothing and are not affected.

### 12.3 The model roster churns; verify before trusting it

Measured against live keys on 2026-10-11:

- Groq free plan serves three chat models: `openai/gpt-oss-120b`,
  `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`. Every `meta-llama/*` chat model was
  **removed on 2026-08-16**. `groq.ts` shipped defaulting to
  `llama-3.3-70b-versatile`, which fails for every free key.
- **gpt-oss is a reasoning model and returns EMPTY content without a reasoning
  cap.** With `response_format: json_object`: 0/6 requests succeeded uncapped
  (Groq reported `Failed to validate JSON`), 6/6 with `reasoning_effort: low`
  at ~25 reasoning tokens. `chain.ts` applies this automatically for `gpt-oss`
  model IDs. The transport must always send a generous `max_tokens`.
- OpenRouter `:free` is shared-capacity and unreliable in practice: the same
  model succeeded and failed across identical requests minutes apart. It is a
  fallback, never a primary.
- `response_format` is honoured by Groq and NVIDIA but not reliably elsewhere —
  Gemma on OpenRouter returns a ```json fence even when asked. `parseLooseJson`
  salvages that rather than failing a whole exam.

### 12.4 What a live free-tier run actually exposed

Everything above was verified against a live Groq key, not assumed. Running a
real full exam found four defects that no unit test had:

| Failure seen live | Cause | Fix |
|---|---|---|
| `AI output missing text candidates` | gpt-oss returned a **bare top-level array**, not `{"candidates":[...]}` | `candidateList()` accepts either |
| `AI output missing task sets` | Same, for the `sets` schema | Key is resolved **per call site**, never guessed |
| Every Part One task carried a table | Told tables are "never" used, the model still emitted one-row tables | Rule now says omit the `table` field **entirely** |
| 429 on most sections | Three sections fired concurrently, each carrying the full passage, over Groq's 8000 TPM limit | Phase B is **sequential** |

The `candidates`/`sets` split is the subtle one: hardcoding a single wrap key
"fixed" the passage and then made Part One worse, because a bare array was
wrapped as `candidates` and the `sets` lookup still missed.

### 12.5 The passage is the reliable part; throughput is the binding constraint

With the above fixed, the passage and Text Exploration generate cleanly against
the live model, and the validator catches real content problems in Part One.

**Throughput, not correctness, is what fails.** One full exam costs roughly
7K tokens against Groq's free 8000 tokens-per-minute: **fewer than two exams per
minute**, so back-to-back runs 429 regardless of code quality. A run that dies
on 429 is a capacity signal, not a defect — do not "fix" it by changing prompts.

Remaining known gaps on the free tier, stated rather than hidden:

- Groq's own `json_validate_failed` (HTTP 400) occurs on some Part One requests.
  The `failed_generation` payload is returned by the provider, not by us.
- Prompt adherence is imperfect: word count drifts outside the ±20% band, and
  item counts occasionally mismatch. The validator rejects these rather than
  shipping them, which is the intended behaviour.

### 12.6 Diagnose by shape, not by guess

`shapeError()` names the keys the model actually returned and the list length.
"A missing candidates" is identical for a prose reply, a wrong key, and two
candidates instead of three — three different bugs with three different fixes.

### 12.7 One repair attempt, bounded

`repairPassage()` in `full-exam.ts` allows exactly **one** corrective call, and
only for the passage, carrying the validator's own issue strings back to the
model verbatim.

- Different from `withRetry()`, which only helps with *transport* failures. A
  validation failure means the model answered and was wrong; re-rolling the same
  prompt at the same temperature reproduces the same mistake.
- Bounded at one because a prompt that must satisfy a validator becomes a
  conversation, and conversations cost more tokens than they save on a free tier.
- When the repair fails, the **original** issues are returned, never the
  repair's downstream symptom.
