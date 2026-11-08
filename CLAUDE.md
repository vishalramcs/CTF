# CLAUDE.md — SPIDEY tracXer

Spider-Man–themed beginner CTF for a live 75-minute college event (EYE club, PSG Tech). Next.js 15 + Supabase (Postgres + Realtime Broadcast) on Vercel.

## Read first
`docs/01-PRD.md` (what), `docs/02-TRD.md` (how, decisions are final), `docs/03-App-Flow.md` (screens and states), `docs/04-Design-Brief.md` (look), `docs/05-Backend-Schema.md` (tables and transaction recipes), `docs/06-Implementation-Plan.md` (milestones), and **`docs/07-Rules-v2.md`, which overrides them where they disagree** (dynamic scoring, no AI Mode), and **`docs/08-Question-Rules.md`, which overrides 07 where they disagree** (12 questions plus a Main Question, two-tier position scoring, coordinate fragments, final-location race, new ranking; no locations or Cosmic Keys), and **`docs/09-Key-Rules.md`, which overrides 08 where they disagree** (four keys and a sealed final message replace coordinate fragments), and **`docs/11-Fragment-Rules.md`, which overrides 09 for the goal** (six fragments, three North/South locations; keys hidden from teams), and **`docs/12-Main-Beacons-Locations.md`, which overrides 11 where they disagree** (Q13 has six beacon flags, one per fragment; 25-point place-name answers per location), and **`docs/13-Space-Signal.md`** adds the final step after the three locations (six fragments unlock a space signal and a celestial catalogue; naming the object is the final race, with bonus points), and **`docs/10-Flashy-Event.md`** adds the FLASHY SPIDER-MAN bonus event. If code and docs disagree, the docs win. Change a doc deliberately and say so.

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
7. **Questions are written by the organisers** (format: `QUESTIONS_TEMPLATE.md`). Claude may write or edit challenge content (hints, text) when an organiser asks; it must keep answers and flags unchanged unless told otherwise, and show the organiser the new text.
8. **Fragments are identical for all teams** and live only on `app.challenges` (`fragment_value`, `coordinate_order` = slot 1-6 = L1-N..L3-S, `order_clue`), never in team variants. They reach a team only after it solves that question, or finds the matching Main Question beacon flag (docs/12). A location's text (`app.final_coordinates`) reaches a team only when it holds both of that location's fragments. Variants change the question values and the team token.
9. **Every admin mutation writes `audit_log`**. Every submit of any kind writes an attempt row.
10. Inspect-surface clues (comments, meta, cookies `clue_*`, localStorage, headers `x-spidey-*`, robots.txt) are intended. They must hold dummy clue values only, never real tokens.
11. Original spider and web art only. No Marvel or Sony logos, mask, artwork, stills or music. Exceptions, by organiser decision: `public/event-logo.png` the Q3 evidence photo (`src/lib/workspace/files/q3-bugle/`) the Q11 specimen photo (`src/lib/workspace/files/q11-specimen/specimen_image.jpg`), the swing animation character (`public/swing/spiderman.webp`), the Spider-Man pose cutouts (`public/spidey/poses/`), the ending clip (`public/ending/spider-man-will-return.mp4`) and the leaderboard background (`public/swing/board-bg.webp`), which the organisers supplied and take responsibility for.
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
- Config values come from env or `event_state`, never hard-coded: `FLAG_PREFIX`, `MAX_SESSIONS_PER_TEAM` (= 1), points, bonuses.
