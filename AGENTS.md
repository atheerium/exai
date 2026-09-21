# AGENTS.md — Exaai

Next.js 15 (App Router) + React 19 + TypeScript + Prisma/PostgreSQL (Supabase, pooled) + Tailwind CSS v3 + bcrypt auth.

## Quick start

```bash
npm install            # postinstall runs: prisma generate
npx prisma db push     # sync schema to DB (no migrations — see DB note)
npx prisma db seed     # upserts 7 GuideConfig rows from src/data/guides.ts
npm run dev            # http://localhost:3000
npm test               # 11 explicit files via node --import tsx --test (no glob)
```

## Commands

| Command | Purpose |
|---|---|
| `npm test` | `node --import tsx --test` on **11 hardcoded files** (`package.json:12`). Adding a `*.test.ts` requires appending its path to the script — no glob. Single-file: `node --import tsx --test src/lib/guide.test.ts` |
| `npm run lint` | `next lint`. No Prettier/formatter configured. |
| `npm run build` | `next build` — local production build. |
| `npm run vercel-build` | `prisma generate && next build` — Vercel entrypoint (no `db push`/`db seed` here). |
| `npm run db:push` / `db:seed` | Aliases for `prisma db push` / `prisma db seed`. |
| `bash scripts/smoke.sh` | Full API E2E smoke test. Requires running dev server; `BASE_URL`/`EMAIL` overridable. |

## Database

- **PostgreSQL via Supabase** — `prisma/schema.prisma:9` `provider = "postgresql"`; `DATABASE_URL` is a Supabase pooled URL (`?pgbouncer=true&statement_cache_size=0`). Supabase Auth/Storage are not used — app auth is custom bcrypt+DB sessions.
- No migration history — use `prisma db push` (not `prisma migrate`). Seed is `prisma/seed.ts` via `tsx` (`package.json:prisma.seed`).
- **Smoke test conflict**: `scripts/smoke.sh:8,124` validates DB via `sqlite3.connect("prisma/dev.db")` — only works if `DATABASE_URL` points to local SQLite. With Supabase, DB-assertion portions fail.

## AI generation provider

- Facade: `src/lib/generate/index.ts` — API layer never imports providers directly; swap via env var.
- `AI_PROVIDER=mock` (default) — deterministic, seeded from `src/data/themes.ts`, no API key.
- `AI_PROVIDER=openai` — `OPENAI_API_KEY` required; optional `OPENAI_MODEL` (default `gpt-4o-mini`), `OPENAI_BASE_URL`.
- `AI_PROVIDER=groq` — `GROQ_API_KEY` required; optional `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `GROQ_BASE_URL` (`src/lib/generate/groq.ts`).
- All candidates pass `validateCandidate()` (structure, marks, item counts) before reaching the teacher. Enforced totals: Part One = 7, Text Exploration = 8, Writing = 5 (BEM guides use 7/7/6 but still sum to 20).

## Auth & access control

- bcrypt + httpOnly DB session cookies (`SESSION_COOKIE_NAME` default `exai_session`, `SESSION_TTL_DAYS` default 30).
- Login throttling: 5 attempts / 15 min per IP+email → `429` with `Retry-After`.
- Password recovery: single-use hashed tokens in `PasswordResetToken`; reset invalidates all sessions. Non-production returns reset link as `devUrl` in JSON (no email). Production without SMTP returns `500` on forgot-password.
- Admin `/ops` (US-030): gated by `ADMIN_EMAILS` env (comma-separated). Without it, `/ops` returns `404` for everyone.

## Next.js / toolchain quirks

- `next.config.mjs:6` `serverExternalPackages: ["pdfkit"]` — required; `pdfkit` loads AFM fonts from `node_modules` at runtime. Removing breaks PDF export.
- `tsconfig.json:17` path alias `@/*` → `./src/*`. App Router: server components by default, `"use client"` only where interactive.
- `.opencode/` plugin (`@opencode-ai/plugin`) installed; `opencode.json` points MCP server at Supabase (`project_ref=jdbwbfvixryrwdxusyau`).
- `.env` is gitignored; copy from `.env.example`. `.env.local` holds live Supabase credentials (access token, `DATABASE_URL`, anon/service keys) — do not commit.
- No `.github/workflows/` — no CI configured.

## Key source layout

- API routes: `src/app/api/` — exams nest under `exams/[id]/{generate,replace,revisions,export,apply-task,favourites}`; also `auth/`, `catalog/`, `custom-tasks/`, `favourites/`
- Guide rules: `src/data/guides.ts` (typed curriculum, per-stream unit filtering) + `GuideConfig` DB table (version/sourceRef governance, seeded)
- Generation: `src/lib/generate/` (`index.ts` facade, `mock.ts`, `openai.ts`, `groq.ts`, `provider.ts`)
- Export (shared model): `src/lib/export/assemble.ts` → `pdf.ts` + `docx.ts` (preview and exports share same model)
- Types: `src/types/index.ts`
- App pages: `src/app/(app)/{builder,dashboard,library,favourites,ops}`
