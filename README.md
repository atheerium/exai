# Exaai

**Exam creation, lightened.** Exaai helps Algerian English teachers design structured exams. The AI generates and proposes; the teacher reviews, edits, replaces and approves.

This repository is a working MVP built from `Exaai_PRD_V2_Enterprise_Developer_Specification.md` (Version B).

## Core workflow

```
Parameters → Reading text → Part One (comprehension) → B. Text exploration → Written expression → Preview → Export
```

Every generation is a *proposal*. The teacher can edit any component, browse alternatives, replace a single task without touching the others, save drafts, resume from the dashboard, and export to PDF or Word.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript | Responsive teacher-facing SaaS, server + API in one deployable |
| UI | Tailwind CSS + lightweight shadcn-style components | Fast, polished, no heavy dependencies |
| Data | Prisma + SQLite (`prisma/dev.db`) | Simple local persistence for the MVP; swap to Postgres by changing the datasource |
| Auth | Email/password, bcrypt hashing, httpOnly DB sessions | Secure baseline; Google login is an open decision (OD-07) |
| Generation | Pluggable provider facade — `mock` (default) or real LLM | Deterministic generation works offline; see "AI provider" below |
| Export | `pdfkit` (PDF) + `docx` (Word) | Pure-JS server-side rendering, no headless browser needed |

## Run it

```bash
npm install
npx prisma db push        # create SQLite schema (already done)
npx prisma db seed        # guide governance metadata
npm run dev               # http://localhost:3000
```

Tests (unit + provider integration against a local stub, no API key needed):

```bash
npm test                  # 34 tests: guide rules, generation engine, facade, openai provider, rate limiting
```

Smoke test (needs a running server):

```bash
bash scripts/smoke.sh     # BASE_URL and EMAIL are overridable
```

## What's implemented (PRD mapping)

- **Landing page** (§7.1) — green gradient, Algerian-inspired subtle geometry, EN/FR switch
- **Auth** (§24, §25) — register/login/logout, private data isolation (verified by smoke test)
- **Dashboard** (§7.2, §5.2) — New Exam, Continue Last Exam, recent library, draft vs exported status
- **Parameters** (§7.3) — dependent dropdowns (level → grade → stream → unit → topic), custom topic, validated combinations, 150/250 word lengths from guide rules
- **Text stage** (§8) — editable document surface, alternative candidate navigation, source attribution, failure-safe regeneration (previous text is never destroyed)
- **Part One** (§9) — comprehension tasks with marks (7 pts), independent per-task replacement panel, dismissible
- **Text exploration** (§10) — heading `B. Text exploration`, `08 pts`, five skill categories (vocabulary, morphology, phonology, grammar, discourse), marks validated to 8
- **Written expression** (§11) — guided topic with slash-separated keywords + free topic, independent topic replacement
- **Persistence** (§15, §6) — autosave on edits, drafts, library, archive
- **Export** (§18, §35) — PDF + Word with the official-style section headings and marks; preview screen renders the same document
- **Guide engine** (§19) — configurable rules per grade (lengths, marks, task families, skill categories, writing forms), governance metadata seeded into `GuideConfig` with version + source reference
- **Favourites + custom tasks** (§9.2, US-020/021/022) — save any task with the star icon; the replacement panel offers AI alternatives, favourites and custom tasks as tabs; a dedicated favourites page lists and manages them
- **Analytics** (§28) — every user action writes a `ProductEvent` row (signup, exam created, parameters, generations, replacements, exports, failures) tied to the user/exam for funnel and reliability analysis
- **Guide-version traceability** (§19.3, §47) — `ExamConfig` records the guide version used, surfaced in exports
- **Login throttling** (§29) — failed logins are rate-limited per IP+email (5 attempts / 15 min window) with a lockout, returning 429 + `Retry-After`
- **Generation ledger** (§27, §28) — every operation writes a `Generation` row (type, provider, status, error) for cost/quality monitoring

## AI provider

The product deliberately does not expose AI plumbing to teachers. Server-side, generation runs through a pluggable facade (`src/lib/generate/index.ts`):

- `AI_PROVIDER=mock` (default) — deterministic, seeded generation from a curated theme corpus (`src/data/themes.ts`). Produces structurally valid exams with correct marks and unit alignment, no API key, works offline.
- `AI_PROVIDER=openai` — a fully implemented OpenAI-compatible provider (`src/lib/generate/openai.ts`). It requests JSON output, parses and validates every response against the guide rules (task counts, mark totals, skills, guided/free keywords), and surfaces clear errors on malformed output. Configure `OPENAI_API_KEY`, optionally `OPENAI_MODEL` and `OPENAI_BASE_URL` (any OpenAI-compatible endpoint).

All candidates pass `validateCandidate` (structure, length, marks totals, section completeness) before the teacher sees them (PRD §17). Marks totals are enforced (Part One = 7, Text exploration = 8, Writing = 5).

## Architecture answers (PRD §45)

- **Responsive SaaS**: Next.js App Router with server-rendered pages and JSON API routes; client components only where interactivity is needed.
- **Responsive UI during generation**: generation is fast and synchronous for the MVP provider; the UI shows progress states and never blocks editing of already-approved content. A job queue is the natural next step if generation latency grows.
- **No silent overwrites**: every item keeps a candidate list; regenerating appends the previous version to the candidates, so the teacher's approved work is always recoverable (§15.2, §15.3).
- **Auth**: bcrypt + httpOnly session cookies stored in DB with expiry; secrets stay server-side.
- **Private data isolation**: all queries are scoped by `userId`; verified by the smoke test (cross-user access returns 404).
- **AI abstraction**: provider facade with a shared context/validation layer; costs tracked per operation type.
- **Guide/rule storage**: typed config in `src/data/guides.ts` (code for the MVP), with governance metadata (version, source reference, active flag) in `GuideConfig` so future admin UI can manage them without redeploys (§30, §47).
- **PDF/DOCX**: generated server-side with `pdfkit`/`docx` from a shared document model (`src/lib/export/assemble.ts`), so preview and exports never diverge.
- **Economical MVP**: SQLite + one Next.js process + mock provider = zero infrastructure. Scaling = Postgres, real provider, and object storage for exports.

## Known open decisions (from the PRD — not invented here)

- Exact official guide documents and exam variants (OD-01, OD-02) — the seeded rules are a *draft configuration* flagged as pending validation.
- Source retrieval/copyright policy (OD-04) — the mock provider generates original text and marks it clearly as "no external source", never fabricating a citation.
- Pricing/entitlements (OD-05/06) — the schema has `FavouriteTask`/`CustomTask` and `Generation` ledgers ready; no billing UI is shipped.
- Google login (OD-07), DOCX-in-V1 (OD-08, implemented anyway), version-history depth (OD-11).
