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
- **Option label → text is exactly one space** in all three surfaces. DOCX used a 0.22in tab stop and the preview a 1.25rem label box; both read as a wide column. Line rhythm lives in `LINE_HEIGHT` / `ITEM_ADVANCE` (PDF) and `LINE_SPACING` (DOCX, pinned because Word otherwise derives lines from the substituted font).

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
- **`prisma db push` hangs against this DB, and `db execute` silently no-ops.** Its diff engine never returned (15+ min, killed) even though TCP to the pooler on 6543 is open and fine. `prisma db execute --stdin/--file` exits **0 without applying anything** — it must not be trusted as evidence a column exists. For a single additive column, run it through the client and then **verify by querying `information_schema`**:
  ```bash
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '\"' | tr -d "'")"
  # prisma.$executeRawUnsafe('ALTER TABLE ...'), then $queryRawUnsafe('SELECT ... FROM information_schema.columns ...')
  ```
  `DATABASE_URL` lives in `.env.local`, which Prisma does not read — it only reads `.env`, so a bare `npx prisma ...` fails with `P1012: Environment variable not found`. `.env.local` also cannot be `source`d (the pooled URL contains a bare `&`). Export it as above.
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

- `src/lib/generate/index.ts` is the facade. **The API layer must never import `mock`/`openai`/`groq` directly** — every generation goes through `withChain()`, which resolves the provider chain (empty chain ⇒ `mock`, deterministic, seeded, no API key) and builds the LLM generators from `provider.ts` (chat helper, prompt builder, parser). `openai`/`groq` are legacy single-provider entry points kept for the `AI_PROVIDER` path and each honor `*_API_KEY`, `*_MODEL`, `*_BASE_URL`.
- `buildContext()` resolves rules via `src/lib/guide.ts` and derives a deterministic `seed` from `examId:grade:unit:topic`.
- `validateCandidate()` is the gate before any candidate reaches the teacher: marks totals, `exactWording`, `tableRequired`, `itemCount`, and BAC constraints (`gapCount`, `utteranceCount`, `choiceCount`, `solvedExampleRow`). Only re-run for the standard case — `generate/index.ts:200` notes `taskSpecificRules`/`teacherStandardRules` are **intentionally empty until a teacher supplies values**.
- `GenContext` now carries `difficulty`, `teacherKeywords`, `paragraphCount` and `repairOf` (bias generation); `provider.ts` caps every fetch at **30s** via `AbortController`.
- `src/lib/generate/chain.ts` owns the **fallback chain** (`AI_PROVIDER_CHAIN`, comma-separated `provider:model`), resolved per call by `withChain()` in `index.ts`. The advance policy is deliberately asymmetric: **advance** on 429/5xx/timeout/unusable reply and on a model that is **unavailable**, **stop** on 401/403 that are about the *credential* and on validation failure (a different model has no more knowledge of this exam's guide rules).
- **A key alone is enough to go live.** With `AI_PROVIDER_CHAIN` unset, ANY of `GROQ_API_KEY` / `OPENROUTER_API_KEY` / `NVIDIA_API_KEY` selects `DEFAULT_CHAIN` (GPT-OSS 120b first). No second config step. An empty-string value counts as unset, so the `KEY=""` placeholders in `.env.local` read as absent rather than as a broken token.
- **`AI_PROVIDER=mock` wins over everything, even with a key exported in the shell.** Two reasons: an operator who pinned the offline provider must not be silently pushed onto a live API, and `npm test` runs with the developer's keys in the environment. The test script therefore sets `AI_PROVIDER=mock` explicitly — **the suite must never make a network call**, and it will not do so reliably on its own.
- **A 403/404 about the MODEL is not an auth failure.** Measured live 2026-10-11: `gpt-oss-20b` and `qwen3.8-27b` both answer `403 blocked at the project level` while the key is fine. Classifying that as `auth` aborted the chain on exactly the case it exists to survive, so `MODEL_UNAVAILABLE` is matched first and returns `unavailable`, which advances. Genuine credential errors ("invalid api key", "unauthorized") still stop.
- **`Modal` is a `fixed inset-0 z-50` overlay, so exactly ONE instance of a confirmation dialog may exist.** Rendering it in both the top-bar button and the Parameters stage stacked a second dimmer and a second focus trap. A dialog that answers a button pressed in the Parameters card must be rendered by the Parameters stage; its position in the DOM is irrelevant because it is an overlay. `ConfirmDialog` and `PendingConfirm` are exported from `full-exam-button.tsx` / `builder.tsx` so the Parameters stage can reuse them instead of duplicating the wording.
- **A 409 on FULL_EXAM is the designed first-use flow, not a bug.** Save generates the passage alone, so the exam always has content and the next full run always needs an explicit overwrite confirm. The button label reflects state ("Generate full exam" -> "Replace with a full exam") so the confirm is expected. Do not "fix" this by weakening the guard.

- **`parseTaskBody` must recognise every shape the model returns, not just prefixed lines** (teacher report 2026-10-12: "only question 1 has letters"). Lines are items when they are BARE, when they are blank-line-separated BLOCKS (morphology/phonology), or when prefixed. Only a key/value exercise with DISTINCT labels ("Sentence A:" / "Sentence B:") stays one item -- a REPEATED pair is a list of questions. Labels are printed by `letterLabel` and always overwrite the model's, so the model's prefix choice must never decide recognition. Markdown `--- | ---` separator rows are dropped. Two traps this cost: the bare-shape check must come BEFORE the continuation rule (or lines 2-3 append to item 1), and splitting a multi-line block must NOT be guarded by "does it start with a number" (`NUMBERED` has no `m` flag and cannot match past a newline, so the block silently merges into one item).
- **An empty task prompt passes every other validator check** and prints as a blank question. `validateCandidate` rejects it. Seen live when the model answered morphology with `{word, derivedForm}` instead of `{prompt}`.

- **Free-tier model rosters rot quarterly — verify against a live key before trusting any model string.** Measured 2026-10-11: Groq free serves only `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` (all `meta-llama/*` chat models removed 2026-08-16). `groq.ts` shipped defaulting to the dead `llama-3.3-70b-versatile`; fixed, and pinned by a test.
- **Reasoning models return EMPTY content unless reasoning is capped.** gpt-oss with `response_format: json_object`: **0/6** succeeded uncapped (Groq reported `Failed to validate JSON`), **6/6** with `reasoning_effort: low` (~25 reasoning tokens). `chain.ts` applies this automatically to `gpt-oss` IDs; the transport always sends `max_tokens` (default 4000). `provider.test.ts` asserts both at the wire — do not delete those assertions.
- `parseLooseJson()` salvages fenced or prose-wrapped JSON. `response_format` is honoured by Groq and NVIDIA but **not reliably by OpenRouter** (Gemma returns a ```json fence even when asked), and the free tier serves the same model inconsistently minutes apart. Salvage must stay narrow: it still throws when there is genuinely no JSON.
- Temperature is **split**: `TEMPERATURE.prose` (0.7) for passages and rewrites, `TEMPERATURE.structured` (0.2) for tasks, tables and topics — a task that must emit `a) b) c)` on every retry should not sample. It is an argument to `chat()`, **never** a key in the prompt object, or it is serialised into the user message.

### Passage shape (also `EXAM.md` §12)

- `paragraphCount` is a **teacher choice of 3 or 4, default 3** (`ALLOWED_PARAGRAPH_COUNTS` / `normaliseParagraphCount` in `guide.ts`). Constants live in `guide.ts`, not `generate/`, because `generate/index.ts` imports `guide.ts` — moving them creates a cycle. `validateCandidate` enforces the count **exactly** only when the caller passes it; REWRITE and alternatives pass nothing and are unaffected.
- `mentionsAnchor` (grounding.ts) is a phrase-aware matcher used ONLY by the advisory topic checks. It is deliberately separate from `occursInPassage`, which is single-token with inflections — correct for a vocabulary target or referent, but structurally unable to match a multi-word topic like "digital literacy". `checkTaskLinkage` keeps single-token semantics and must not be routed through the phrase matcher.
- **Topic checks are ADVISORY. Do not enforce them.** `checkTopicAnchoring` LOGS, never fails the exam. Two mechanical attempts were made and both rejected good passages: (1) per-paragraph anchoring rejected 4/4 live passages because the topic is the curriculum LABEL and a passage about Neolithic settlements says "prehistoric"; it also CAUSED the chant by demanding the phrase everywhere. (2) adjacent-paragraph lexical overlap scored the teacher's reference article 5/7 but real good passages 3/1 and 0/2 — the 0 was held together by pronoun chains ("These burial chambers…"), which are excluded because "they"/"these" are too common to be evidence. The reference scored well only because it repeats "diet"/"researchers" heavily. Full measurements are in `grounding.ts`. Topicality and cohesion are PROMPT-enforced, like semantic answerability. Hard-enforced is only what is exactly computable: word band, paragraph count, schema.
- **Never phrase a prompt instruction so the validator rewards a literal token.** "Name the topic in EVERY paragraph" + a validator accepting the verbatim phrase is what taught the model to chant "Exploring the ancient world…" three times. Ask for prose properties (arc, varied reference, no pasted phrase) and verify nothing mechanically.
- **`candidateCount` lives in `candidates.ts`, not `provider.ts`.** `provider.ts` imports `index.ts`, which imports the mock — importing `provider.ts` from `mock.ts` for this one helper would close that cycle. The mock MUST honour `candidateCount()`: a test double returning a different SHAPE from the code it stands in for silently stops covering that code.

- **Full-exam Phase B is SEQUENTIAL, not concurrent.** Three sections each carry the full passage as their prompt; fired together they exceed Groq's 8000 TPM free limit and the run 429s. Measured 2026-10-11. One exam ≈ 7K tokens ⇒ **under two exams per minute on the free tier**; a 429 is a capacity signal, not a bug — do not "fix" it by editing prompts.
- **`candidateList()` resolves the reply key per call site (`"candidates"` vs `"sets"`).** gpt-oss returns a bare top-level array for both schemas. Hardcoding one wrap key fixed the passage and then made Part One worse. Never guess the key in the parser.
- **One proposal per call by default (`candidateCount()`, env `AI_CANDIDATES`, default 1).** Four calls each returning 3 sets tripled the cost of the run the teacher actually wanted, against a TPM ceiling that is already binding. Alternatives are on demand via the replacement panel. Rewrites are the deliberate exception (asking for 3 is the point of "make this simpler/harder"). Read per call, not cached at module load.
- **STAMP computed fields from the guide; never validate the model's echo.** `taskHasTable` reads `task.skill`, and the model often omits it -- a correctly-tabular morphology task then failed with "must not carry a table", blaming the task instead of the missing field. `generateTextExplorationCandidates` now overwrites `skill`/`marks` from `guide.textExploration.skills[i]` after parsing. Same rule as marks: computed, not generated.
- **Send the ALLOWLIST's answer, not the raw guide flag.** `tableRequired` goes out as `rulePrescribesTable(skill)`. When the two disagree the prompt says "true" for a task the validator then rejects -- a contradiction the model cannot resolve.

- **Never send a prompt rule that the validator contradicts.** PART_ONE said "include a table when tableRequired=true" AND "omit the table field entirely", with the raw guide flag still in the payload — two incompatible orders in one request. `tableRequired` always goes out as the ALLOWLIST's answer (`rulePrescribesTable`), for Part One and Part Two alike.
- **WRITING and TASK_ALT must be grounded like everything else.** WRITING asked for "the same theme as the text" while sending no `passage` field; TASK_ALT regenerated a whole ungrounded section for one task so `checkTaskLinkage` no-opped. Both now receive `passageField(ctx)`; TASK_ALT reads the stored passage and validates EVERY set, not just `slice(1)` (the primary is what gets persisted).
- **`SOURCE_NOTE` must never let the model invent a citation.** The passage is original: adaptationNote says so, author/publication/url stay null. A fabricated URL is printed on the paper. Do not reintroduce "a source citation is obligatory" language.
- **Marks/skill/family are stamped for every section now** — Part One and WRITING included. The model supplies wording and answers only.

- **`shapeError()` names the keys actually returned.** "AI output missing candidates" was identical for a prose reply, a wrong key, and a short list — three bugs, three fixes. Keep it; it is what turned a silent failure into a diagnosable one.
- **`PART_ONE_TABLE_RULE` must say "omit the `table` field ENTIRELY", not "never carry a table".** Told only that, the model emitted a one-row table on every Part One task. Being told a rule is not the same as being told the exact field to omit — and a stray table also makes `countItems` read 1 instead of the expected count, so it fails twice.

- **A FAMILY IS A TASK.** Part One is `guide.partOne.length` tasks (4 for 3as); a family's `itemCount` is how many items that task PRINTS, not how many tasks exist. Models routinely emit one task per ITEM instead: captured live 2026-10-11, 14 tasks where 4 were expected (4+3+4+3). Two recovery paths, both driven by the guide and never by the reply: `assembleFromFamilyKeyed` (a `{"TRUE_FALSE":[…]}` reply) and `regroupByFamily` (14 one-item tasks inside one set). Both REFUSE a partial reply rather than shipping a section with a blank. See `EXAM.md` §12.7.
- **`COHESIVE_MARKERS` items carry `(underlined, reference)` and no text field at all.** `referentItem` builds the printed blank in code. Routing them through the generic `itemText` lookup makes every referent item look corrupt and fails the whole section.
- **Prompt only works when it states numbers.** "EXACTLY the item counts below" does not bind; `TRUE_FALSE (exactly 4 item(s), 2 marks)` does. Same as the word band. `TASK_SET_SCHEMA_NOTE` states the JSON container literally, including "Do NOT key the output by family name".
- **A failed live run is the cheapest source of a payload.** `parseTaskSets` had a throwaway test that passed only because it omitted `families` from the probe; the real call failed. Probe the REAL request, then dump the reply, before theorising — both hypotheses I formed first were wrong.

- `repairPassage()` (`full-exam.ts`) allows **exactly one** corrective call, passage only, carrying the validator's issue strings back verbatim. Distinct from `withRetry()`, which only covers transport failures. When the repair fails it returns the **original** issues, never the repair's symptom. Do not "improve" this into a loop.

### Mock is a test double, not a second-class citizen

`mock.ts` must honour the **same contract** as the real providers: exact paragraph count and a topic named in every paragraph (`anchorParagraphs`, with `countAnchorWords` reserving length budget *before* the ±20% trim, or the anchors push the passage out of band). The theme corpus is topic-neutral by design, so without anchoring three of four paragraphs read as an unrelated essay stapled to the topic. If the mock drifts, every test exercising a validator rule through it silently stops covering that rule.

`toParagraphs()` distributes sentences **evenly**, spreading the remainder across leading paragraphs. Chunking by a fixed `ceil(n / wanted)` stride silently under-delivers: 9 sentences at 3 per paragraph yields 3 paragraphs, not the 4 asked for.

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
