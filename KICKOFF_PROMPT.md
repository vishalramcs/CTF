# Kickoff prompt — paste this into Claude Code

Put this whole `spidey-tracxer/` folder at the root of a new, empty git repo first (it already contains `docs/`, `supabase/migrations/` and `CLAUDE.md`). Then open Claude Code in that folder and paste everything below the line.

---

You are a senior full-stack engineer building **SPIDEY tracXer — Search the SpiderXman**, a Spider-Man–themed, beginner-friendly browser CTF for a live college event (about 30–35 teams, ≤ 2 devices per team, 75 minutes).

The plan is approved and fully specified. Read these before doing anything, in order:
1. `CLAUDE.md` (rules, non-negotiable)
2. `docs/01-PRD.md` (requirements with IDs)
3. `docs/02-TRD.md` (stack and all technical decisions; these are final)
4. `docs/03-App-Flow.md` (every screen, state and flow)
5. `docs/04-Design-Brief.md` (visual system)
6. `docs/05-Backend-Schema.md` (schema, transaction recipes; the migration SQL in `supabase/migrations/` is already written and tested, so use it as-is)
7. `docs/06-Implementation-Plan.md` (milestones M1–M10 with acceptance checks)
8. `QUESTIONS_TEMPLATE.md` (the format the organisers use to hand over their questions)

Key decisions to respect (already in the docs):
- Next.js 15 App Router + TypeScript, route handlers in `src/app/api/`, Supabase Postgres in a private schema `app`, Drizzle (typed queries only, the SQL migrations are the source of truth), Supabase Realtime **public Broadcast pings only** plus authenticated fetches for team-specific events, Argon2id via `@node-rs/argon2` tuned for serverless, Vercel hosting.
- **`MAX_SESSIONS_PER_TEAM=2`**: a 3rd login evicts that team's oldest session.
- Fragments are identical for all teams and live only on `challenges`. All 10 challenges are team-specific through HMAC-derived variants.
- **The organisers write every question.** Build the platform, the template renderer and the importer; use placeholder questions until `QUESTIONS.md` arrives. Never invent challenge content.
- 6 fragment challenges spread 2 Easy, 2 Medium, 1 Difficult, 1 Main Difficult, with a hidden `coordinate_order`.
- Scoreboard is the single SQL view `app.v_scoreboard`. Rate limits on flags, coordinates, surprises, Morse and signal codes.
- Points: 100/200/300/500 in Main CTF; 50/100/150/500 in AI Mode, decided by the phase at commit time.

How to work:
- Build **one milestone at a time**. Track tasks with TaskCreate/TaskUpdate.
- At the end of each milestone, run lint, typecheck, tests and build, commit, then **stop**, summarise what you built and how you verified it (including test output), list anything you changed in the docs, and **wait for my "continue"**.
- If a doc is ambiguous or wrong, ask me (or pick the safest option and say so) before building on it. Do not silently diverge.
- Never hardcode secrets. Only `.env.example` is committed.

**Start now with Milestone 1 (Foundation) only**, exactly as described in `docs/06-Implementation-Plan.md` §1 M1 and §3 (seed specification).
