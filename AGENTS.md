# AGENTS.md — Exaai

Next.js 15 (App Router) + React 19 + TypeScript + Prisma/PostgreSQL (Neon) + Tailwind CSS v3 + bcrypt auth.

## Quick start

```bash
npm install            # postinstall runs: prisma generate
npx prisma db push     # sync schema to DB (no migrations — see DB note)
npx prisma db seed     # seed 7 guide configs from src/data/guides.ts
npm run dev            # http://localhost:3000
npm test               # 6 test files, Node built-in runner via tsx
```

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Runs **6 specific test files** via `node --import tsx --test`. Adding a new `*.test.ts` requires appending its path to the `test` script — there is no glob. |
| `npm run lint` | `next lint`. No separate formatter (no Prettier configured). |
| `npm run build` | `next build` — local production build. |
| `npm run vercel-build` | **`prisma db push --skip-generate && prisma db seed && next build`** — use this on Vercel, not `npm run build`. |
| `bash scripts/smoke.sh` | Full API E2E smoke test. Requires a running dev server. |

## Database

- **PostgreSQL via Neon** — `prisma/schema.prisma` declares `provider = "postgresql"`; `.env` has a Neon pooled connection string.
- Schema changes use `prisma db push` (no migration history — no `prisma migrate`).
- Seed: `prisma/seed.ts` upserts 7 `GuideConfig` rows from `src/data/guides.ts`.
- **Smoke test conflict**: `scripts/smoke.sh` validates DB state by calling `sqlite3.connect("prisma/dev.db")` — this works **only** if `DATABASE_URL` points to a local SQLite file. The committed `.env` uses Neon PostgreSQL, so the DB-assertion portions of the smoke test will fail unless run against a local SQLite DB. (README claims SQLite for MVP; executable config overrides.)

## AI generation provider

- `AI_PROVIDER=mock` (default) — deterministic, seeded from `src/data/themes.ts`, no API key.
- `AI_PROVIDER=openai` — needs `OPENAI_API_KEY`; optional `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL` (any OpenAI-compatible endpoint).
- Facade: `src/lib/generate/index.ts` — the API layer calls the facade; swap providers by changing the env var, no code changes.
- All candidates pass `validateCandidate()` before reaching the teacher. Enforced mark totals: Part One = 7, Text Exploration = 8, Writing = 5.

## Auth & access control

- bcrypt + httpOnly DB session cookies (`SESSION_COOKIE_NAME` env, `SESSION_TTL_DAYS` default 30).
- Login throttling: 5 attempts / 15 min window per IP+email → returns 429 with `Retry-After`.
- Password recovery: single-use hashed tokens stored in DB; reset invalidates all sessions. In non-production, the reset link is returned as `devUrl` in the API JSON response (no email sent). Production without SMTP returns 500 on forgot-password.
- Admin `/ops` page access: set `ADMIN_EMAILS` env var (comma-separated emails). Without it, `/ops` returns 404 for everyone.

## Next.js config quirks

- `next.config.mjs` lists `pdfkit` in `serverExternalPackages` — it loads font AFM files from `node_modules` at runtime. Removing this entry breaks PDF export.
- App Router: server components by default; `"use client"` directive used only where interactivity is needed.

## Key source layout

- API routes: `src/app/api/` — exams nest under `exams/[id]/{generate,replace,revisions,export,apply-task,favourites}`
- Guide rules (typed config): `src/data/guides.ts` (MVP), governance metadata in `GuideConfig` DB table (seeded)
- Generation facade + providers: `src/lib/generate/`
- Export (shared document model): `src/lib/export/assemble.ts` → `pdf.ts` + `docx.ts`
- Shared domain types: `src/types/index.ts`
- App pages: `src/app/(app)/{builder,dashboard,library,favourites,ops}`
