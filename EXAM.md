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

## 9. Verification

```bash
npm test                # 239 tests, incl. paper, arabic and referents
npx tsc --noEmit        # the only typecheck
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

`src/lib/generate/referents.test.ts` guards the two referent rules of section 7
(pronoun class, repetition-avoiding substitute), the rejection of content words,
and the paragraph lookup.