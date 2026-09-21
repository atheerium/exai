# second-review — Second SaaS Review Blueprint

## TL;DR (For humans)
**What you'll get:** All 19 CRITICAL + 1 SIDE REMARK from `docs/Exaai_Second_Review_Developer_To_Do_List_Color_Coded.pdf` implemented end-to-end (auth eye, 120–150/150–200 + difficulty, paragraphs, alternative-box workflow, obligatory + multi-source, box parity, exact wording + counts, tables end-to-end, guide hardening, exploration broadening). Blocked inputs (task-specific, teacher-standard, alt-task proposal) become typed placeholders awaiting teacher supply.
**Why:** Second review says first-gen text quality = disproportionate perceived value; fixes reduce regen/AI cost and unblock teacher acceptance.
**NOT:** No SMTP mailer, no new auth flows, no invented pedagogy, no prisma migrate.
**Effort:** ~7 waves. **Risk:** Low — mostly UI + validation + render parity.

## Scope
IN: login/register/reset eye (`pages`), parameters length/difficulty wiring, text generation paragraphs + alternative-box + source, part-one/B exact wording/counts/tables, exploration broader theme, guide framework hardening, preview/pdf/docx table rendering.
OUT: SMTP transport, task-specific/teacher-standard rule contents (placeholders only), alternative-task pedagogy until proposal discussed.

## Verification strategy
- Tests-after per wave (extend 6-file runner via `npm test` : `node --import tsx --test`), no new harness
- `npm run build` must pass
- Manual: builder parity at 200 words, source dropdown with 2 sources, PDF/DOCX tables visible

## Todos
### W1 — Auth eye polish
Refs: `src/app/login/page.tsx:16-19,72,78-87` (done), `src/app/register/page.tsx:73`, `src/app/reset-password/page.tsx:104,108`
Accept: eye toggle on register + reset-password (both fields), `type=button` + aria-label on all toggles, no submit side-effect. QA: click toggles text↔password, form still submits.

### W2 — Text boxes parity
Refs: `src/components/builder/text-stage.tsx:109-176`
Accept: original Textarea and alternative preview share min-h-[280px], same text size/leading, full whitespace-pre-wrap, scroll not clip. Alt browsing doesn't clear. QA: 200-word text fully visible in both boxes.

### W3 — Source obligatory + dropdown robustness
Refs: `src/app/api/exams/[id]/generate/route.ts:15-75`, `src/lib/generate/*`, `src/components/builder/text-stage.tsx:66-84`
Accept: every gen persists source; regen appends distinct source so dropdown appears when >1; selection persists via sourceIndex. QA: 2 gens → dropdown shows 2 titles → switch updates preview/export sourceNote.

### W4 — Tables end-to-end (builder→preview→export)
Refs: `src/data/guides.ts:13-19` tableRequired, `src/lib/generate/mock.ts:204,226-231` ... `src/components/builder/tasks-stage.tsx:211-235` (builder ok) → `src/components/builder/preview-stage.tsx:74-86`, `src/lib/export/assemble.ts:14-18,75-85`, `src/lib/export/pdf.ts:48-57`, `src/lib/export/docx.ts:36-40` (gaps)
Accept: carry table {headers,rows} through ExportTask; preview renders HTML table; pdfkit renders bordered table; docx renders Table. QA: TRUE_FALSE etc tables appear builder+preview+PDF+DOCX.

### W5 — Exact wording + counts hardening
Refs: `src/data/guides.ts:21-38,924-925,...` exactWording/itemCount, `src/lib/generate/provider.ts:96-116`, `src/lib/generate/index.ts:110-135`
Accept: Set-0 primary tasks equality-check instruction === exactWording; per-task itemCount derived from rows/prompt lines; failure → validateCandidate issue → 422. Typed placeholders `taskSpecificRules/teacherStandardRules` default [] (no behavior change). QA: mutated wording/count fails.

### W6 — Text Exploration broader theme
Refs: `src/lib/generate/mock.ts:256,423,537` inText filter, `src/data/themes.ts:1-7`, `src/lib/guide.ts:19-61`, `src/lib/generate/provider.ts:54-68`
Accept: task sourcing permissively from unit theme (not passage-strict), still level/skill/Ministry via guide. QA: vocab/grammar tasks can draw outside exact passage tokens, still validate.

### W7 — Blocked placeholders + docs
Refs: guide doc CRITICAL—DISCUSS for alternatives
Accept: document placeholders in code+plan, no provisional pedagogy change. QA: grep shows placeholder types, no runtime change.

## Final verification wave
F1 plan compliance, F2 code quality, F3 manual preview/PDF/DOCX, F4 scope fidelity (no SMTP, no migrate).

## Commit strategy
One commit per wave (conventional: fix/feat), verify `npm test && npm run build` before each.

## Success criteria
All 20 checklist items reflected: eye on 3 pages, length 120–150/150–200, difficulty wiring, paragraphs, alternative-box (another + harder/simpler + teacher pick), obligatory+multi-source, parity, wording/tables/rules/counts, DISCUSS tracked, exploration broader + tables.
