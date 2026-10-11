# AGENTS.md — Exaai

Next.js 15 App Router + React 19 + TypeScript (strict) + Prisma/PostgreSQL (Supabase, pooled) + Tailwind v3. AI-assisted exam creation for Algerian English teachers. Every generation is a *proposal*; the teacher edits/approves. Docs: `README.md` (features), `PRODUCT.md` (users/brand/tone), `design.markdown` (**active** design spec), `DESIGN.md` (partly superseded), `Exaai_PRD_V2_Enterprise_Developer_Specification.md` (source of truth for scope).

## `EXAM.md` is the single source of truth for the exam — UPDATE IT ALWAYS

**Read `EXAM.md` before touching any exam-format, paper-layout or task-generation code.** It is organised by task and specifies everything needed to rebuild the exam builder: section order, headings, marks, official task wordings, item counts, typography, and the bold/italic/underline rules. If code and `EXAM.md` disagree, **`EXAM.md` is correct and the code is the bug**.

**Whenever the user states a format, structure, wording, constraint or styling rule for the exam, you MUST write it into `EXAM.md` in the same change that implements it.** Do not defer it, do not summarise it away, and do not wait for a follow-up request — a rule that lives only in code is lost the next time the repo is rebuilt. Concretely:

- A new or changed **task** goes in the section 8 pool table with all three columns: official wording, item constraint, rendering.
- A rule that applies to **every** task gets its own cross-cutting section (as sections 1-7 do).
- A **typography** change (bold, italic, underline, font, size, spacing) goes in the tables in section 3.
- The file grows monotonically. Nothing is removed because an implementation detail changed — the rule stays, the code follows it.

`AGENTS.md` describes the code; `EXAM.md` describes the exam. Both are required reading.

## Commands (all verified this session)

| Command | Exit | Notes |
|---|---|---|
| `npm test` | 0 | **`node --import tsx --test` on hardcoded paths** (`package.json:12`). No glob, no runner config, no DB or network needed. |
| `npx tsx scripts/render-check.ts` | 0 | Writes a full generated exam to `/tmp/opencode/examcheck/exam.pdf`, **no DB needed**. Rasterise with `pdftoppm` to eyeball format rules. |
| `npm run typecheck` | 0 | `rm -f tsconfig.tsbuildinfo && tsc --noEmit`. **Must not run while `next build` runs** — see below. |
| `npm run build` | 0 | `next build`. Only place types are enforced in CI-like flow. |
| `npm run lint` | **1** | **Trap — do not use as a gate.** See below. |
| `npm run vercel-build` | — | `prisma generate && next build`. Vercel entrypoint. |
| `npm run db:push` / `db:seed` | — | `prisma db push` / `prisma db seed` (`tsx prisma/seed.ts`). |
| `bash scripts/smoke.sh` | — | 451-line E2E. Needs a **running dev server** + real DB. `BASE_URL`/`EMAIL` overridable. |

```bash
npm install          # postinstall runs `prisma generate`
npx prisma db push   # schema only — does NOT apply rls.sql (see Landmines)
npx prisma db seed   # upserts 7 GuideConfig rows, one per GUIDES key
npm run dev          # :3000
```

One test file: `node --import tsx --test src/lib/guide.test.ts` (`npm test` runs every registered path).

## Exam paper layout

`EXAM.md` is authoritative (see above). Code map:

- `src/lib/export/assemble.ts` — content model: sections, headings, marks, topic choices. Never reads a task's `answer` field, so exports cannot leak the answer key.
- `src/lib/export/paper.ts` — the **single layout source**. Flattens the content model into an ordered `PaperBlock[]` that PDF, DOCX and the builder preview all walk, so the three surfaces cannot drift. Also resolves referent `(§N)` refs.
- `src/lib/export/pdf.ts` — renders blocks. Body is Times New Roman (`public/fonts/TimesNewRoman.ttf`, regular-only; bold/italic fall back to pdfkit's metric-compatible Standard Times).
- `src/lib/export/arabic.ts` — Arabic shaping. pdfkit + Amiri shape correctly from presentation forms **alone**: do **not** reverse the shaped string.
- `src/lib/generate/referents.ts` — referent rules for question 4 (pronoun classes + repetition-avoiding substitutes; content words rejected).
- `src/lib/generate/grounding.ts` — **passage grounding** (`EXAM.md` section 9). `checkTaskLinkage` mechanically enforces that vocab/morphology and referent targets occur in the passage and that answer cells are empty.
- `src/lib/generate/full-exam.ts` — one-shot draft. Generates the passage first, passes it as `groundingText`, then runs Part One + Text Exploration + Writing concurrently. **All-or-nothing**: any validation failure returns `ok: false` with nothing produced.

**Grounding is not answerability.** `grounding.ts` proves the referenced material is *present*; whether the passage supports the *judgement* a task asks for is prompt-enforced only (`groundingRule` in `provider.ts`) and is not mechanically checkable. Do not describe it as a guarantee that a question is answerable.

**`GenContext.groundingText` is the switch.** Set → mock draws vocab/morphology/referent material from the passage and `validateCandidate` runs the linkage checks. Absent → per-section generation behaves exactly as before (theme corpus, no linkage check). Adding a new question family means deciding which of those two it belongs to.

**Grounding is partial, per family.** VOCABULARY, MORPHOLOGY and COHESIVE_MARKERS are passage-grounded; QUESTIONS, TRUE_FALSE, PARAGRAPH_ID, PHONOLOGY, GRAMMAR and DISCOURSE are still unit-corpus derived and unverified. `EXAM.md` §9 carries the full table. Do not describe the exam as fully grounded.

**LLM providers must receive the passage.** `groundingRule()` and `passageField()` in `provider.ts` are a pair: the instruction names the `"passage"` payload field, so removing the field silently returns the model to theme-level generation that `checkTaskLinkage` then rejects (422, nothing written). `provider-grounding.test.ts` asserts both at the transport boundary — do not delete it as "just transport tests".

**Only the primary set is grounded.** Alternatives (`variant >= 1`) and `TASK_ALT` are generated without `groundingText`; the builder re-checks linkage when an alternative is applied rather than assuming it fits.

**Paper format rules live in `EXAM.md` section 10** (user instruction, 2026-10-11) and are enforced in code, not just documented. Four traps there that will bite you:

- **Tables are allowlisted** via `src/lib/export/tables.ts` — Part A never, Part B only morphology/phonology. `validateCandidate` enforces **both directions**, so a stray `task.table =` outside the allowlist **fails the suite by design**. Do not "fix" the validator to make it pass; that is the bug.
- **No DOCX run outside `t()`** — the single run factory that pins Times New Roman. A bare `new TextRun` silently renders Calibri. Arabic runs are the one exception (they name Amiri; TNR has no Arabic glyphs).
- **Print `item.label` verbatim** — `letterLabel()` already emits `a)`; appending a separator prints `a))`.
- **The passage has no title** unless `showTitle` is set (default false).
- **IPA symbols must use `faceFor()`** in `pdf.ts`. pdfkit's built-in Times faces are WinAnsi and print `ɪ` as `&¦Bð`; this was only caught by rasterising a real PDF, so after any font or phonology change, run `npx tsx scripts/render-check.ts` and look at the pages.

Three pdfkit traps, all documented in `EXAM.md` section 3: `underline` on a continued run underlines the **whole line width** (so the passage is laid out word by word); `underline` + `lineBreak:false` with no `width` throws on a NaN coordinate; and Arabic must be shaped but never reversed.

## Landmines

1. **`npm run lint` does not lint.** There is no `.eslintrc*` / `eslint.config.*`, and `eslint` + `eslint-config-next` are **not installed**. `next lint` (15.5.23, deprecated, gone in 16) drops into an *interactive* ESLint scaffold prompt and exits 1. Nothing is enforced by lint. No Prettier either. There is **no CI at all** (`.github/`, husky, pre-commit: all absent) — nothing catches regressions but the test suite and `tsc`.
2. **Use npm — the pnpm lockfiles are gone, and reintroducing one breaks deploys.** `pnpm-lock.yaml` and `pnpm-workspace.yaml` were deleted in `65e3c74` (2026-10-05): the pnpm lockfile predated five dependencies, so Vercel auto-detected pnpm and every production build died at `ERR_PNPM_OUTDATED_LOCKFILE`. `pnpm-workspace.yaml` also held literal unresolved `allowBuilds` placeholders. Still npm-managed (`package-lock.json`, flat `node_modules`); no `packageManager` field. **Do not commit `pnpm-lock.yaml` or `pnpm-workspace.yaml`** — either one makes Vercel pick pnpm and fail the install.
3. **Row-level security is currently inert, and `rls.sql` is wired to nothing.** `prisma/rls.sql` holds ~47 policies over 14 tables but is referenced by **no npm script and no doc** — its own header says apply it manually via `psql -f prisma/rls.sql`. Even applied, it is bypassed: only `ENABLE` is used, not `FORCE`, and Prisma connects as the table-owning pooler role (`rls.sql:9-21`). **Real tenant isolation is the per-query `userId` where-clause.** Never drop one on the assumption RLS covers it.
4. **Adding a `*.test.ts` does nothing** unless you also append its path to `scripts.test` in `package.json`. There is no glob, so a new test file is silently unrun. The count is deliberately **not** written here — it goes stale every time a test is added. `src/test-registration.test.ts` fails the suite whenever the registered list and the files on disk disagree, so `npm test` going red is the signal; you cannot get this wrong silently. Register the new file.
5. **`npm run dev` requires a live Supabase DB** — there is no local/offline mode. `.env.local` (gitignored) holds the real `DATABASE_URL`; `.env` does not exist. `.env.example` is the template.
6. **Middle school is now LIVE (was dormant).** `src/data/guides.ts` defines all 7 grades (`1am`–`4am` middle, `1as`–`3as` secondary) and the seed writes 7 `GuideConfig` rows. The old `guide.ts` hard rejection of non-secondary levels was removed on 2026-10-05 after verifying the data end to end: all four middle grades resolve through `resolveRules`, generate clean candidates through the mock provider (Part One 7 marks / Text exploration 7 marks / Writing 6 marks, zero `validateCandidate` issues), and export through the `bem` branch of `assemble.ts`. BEM guides use `singleTopic: true`, so `builder.tsx` only requires one writing topic there. If you reintroduce a level restriction, verify against `assemble.test.ts`, which covers both the `bac` and `bem` layouts.
7. **`DESIGN.md` contradicts the code.** It self-declares superseded by `design.markdown` ("where the two disagree, `design.markdown` wins"), yet its own token table still says `--radius: 0.75rem`, grey `--border`, blurred shadows. Live truth is `src/app/globals.css:26` `--radius: 0.25rem` and `tailwind.config.ts` hard offsets (`4px 4px 0 0 hsl(var(--foreground))`). **Follow `design.markdown`.**
8. **Marks are per-guide and computed, not the hardcoded 7/8/5** the old docs imply. `validateCandidate` falls back to `7` (Part One) / `8` (Text exploration) only when `expectedMarks` is omitted (`generate/index.ts:149`); real totals come from the resolved guide (`guides.ts:1213` BEM = 7/7/6, `guides.ts:1256` computes BAC totals).
9. **`main` is the working branch and is committed cleanly, but local `docs/` churn is common.** As of 2026-10-05 `main` is in sync with `origin/main` and the tree is clean after the commit-hygiene pass. It does *not* stay that way: `docs/` is repeatedly reshuffled (files moved to `docs/archived/`) and review PDFs/screenshots land there. **Run `git status` before blaming a change for being pre-existing.** Reference exam PDFs under `docs/dz-exam-templates/` and `docs/screenshot-*.png` are gitignored on purpose — they are copyrighted or throwaway, and the templates dir has moved between the root and `docs/` before, so keep both the root-anchored and `docs/` ignore rules.
10. `iconv-lite` is an **unused dependency** — no `src/` import. Don't assume it encodes anything in the export path.
11. **`TS6053: File '.next/types/…' not found` means you ran typecheck *during* a build, not a real type error.** `tsconfig.json` includes `.next/types/**/*.ts` (Next's generated route types) and `next build` deletes and rewrites that directory mid-run, so a concurrent `tsc` sees files vanishing — reproducibly ~33 errors. `npm run typecheck` clears the stale `tsconfig.tsbuildinfo` first, which hides the *cached* variant, but the race itself only goes away by not overlapping the two commands. Sequentially it is always clean, and the exit code is still 0, so do not read these as genuine type failures — and do not "fix" them by deleting `.next/types/**` from `include`, which would break route-type validation.

## Database

- `prisma/schema.prisma:9` `provider = "postgresql"`; `DATABASE_URL` is a Supabase pooled URL (`?pgbouncer=true&statement_cache_size=0`). Supabase Auth/Storage are unused — auth is custom bcrypt + DB sessions.
- **No migration history.** Use `prisma db push`, never `prisma migrate`. Default Prisma generator output (no `output` override), no `previewFeatures`/`binaryTargets`.
- `prisma/seed.ts` upserts one `GuideConfig` per `GUIDES` key (7 total) with `version`/`sourceRef` governance metadata. Rule payloads live in code (`src/data/guides.ts`), not in that table.
- `src/lib/db.ts` raises transaction timeouts to 30s (Supabase cold RTT) and retries transient errors (`withDbRetry`, 2 retries) — the Prisma 5s default caused "Transaction already closed".
- `withRls(userId, fn)` sets `SET LOCAL app.current_user_id` **inside** `prisma.$transaction`, because bare `SET LOCAL` outside a transaction is a no-op on pooled pgbouncer. It uses `$executeRawUnsafe` with manual `'`-escaping — don't "clean" that up. Two callers intentionally stay on the global client: `track()` (fire-and-forget analytics) and `restoreRevision()` (manages its own transaction, so it **cannot** nest inside `withRls`; its caller checks ownership first).
- **`scripts/smoke.sh` has 6 hardcoded SQLite-only asserts that always skip** (lines 138, 141, 340, 350, 409, 412 — `sqlite3.connect("prisma/dev.db")`) because the real DB is Postgres. Also note `smoke.sh:94` asserts Text exploration `total == 7`, which contradicts the `8` fallback in `generate/index.ts:149` — unverified by execution, since the smoke test needs a live server.

## Auth & access control

- Session tokens are **hashed (sha256) at rest**; the DB stores the hash, the cookie the raw token (`auth.ts:10-12,26`). `createSession` **deletes all prior sessions for that user** on login (`auth.ts:24-25`) — one concurrent session per user, by design.
- Cookie `SESSION_COOKIE_NAME` (default `exai_session`), `httpOnly`, `sameSite: "lax"`, `secure` only in production, TTL `SESSION_TTL_DAYS` (default 30). A second non-`httpOnly` cookie `csrf_token` is set alongside it.
- **CSRF is enforced per route**, not by middleware: `await requireCsrf(req.headers)` compares cookie vs `X-CSRF-Token` and throws `CSRF_MISMATCH` (`auth.ts:100-107`). There is no `middleware.ts`. `/auth/forgot-password` and `/auth/reset-password` deliberately skip it (unauthenticated token flows) — don't copy that to authenticated mutations. Browser calls go through `src/lib/api-client.ts` (`apiFetch`), which attaches the header.
- `getCurrentUser` is wrapped in React `cache()` (`auth.ts:49`) — the `(app)` layout *and* the page both call it, so don't unwrap it into a second DB query.
- Access control: `src/app/(app)/layout.tsx` redirects to `/login` when unauthenticated; `requireUser()` throws `UNAUTHORIZED`. `/ops` calls `isAdmin()` → `notFound()`; `isAdmin` grants on `role === "admin"` **or** a match in comma-separated `ADMIN_EMAILS` (unset ⇒ role-only). `requireAdmin()` throws `FORBIDDEN`.
- Rate limits (`src/lib/rate-limit.ts`): login 5/15min keyed `ip|email`, per-IP login 5/15min, register 10/hour per IP → `429` + `Retry-After`. **In-memory `Map`, per-process only — explicitly documented as unreliable on serverless/multi-instance, and `clientIp` trusts the last `x-forwarded-for` entry, which is client-spoofable.** Replace with Redis/edge before production scale.
- Passwords: `bcrypt.hash(pw, 10)`, `z.string().min(8).max(128)` — no non-production loosening. Registration returns a generic error to prevent account enumeration.
- Password reset: `randomBytes(32)` token, sha256-hashed at rest, single-use via `usedAt`, expires, and **deletes all sessions on reset**. `PasswordResetToken` SELECT is `USING (true)` in `rls.sql` — intentional, since the unguessable hash is the capability secret. Mailer (`src/lib/mailer.ts`) returns the link as `devUrl` when `NODE_ENV !== "production"`; in production it **throws without `SMTP_HOST`** (fail-closed).
- Repo has **zero** `@ts-ignore` / `@ts-expect-error` / `eslint-disable`. The single `as any` in production code is `src/app/api/exams/[id]/route.ts:30` (`req.json()`). Keep it that way.

## AI generation

- `src/lib/generate/index.ts` is the facade. **The API layer must never import `mock`/`openai`/`groq` directly** — `impl()` switches on `AI_PROVIDER` (default `mock`, deterministic, seeded, no API key). `openai`/`groq` share `provider.ts` (chat helper, prompt builder, parser) and each honor `*_API_KEY`, `*_MODEL`, `*_BASE_URL`.
- `buildContext()` resolves rules via `src/lib/guide.ts` and derives a deterministic `seed` from `examId:grade:unit:topic`.
- `validateCandidate()` is the gate before any candidate reaches the teacher: marks totals, `exactWording`, `tableRequired`, `itemCount`, and BAC constraints (`gapCount`, `utteranceCount`, `choiceCount`, `solvedExampleRow`). Only re-run for the standard case — `generate/index.ts:200` notes `taskSpecificRules`/`teacherStandardRules` are **intentionally empty until a teacher supplies values**.
- `GenContext` now carries `difficulty` and `teacherKeywords` (bias generation); `provider.ts` caps every fetch at **30s** via `AbortController`.

## Export

- Both formats consume one shared model: `ExportDocument` in `src/lib/export/assemble.ts` (`title`, `subtitle`, `meta[]`, `sections[]`, `generatedBy`, `structure: "bac" | "bem"`), so preview and download can never diverge. Guide version is surfaced in `meta`.
- `assemble.ts:1-6` distinguishes **BAC** (umbrella layout) from **BEM** (legacy three-section) — branch on `structure`, don't assume one shape.
- `next.config.mjs:6` `serverExternalPackages: ["pdfkit", "docx"]` is **required**: both load assets from `node_modules` at runtime. Bundling them breaks export.
- Arabic: `src/lib/export/arabic.ts` shapes + reverses **pure-Arabic lines only** (official-paper header, `صفحة X من Y` footer) because pdfkit has no complex-text layout. **Never apply it to mixed Arabic/Latin prose** — teacher content stays logical-order for DOCX, where Word shapes natively (`bidirectional: true`). Fonts `public/fonts/Amiri-{Regular,Bold}.ttf` load synchronously; a missing font degrades gracefully (skips the header).

## Design system

- `design.markdown` is the active spec (neobrutalist: 2px **ink** borders, hard zero-blur offset shadows, 4px radius, `active:translate` press). Bans blurred shadows, grey borders, hardcoded `bg-white`/`bg-black`, gradient text, glassmorphism, uppercase eyebrows, em dashes.
- All colors are HSL custom properties in `src/app/globals.css` `:root`, surfaced through `tailwind.config.ts` as `hsl(var(--token))`. Primitives live in `src/components/ui/` (`button`, `input`, `select`, `textarea`, `label`, `card`, `badge`, `modal`, `separator`, `skeleton`, `toast`).
- `darkMode: ["class"]` is configured but **only a light theme exists** — don't add dark variants expecting tokens to be there. `postcss.config.mjs` is default; `tailwind.config.ts` has `plugins: []`.

## Layout

- `src/app/api/` — `auth/{login,logout,register,forgot-password,reset-password}`, `catalog`, `custom-tasks/[id]`, `exams/[id]/{generate,replace,apply-task,favourites,revisions,revisions/restore,export}`, `favourites/[id]`, `me`. No middleware; each route calls `requireUser`/`requireCsrf`/`withRls` itself.
- `src/app/(app)/{builder,dashboard,library,favourites,ops}` are auth-gated by the group layout. `src/app/(app)/builder/new/actions.ts` is a **`"use server"` action** (`createNewExam` → `redirect`) — the GET-side-effect version was deliberately removed; keep creation a POST action.
- `src/lib/` — `auth`, `db`, `rate-limit`, `password-reset`, `mailer`, `serialize` (`examToDto`/`loadExamDto`/`safeParse`), `revisions` (`captureRevision`/`restoreRevision`, `MAX_REVISIONS = 50`), `events` (fire-and-forget `track`), `utils` (`cn`), `i18n`, `api-client`; `generate/` (facade + 3 providers + `rng`); `export/` (`assemble` → `pdf`/`docx` + `arabic`).
- `src/data/guides.ts` (1309 lines) is the curriculum + rules source of truth; `src/data/themes.ts` the mock corpus. `src/types/index.ts` holds shared types.
- Validation is **inline zod per route** — no shared schema layer. Client components are `"use client"` only where interactive; everything else is a server component.
- `@/*` → `./src/*` (`tsconfig.json:17`, dominant for cross-directory imports; co-located files use relative). `opencode.json` registers a remote Supabase MCP server pinned to one `project_ref`; `.opencode/` holds a plugin with its own `node_modules`. No `README`-documented `AGENTS.md`-referenced CI or task runner.
