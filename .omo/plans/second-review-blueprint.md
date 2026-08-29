# Exaai — Second Review Implementation Blueprint

**Source:** `Exaai_Second_Review_Developer_To_Do_List_Color_Coded.pdf`  
**Status:** Analysis complete, ready for phased implementation  
**Current state:** All 70 tests pass, tsc clean, build compiles (post Phase 1/2)

---

## Requirement Summary

| # | Area | Priority | Items |
|---|------|----------|-------|
| 1 | Login | SIDE REMARK | Password show/hide eye icon |
| 2 | Parameters | CRITICAL | Length options (120–150 / 150–200), Difficulty dropdown |
| 3 | Text Generation | CRITICAL | Paragraphs, alternatives flow, source citations, source dropdown, box sizing |
| 4 | Part One | CRITICAL | Exact guide wording, tables, task-specific rules, teacher rules, counts, AI rule redesign |
| 5 | Text Exploration | CRITICAL | Wider unit theme, tables |

---

## Phase 1 — Login & Parameters (Independent, Low Risk)

### 1.1 Login: Password Visibility Toggle
**Files:** `src/app/login/page.tsx`  
**Changes:**
- Add `showPassword` state
- Toggle `type="password" | "text"` on eye icon click
- Use `Eye` / `EyeOff` from lucide-react (already imported in builder)
- Update `Input` component if needed (currently no `type` prop override support)

**Acceptance:** Clicking eye reveals/hides password; persists during typing.

---

### 1.2 Parameters: Length Options + Difficulty Dropdown
**Files:** `src/components/builder/parameters-stage.tsx`, `src/lib/guide.ts`, `src/data/guides.ts`, `src/app/api/catalog/route.ts`  
**Changes:**

#### Length Options (CRITICAL)
- Current: `150` | `250` words (hardcoded in parameters-stage lines 196-199)
- Required: `120–150` | `150–200` words (ranges, not exact)
- Guide `lengthOptions` by level:
  - Middle: `[120, 150]` (already correct in guides.ts)
  - Secondary: `[120, 150, 200]` (already correct in guides.ts)
- **Implementation:**
  - Update `parameters-stage.tsx` to read `guide.lengthOptions` dynamically
  - Display as range labels: `"120–150 words"` / `"150–200 words"`
  - Store selected length as number (lower bound of range? or exact target?)
  - Update `validateConfigInputs` in guide.ts (already fixed in Phase 2 to use `guide.lengthOptions`)

#### Difficulty Dropdown (CRITICAL)
- New field in `ExamConfigDto`: `difficulty?: "standard" | "harder" | "simpler"` (or similar enum)
- Controls:
  - Vocabulary difficulty (word choice complexity)
  - Grammar-structure complexity (sentence structure, clause density)
- **Where it flows:**
  - `ExamConfigDto` → `GenContext` → providers (`mock.ts`, `openai.ts`, `groq.ts`)
  - Mock: adjust sentence selection, word complexity via seeded RNG
  - OpenAI/Groq: include in prompt instructions
- **UI:** Add after Length dropdown in parameters-stage

**Acceptance:** Length shows ranges from guide; Difficulty dropdown appears and affects generated text complexity.

---

## Phase 2 — Text Generation Core (High Impact, Touch Providers)

### 2.1 Proper Paragraphs in Generated Texts
**Files:** `src/lib/generate/mock.ts`, `src/lib/generate/openai.ts`, `src/lib/generate/groq.ts`, `src/lib/generate/index.ts`  
**Changes:**

#### Mock Provider (`mock.ts` → `generateText`)
- Current: Single paragraph (space-joined sentences)
- Required: Multiple coherent paragraphs (3–5 for typical length)
- **Implementation:**
  - Split sentence array into paragraph groups (e.g., 3–4 sentences per paragraph)
  - Insert `\n\n` between paragraphs
  - Ensure each paragraph has topical coherence

#### OpenAI/Groq Providers
- Update prompts to explicitly request "3–5 well-structured paragraphs separated by blank lines"
- Parse response: if JSON contains `text`, split on `\n\n` or use as-is if already paragraphed

**Acceptance:** All generated texts display with visible paragraph breaks.

---

### 2.2 Alternatives Flow: "Generate Another Text" → Alternative Box
**Files:** `src/components/builder/text-stage.tsx`, `src/components/builder/builder.tsx`, API route `src/app/api/exams/[id]/generate/route.ts`  
**Current behavior:** `onGenerate` replaces the current text directly  
**Required:** New version goes to alternatives panel; teacher explicitly selects to replace

**Changes:**
- `onGenerate` in builder.tsx: instead of replacing `section.text`, add to `section.candidates`
- TextStage already has alternatives UI (lines 106-154) — ensure "Regenerate" button uses this flow
- Remove/replace "Regenerate" button behavior: should generate new candidate, not replace current

**Acceptance:** Clicking "Generate Another Text" adds to alternatives carousel; current text unchanged until "Select" clicked.

---

### 2.3 Make Harder / Simpler → Alternative Box First
**Files:** `src/components/builder/text-stage.tsx`, `src/components/builder/builder.tsx`, generation providers  
**Current behavior:** `onRewrite("simpler"|"harder")` likely replaces directly  
**Required:** Modified version appears in alternatives panel first; teacher chooses replacement

**Changes:**
- `onRewrite` in builder.tsx: call provider rewrite, add result to `section.candidates` (new rewrite candidate type)
- TextStage alternatives UI: support rewrite candidates (different from regenerate candidates)
- Or: create separate "Rewrite Alternatives" panel

**Acceptance:** "Simplify" / "Make harder" buttons add modified versions to alternatives; original preserved.

---

### 2.4 Source Citation Obligatory
**Files:** `src/lib/generate/mock.ts`, `openai.ts`, `groq.ts`, `index.ts`, `src/types/index.ts`, `src/components/builder/text-stage.tsx`, export (`assemble.ts`)  
**Current:** `SourceDto` exists (line 63-71 in types), `exam.sources` array, but generation doesn't populate it consistently  
**Required:** Every generated text MUST have a source citation

**Changes:**
- **Mock:** Generate source from theme corpus (e.g., "Adapted from: [theme] corpus")
- **OpenAI/Groq:** Add to prompt: "Include a source citation in the response"
- **Types:** Ensure `SourceDto` is attached to `ExamDto.sources` on text generation
- **TextStage:** Display source citation below text (already shows `adaptationNote` at line 59-61)
- **Export:** Include source in PDF/Word (assemble.ts already has sources)

**Acceptance:** Every text generation produces a source; visible in UI and export.

---

### 2.5 Multiple Sources Dropdown
**Files:** `src/components/builder/text-stage.tsx`, `src/types/index.ts`  
**Current:** `exam.sources` is array but UI shows only first (`exam.sources[0]`)  
**Required:** Dropdown under text to select which source to cite

**Changes:**
- TextStage: if `exam.sources.length > 1`, render dropdown to select active source
- Selected source determines `adaptationNote` display and export citation
- Store selected source index in `ExamConfig` or section metadata

**Acceptance:** When multiple sources exist, dropdown switches displayed citation.

---

### 2.6 Text Box Sizing: Original & Alternative Same Dimensions, Full Text Visible
**Files:** `src/components/builder/text-stage.tsx`  
**Current:** Original uses `Textarea min-h-[280px]` (line 97); Alternative uses `line-clamp-5` (line 145) — truncated  
**Required:** Both boxes same height, full content visible (scroll if needed)

**Changes:**
- Alternative preview: replace `line-clamp-5` with `Textarea` (read-only) or `div` with `max-h-[280px] overflow-y-auto`
- Match dimensions exactly: `min-h-[280px]`, same padding/font
- Ensure no content clipping

**Acceptance:** Original and alternative text areas visually identical; full text scrollable.

---

## Phase 3 — Part One (Reading Comprehension) Overhaul

### 3.1 Redesign AI-Facing Exam Guide Rules (Core Solution)
**Files:** `src/data/guides.ts`, `src/lib/guide.ts`, `src/lib/generate/mock.ts`, `openai.ts`, `groq.ts`, `provider.ts`  
**Current:** Guide rules are split across `partOne` (array of `PartOneRule`) and generation logic is hardcoded in providers  
**Required:** Structured rule system covering task type, exact wording, item count, marks, order, stream differences, required tables, formatting, teacher-standard practices

**Implementation — Data Layer (`guides.ts`):**
- Extend `PartOneRule` with:
  - `exactWording?: string` — official guide wording
  - `tableRequired?: boolean` — whether this task must render a table
  - `itemCount?: number` — exact statements/questions
  - `streamVariants?: Record<string, Partial<PartOneRule>>` — per-stream overrides
  - `teacherStandard?: string` — agreed teacher practices not in official guide

- Create `TaskRuleSet` for each grade/stream combination (or compute dynamically)

**Implementation — Provider Layer:**
- Mock: `generatePartOnePrimary` reads enhanced rules, enforces exact wording, item counts, table generation
- OpenAI/Groq: Pass structured rules in prompt; parse JSON with table field

**Acceptance:** AI receives complete rule specification; output matches guide exactly.

---

### 3.2 Exact Wording per Exam Guide
**Files:** `src/data/guides.ts` (rule definitions), providers  
**Required:** Task instructions use official guide wording where prescribed

**Implementation:** Populate `exactWording` in each rule; providers use it verbatim in `instruction` field.

---

### 3.3 Tables: Generate Actual Tables When Required
**Files:** `src/lib/generate/mock.ts`, `openai.ts`, `groq.ts`, `src/components/builder/tasks-stage.tsx`  
**Current:** Tables supported in `TaskDto.table` (line 31 types), rendered in tasks-stage (lines 211-235)  
**Required:** Whenever a task requires a table per guide, generate it

**Implementation:**
- Add `tableRequired: true` to relevant rules (TRUE_FALSE, PARAGRAPH_ID, COHESIVE_MARKERS often need tables)
- Mock: Already generates tables for alternates (FILL_CHART); extend primary to include tables where guide requires
- OpenAI: Include table structure in prompt and parsing
- UI: Already renders tables — verify column alignment

---

### 3.4 Task-Specific Rules (To Be Supplied Later)
**Files:** `src/data/guides.ts` (placeholder structure)  
**Required:** Some questions need individually redesigned explanations/rules for reliable AI reproduction

**Implementation:** Add `taskSpecificRules?: string[]` to `PartOneRule`; providers read and include in prompts.

---

### 3.5 Teacher-Standard Rules (To Be Determined Later)
**Files:** `src/data/guides.ts`  
**Required:** Agreed task-design practices not explicitly in official guide

**Implementation:** Add `teacherStandardRules?: string[]` to `PartOneRule` or guide-level; providers include.

---

### 3.6 Correct Statement/Question Counts
**Files:** `src/data/guides.ts` (rule constraints), providers  
**Current:** Constraints exist (`maxStatements`, `maxQuestions`) but may not match official counts  
**Required:** Every task follows required structure (exact counts per guide)

**Implementation:** Audit each rule's constraints against official guide; update `constraints` values.

---

### 3.7 Alternative Tasks — DISCUSS Before Implementing
**Files:** N/A (design discussion)  
**Required:** Current alternatives too constrained by text; proposed solution exists  
**Action:** Schedule discussion; defer implementation until consensus.

---

## Phase 4 — Text Exploration (Part B)

### 4.1 Broader Content: Wider Unit Theme
**Files:** `src/lib/generate/mock.ts` (`generateTextExploration`), `openai.ts`, `groq.ts`  
**Current:** Tasks strictly constrained to selected reading text  
**Required:** Tasks may draw from broader theme/content of selected unit, while remaining appropriate to level/skill/Ministry requirements

**Implementation:**
- Mock: In `generateTextExplorationPrimary`, allow vocab/grammar/discourse to use theme corpus beyond passage text
- OpenAI: Update prompt: "Tasks may draw from the broader unit theme, not only the passage text"
- Ensure Ministry alignment: skill categories and marks unchanged

---

### 4.2 Tables Rendered When Required
**Files:** `src/data/guides.ts` (textExploration skills), providers, `tasks-stage.tsx`  
**Current:** WORD_FAMILY already generates tables (mock line 336-339); others don't  
**Required:** Whenever a Text Exploration task requires a table, generate it

**Implementation:**
- Add `tableRequired?: boolean` to `SkillRule`
- Mock: Generate table for vocabulary (matching), morphology (already), discourse (gap fill → table)
- OpenAI: Include in prompt

---

## Implementation Order & Dependencies

```
Phase 1 (Parallel, Independent):
├── 1.1 Login eye icon
├── 1.2 Parameters: Length options (dynamic from guide)
└── 1.2 Parameters: Difficulty dropdown + GenContext threading

Phase 2 (Sequential, Core Generation):
├── 2.1 Paragraphs in generated text (all providers)
├── 2.2 Alternatives flow: Regenerate → alt box
├── 2.3 Rewrite flow: Harder/Simpler → alt box
├── 2.4 Source citations (all providers + types + UI + export)
├── 2.5 Multiple sources dropdown (UI)
└── 2.6 Text box sizing parity (UI)

Phase 3 (Part One — Rule System Redesign):
├── 3.1 Extend PartOneRule with structured fields
├── 3.2 Populate exact wording for all rules
├── 3.3 Add tableRequired flags + implement table generation
├── 3.4 Add taskSpecificRules placeholder
├── 3.5 Add teacherStandardRules placeholder
├── 3.6 Audit/correct statement/question counts
└── 3.7 Schedule alternative-tasks discussion

Phase 4 (Text Exploration):
├── 4.1 Broader theme content in providers
└── 4.2 Add tableRequired to skills + implement
```

---

## Testing Strategy

| Area | Test Approach |
|------|---------------|
| Login | Visual check; existing auth tests cover login |
| Parameters | Unit test: length options from guide; difficulty in GenContext |
| Text Gen | Mock test: paragraph breaks; alternative flow integration test |
| Part One | Mock test: exact wording, item counts, tables; guide.test.ts extend |
| Text Exploration | Mock test: broader theme vocab, tables |
| All Providers | Facade tests: mock/openai/groq return correct shapes |

**New test files needed:** May extend existing `mock.test.ts`, `guide.test.ts`, `facade.test.ts`

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OpenAI prompt changes break parsing | Medium | High | Robust `parseTaskSets` with fallbacks; schema validation |
| Difficulty parameter UX confusion | Low | Medium | Clear labels, help text, default "standard" |
| Alternative flow UX regression | Medium | Medium | Integration test covering full replace cycle |
| Guide rule migration breaks existing exams | Low | High | Versioned guides; existing exams use stored guideVersion |
| Source citation quality (mock) | Low | Low | Acceptable fallback: "Adapted from curriculum corpus" |

---

## Files to Modify (Summary)

| File | Phases |
|------|--------|
| `src/app/login/page.tsx` | 1.1 |
| `src/components/builder/parameters-stage.tsx` | 1.2 |
| `src/components/builder/text-stage.tsx` | 2.2, 2.3, 2.4, 2.5, 2.6 |
| `src/components/builder/builder.tsx` | 2.2, 2.3 |
| `src/components/builder/tasks-stage.tsx` | 3.3, 4.2 |
| `src/data/guides.ts` | 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2 |
| `src/lib/guide.ts` | 1.2 |
| `src/lib/generate/index.ts` | 1.2, 2.1, 2.4 |
| `src/lib/generate/mock.ts` | 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.1, 4.2 |
| `src/lib/generate/openai.ts` | 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.1, 4.2 |
| `src/lib/generate/groq.ts` | 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.1, 4.2 |
| `src/lib/generate/provider.ts` | 2.1, 2.4 |
| `src/types/index.ts` | 1.2, 2.4 |
| `src/lib/export/assemble.ts` | 2.4 |

---

## Next Step

Proceed with **Phase 1** (Login eye icon + Parameters length/difficulty) — independent, low-risk, validates the parameter→generation thread for Difficulty.