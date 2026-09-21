# Phase 3.1 Implementation Learnings

## Summary
Implemented Phase 3.1 of the Exaai Second Review blueprint: Redesigned AI-facing exam guide rules for Part One (Reading Comprehension).

## Changes Made

### 1. Extended Interfaces in `src/data/guides.ts`
- **PartOneRule**: Added `exactWording`, `tableRequired`, `itemCount`, `streamVariants`, `taskSpecificRules`, `teacherStandardRules`
- **SkillRule**: Added `tableRequired`

### 2. Populated Enhanced Fields on All Existing Rules
- **BEM (4am) PartOne**: 5 rules with exactWording, itemCount (4 for TRUE_FALSE/QUESTIONS/PARAGRAPH_ID/COHESIVE_MARKERS, 1 for TITLE_OR_IDEA), tableRequired (true for TRUE_FALSE, PARAGRAPH_ID, COHESIVE_MARKERS)
- **Bac foreign_languages**: 5 rules (same structure as BEM)
- **Bac literature_philosophy**: 4 rules (no TITLE_OR_IDEA), itemCount varies (QUESTIONS=3, COHESIVE_MARKERS=3)
- **Bac sciences**: 4 rules (no TITLE_OR_IDEA), itemCount varies (QUESTIONS=3, COHESIVE_MARKERS=3)
- **Text Exploration skills**: MORPHOLOGY has tableRequired=true, others false

### 3. Updated Mock Provider (`src/lib/generate/mock.ts`)
- `generatePartOnePrimary` now uses `itemCount` from rules instead of `constraints.max*`
- Generates tables for `tableRequired` tasks (TRUE_FALSE, PARAGRAPH_ID, COHESIVE_MARKERS)
- Uses `exactWording` for instruction field

### 4. Updated AI Providers (`src/lib/generate/openai.ts`, `groq.ts`)
- Pass structured rule info including exactWording, tableRequired, itemCount, constraints
- Updated prompts to request table field for tableRequired tasks

### 5. Updated Provider Parser (`src/lib/generate/provider.ts`)
- `parseTaskSets` now parses `table` field from AI responses

### 6. Added Tests (`src/lib/generate/mock.test.ts`)
- Test for enhanced fields population
- Test for exactWording enforcement
- Test for correct itemCount per task family
- Test for table generation on tableRequired tasks
- Tests for stream-specific itemCounts (foreign_languages, literature_philosophy, sciences)
- Test for SkillRule tableRequired on MORPHOLOGY

### 7. Fixed Theme Data (`src/data/themes.ts`)
- Added 4th `trueFalse` item to all 9 themes (was 3, guide rules require 4)
- Added 4th `questions` item to all 9 themes (was 3, guide rules require 4 for BEM/foreign_languages)

## Verification
- All 139 tests pass
- `npm run build` succeeds
- `npx tsc --noEmit` only shows pre-existing CSS module error (unrelated)

## Key Design Decisions
1. `exactWording` mirrors `instruction` for backward compatibility; can diverge in future for official guide wording
2. `itemCount` is the single source of truth for item counts (replaces scattered `constraints.max*`)
3. `tableRequired` drives table generation in both mock and AI providers
4. `streamVariants`, `taskSpecificRules`, `teacherStandardRules` are placeholder arrays for Phase 3.4/3.5
5. Theme data was extended to match guide rule requirements (4 items each for TRUE_FALSE and QUESTIONS)

## Constraints Respected
- No DB schema changes
- No new npm dependencies
- No `as any` / `@ts-ignore`
- BEM 7 marks, Bac 7 marks preserved
- BEM singleTopic writing (6 marks) preserved
- Bac two-topic writing preserved
- Middle-school unit data unchanged
- Alternative task generation logic unchanged (Phase 3.7 discussion item)
