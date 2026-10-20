# Exaai

**Exam creation, lightened.**

Exaai is a web app for Algerian English teachers. It drafts a complete exam — reading
text, comprehension tasks, text exploration and written expression — following the
official middle- and secondary-school exam structures, then hands it back to you to
edit, replace and approve. When the exam is right, you export it as a printable PDF
or a Word document.

Every generation is a **proposal**. Nothing is approved without the teacher, and
regenerating never silently destroys work you already accepted.

---

## Who it is for

English teachers in Algerian middle and secondary schools, preparing formal exams
(1AM–4AM and 1AS–3AS). The app is built to be used between classes, on a school
laptop or a phone, with no technical setup and no knowledge of AI tooling.

## The goal

Exams are structured and repetitive to build: the same sections, the same task
families, the same mark scheme, week after week. Exaai takes over the first draft —
the text, the tasks and the marks — so the teacher spends their time on judgement
and pedagogy instead of typing. The teacher remains the author: the app proposes,
the teacher decides.

Three principles shape the product:

1. **The teacher stays the author.** Every generated section can be edited,
   regenerated or swapped for an alternative, per task.
2. **Nothing technical leaks to teachers.** No prompts, no API keys, no jargon in
   the interface.
3. **Nothing is lost.** Regenerating keeps the previous version, and every change is
   captured in version history.

---

## How it works

```
Parameters → Reading text → Part One (comprehension) → B. Text Exploration → Written Expression → Preview → Export
```

1. **Create an account** and start a new exam from the dashboard.
2. **Choose the parameters**: level (middle/secondary), grade, stream where it
   applies, unit, topic and passage length. The dropdowns are dependent, so only
   valid combinations can be picked.
3. **Generate the reading text.** You get an editable document. If you do not like
   it, generate alternatives — the current text is never overwritten. You can also
   ask for a simpler or harder rewrite.
4. **Generate Part One: Reading** (comprehension tasks) and **B. Text Exploration**
   (vocabulary, morphology, phonology, grammar, discourse). Each task carries its
   marks, and each task can be replaced on its own.
5. **Generate the written expression** topic, or use the free topic.
6. **Preview the paper.** The preview renders the same document the export produces.
7. **Export to PDF or Word**, print, and teach.

Everything autosaves to your draft. You can close the tab and continue later from
the dashboard; past exams live in your library.

## What is included

- **Landing page and accounts** — register, sign in, sign out, password recovery by
  email. Exam data is private to your account.
- **Dashboard** — new exam, continue the last one, recent exams, draft and exported
  status.
- **Parameters stage** — dependent dropdowns (level → grade → stream → unit → topic),
  custom topic, and word-length choices that come from the curriculum rules.
- **Reading text stage** — editable passage, alternatives, source attribution, and
  Simplify / Make harder rewrites. The passage is never destroyed by a regeneration.
  Every paragraph is a developed paragraph: the app rejects a passage whose closing
  paragraph is a single short line, while still allowing paragraphs of different
  lengths the way real papers do.
- **Part One: Reading** — comprehension tasks with marks and per-task replacement.
- **B. Text Exploration** — five skill categories (vocabulary, morphology, phonology,
  grammar and discourse), including the prefix/root/suffix, word-derivation and
  pronunciation tables used on the official papers.
- **Written expression** — a guided topic with keywords, plus a free topic. Topics
  can be replaced independently.
- **Preview** — the exam as it will print, page by page.
- **Export** — PDF and Word, generated from one shared document model so the two
  formats and the preview cannot drift apart.
- **Version history** — every generation, replacement and parameter change is
  captured; restore any earlier state (up to 50 revisions per exam).
- **Favourites and custom tasks** — star a task you want to reuse; the replacement
  panel offers AI alternatives, your favourites and your own custom tasks.
- **Library** — every exam you have created, with search, status filters (draft,
  exported, archived) and deletion.
- **Interface language** — English and French, switchable from the navigation bar.
- **Operations view** — an admin-only page (`/ops`) with the generation ledger,
  funnel counts and guide governance metadata.
- **Feedback** — rate an exam thumbs up or down, with a short note when something
  went wrong. This tells us which task families produce output teachers reject; it
  never changes the exam and never feeds back into a prompt.

## Exam structures

Exaai follows the exam formats teachers actually print.

- **BAC layout** (secondary school, 1AS–3AS): *Part One: Reading* — comprehension
  and text exploration around the passage — then *Part Two: Written Expression*.
- **BEM layout** (middle school, 1AM–4AM): the legacy three-section structure.

Marks are computed per grade and stream, not hardcoded: the curriculum rules decide
how many marks each section carries and how many items each task prints. The full
specification — section order, headings, official task wordings, item counts,
typography and table rules — lives in [`EXAM.md`](EXAM.md), which is the single
source of truth for the paper.

### Grounding

Tasks that refer to the passage (vocabulary, morphology and referent questions) are
checked mechanically against the text that was generated: the target words must
actually occur there, and answer cells must be empty. Coherence, topicality and
whether a question is genuinely answerable remain the model's job and are covered by
teacher review — the app does not claim they are guaranteed.

## Print and export

Exports are print-ready A4 papers with the official-style Arabic header, section
headings, marks and typography:

- **PDF** — exact control over the layout (fonts, tables, dotted writing rows).
- **Word (.docx)** — editable afterwards; the same document model as the PDF.
- **Gap-fill tasks** — the word list prints in bold and carries exactly one word
  per blank; every blank in the passage is numbered, so students answer with the
  number and the word.

The answer key is stored for the teacher's **Answer key** toggle and **never
printed** on either format. The exported paper is the student sheet: no answer
text appears on it, including when a generated prompt accidentally contains one.

## Good to know

- **One active session per account.** Signing in on a new device signs out the
  previous one — a deliberate choice, not a bug.
- **Drafts save as you work.** Closing the tab does not lose the exam; reopening it
  from the dashboard or library resumes where you left off.
- **Regeneration is additive.** A section you replace is kept as an alternative
  rather than deleted, and version history (up to 50 revisions per exam) can put an
  earlier state back.
- **AI drafts are drafts.** The app checks structure, marks and passage grounding,
  but the teacher is the last line of defence on wording and answerability.

---

## Run it locally

### Requirements

- Node.js 20 or newer (Next.js 15 / React 19)
- A PostgreSQL database. [Supabase](https://supabase.com) works well: use the pooled
  connection string (Dashboard → Connect → Transaction pooler).
- The app **requires a live database**; there is no offline mode for `npm run dev`.

### Setup

```bash
npm install                # postinstall runs `prisma generate`

cp .env.example .env.local # then set DATABASE_URL in it

npm run db:push            # create the schema (Prisma db push, no migrations)
npm run db:seed            # one GuideConfig row per grade (curriculum metadata)

npm run dev                # http://localhost:3000
```

Notes that will save you time:

- Next.js reads `.env.local`; the **Prisma CLI only reads `.env`**. For the `db:`
  commands either duplicate `DATABASE_URL` into `.env` or export it in your shell
  first.
- Use `prisma db push`, not `prisma migrate`: this schema has no migration history.
- Generation works with **no API key** — the default provider is a deterministic
  offline mock. Adding a provider key is enough to go live (see below).

### Configuration

Copy `.env.example` and fill in what you need. The important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled PostgreSQL connection string (required) |
| `AI_PROVIDER` | `mock` (default, offline) or a single provider: `openai`, `groq`, `openrouter`, `nvidia` |
| `AI_PROVIDER_CHAIN` | Preferred over `AI_PROVIDER`: `provider:model` entries tried left to right, with a documented advance/stop policy |
| `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY` | Provider credentials; any one turns on the default chain |
| `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS` | Session cookie settings (default 30 days) |
| `ADMIN_EMAILS` | Comma-separated emails allowed to see `/ops` |
| `APP_URL` | Public base URL used in password-reset emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mail delivery. Outside production the reset link is returned to the UI instead; in production the mailer fails closed without SMTP. |

`AI_PROVIDER=mock` wins over everything else, including an exported key — the offline
provider is never silently overridden.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit (do not run while `npm run build` is running) |
| `npm test` | Unit and provider tests; runs the mock provider, no database or network needed |
| `npm run db:push` / `npm run db:seed` | Apply the schema / seed curriculum metadata |
| `npm run vercel-build` | `prisma generate && next build` — the Vercel entrypoint |
| `bash scripts/smoke.sh` | End-to-end smoke test; needs a running dev server and a real database |
| `npx tsx scripts/render-check.ts` | Renders a full generated exam to a PDF with no database, for checking the paper format |
| `npm run ship -- -m "…"` | Tests, typecheck, commit, push, and wait for the Vercel deploy to go live |

`npm run lint` is **not** a usable gate: ESLint is not installed, so `next lint`
drops into an interactive setup prompt and exits non-zero. Typecheck and the test
suite are the real gates.

## Deploying

The app deploys to Vercel as a standard Next.js project (`npm run vercel-build`).
Because the pnpm lockfiles were removed on purpose, **use npm only** — committing a
`pnpm-lock.yaml` makes Vercel choose pnpm and fail the install. Set `DATABASE_URL`,
the session variables, `APP_URL` and `SMTP_HOST` in the project environment before
the first production build.

A push to `main` starts the production build by itself, so the loop is:
`npm run ship -- -m "fix(scope): what changed"`. It runs the gates, commits,
pushes, resolves the deployment for **that commit** and blocks until it is live
(see `scripts/ship.sh`). Add `--build` to run `next build` first; use
`--wait-only` later to ask "is my last commit actually live?".

## Project layout

```
src/app/                 Pages and JSON API routes (App Router)
src/app/(app)/           Authenticated area: dashboard, builder, library, favourites, ops
src/components/          UI primitives and the builder stages
src/lib/generate/        Generation facade, providers, grounding checks, mock corpus
src/lib/export/          Shared document model + PDF, DOCX, Arabic shaping, tables
src/data/guides.ts       Curriculum and rules per grade (the source of truth for exam structure)
src/data/themes.ts       Offline theme corpus used by the mock provider
prisma/                  Schema, seed and row-level-security SQL
scripts/                 Render checks and the end-to-end smoke test
```

## Documentation

| File | Contents |
| --- | --- |
| [`README.md`](README.md) | This file — what the product is and how to use it |
| [`EXAM.md`](EXAM.md) | The exam specification: sections, task wordings, marks, typography, tables |
| [`AGENTS.md`](AGENTS.md) | The engineering brief: code map, landmines, generation rules |
| [`PRODUCT.md`](PRODUCT.md) | Users, brand, tone and product principles |
| [`design.markdown`](design.markdown) | The active design system |
| PRD (Version B) | Source of truth for scope and requirements |

## Contributing

Keep the docs in step with the code:

- A change to the **exam** — a task, wording, mark, layout or typography rule — goes
  into `EXAM.md` in the same change.
- A new **user-facing feature or behaviour** (a new screen, button, export option,
  workflow step, setting or limit) is described in `README.md` in the same change.
  If a teacher can see or do something new, the README should say so.

There is no CI; run `npm run typecheck` and `npm test` before opening a pull request.

## Scope

This repository is a working product MVP. Accounts, generation, editing, version
history, favourites, export and the operations view are implemented; billing and
paid plans are not. Free-tier AI endpoints may retain or train on prompts, which is
an accepted trade-off recorded in `.env.example`.
