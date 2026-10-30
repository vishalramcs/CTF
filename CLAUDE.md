# CLAUDE.md — SPIDEY tracXer

Spider-Man–themed beginner CTF for a live 75-minute college event (EYE club, PSG Tech). Next.js 15 + Supabase (Postgres + Realtime Broadcast) on Vercel.

## Read first
`docs/01-PRD.md` (what), `docs/02-TRD.md` (how, decisions are final), `docs/03-App-Flow.md` (screens and states), `docs/04-Design-Brief.md` (look), `docs/05-Backend-Schema.md` (tables and transaction recipes), `docs/06-Implementation-Plan.md` (milestones), and **`docs/07-Rules-v2.md`, which overrides them where they disagree** (dynamic scoring, locations, Cosmic Keys, no AI Mode). If code and docs disagree, the docs win. Change a doc deliberately and say so.

## Workflow
- Build **one milestone at a time** (06 §1). At the end of each: run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, commit `M<n>: <title>`, then **stop**, summarise what was built and verified, and wait for "continue".
- Track work with TaskCreate/TaskUpdate.
- Check current library docs before writing integration code (Next.js, Supabase, Drizzle, @node-rs/argon2).

## Non-negotiable rules
1. **Server decides everything:** correctness, points, phase, time, winner. Never trust client values.
2. **Secrets never reach the browser:** no flag, flag hash, HMAC key, coordinates, Morse digits, surprise answer or unrevealed signal code in HTML, JS bundles, API responses, logs or Realtime payloads. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be public.
3. **Database access is server-only**, through Drizzle on schema `app`. Never query app tables with supabase-js from the browser. Never add `app` to the exposed schemas.
4. **The SQL migrations are the source of truth** (`supabase/migrations/`). Drizzle schema mirrors them for typing only. Never `drizzle-kit push`.
5. **Use the transaction recipes in 05 §5 exactly** (advisory locks, `FOR SHARE`/`FOR UPDATE` on `event_state`, `ON CONFLICT DO NOTHING`).
6. **Realtime = public Broadcast pings only** (TRD §6). Team-specific data is fetched from authenticated APIs after a ping. One socket per browser (leader tab).
7. **Questions are written by the organisers** (format: `QUESTIONS_TEMPLATE.md`). Never invent challenge content; use placeholders until `QUESTIONS.md` arrives.
8. **Fragments are identical for all teams** and live only on the server (the configurable fragment mapping, 07 §4). They reach a team only after it earns them. Variants change the question values and the team token.
9. **Every admin mutation writes `audit_log`**. Every submit of any kind writes an attempt row.
10. Inspect-surface clues (comments, meta, cookies `clue_*`, localStorage, headers `x-spidey-*`, robots.txt) are intended. They must hold dummy clue values only, never real tokens.
11. Original spider and web art only. No Marvel or Sony logos, mask, artwork, stills or music.
12. Never commit `.env*` (except `.env.example`) or `seed-output/`.

## Commands (keep this list current)
- `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`
- `pnpm db:push` (applies migrations to `DIRECT_DATABASE_URL`, no Docker needed)
- `pnpm seed` (dev data, wipes app tables), `pnpm gen-secrets`, `pnpm bench:argon2`
- `pnpm test` needs `.env.local` and wipes the dev project's app tables, so run `pnpm seed` afterwards.

## Conventions
- Route handlers: `src/app/api/**/route.ts`, `export const runtime = 'nodejs'`, wrapped with `withTeam()` / `withAdmin()`, Zod-validated bodies, error shape `{ error: { code, message, retryAfter? } }`.
- Mutating requests need the `x-csrf-token` header.
- Times are `timestamptz` and server-generated. The UI shows IST.
- Config values come from env or `event_state`, never hard-coded: `FLAG_PREFIX`, `MAX_SESSIONS_PER_TEAM` (= 2), points, bonuses.
