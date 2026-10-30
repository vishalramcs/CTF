# 06 — Implementation Plan

**Product:** SPIDEY tracXer — Search the SpiderXman
**How to use this:** Claude Code builds one milestone at a time. After each milestone it **stops**, summarises what it built and how it verified it, and waits for "continue". Every milestone ends with its acceptance checks passing.

---

## 0. Ground rules for every milestone
- Follow `CLAUDE.md` and docs 01–05. If something must change, update the doc in the same milestone and say so.
- Track work with TaskCreate/TaskUpdate (one task per bullet group).
- No secrets in code or git. Only `.env.example` is committed.
- Each milestone adds tests for what it built and runs the full suite (`pnpm test`) before stopping.
- Use the latest stable library versions. Check current API docs (Context7 or official docs) before writing integration code for Next.js, Supabase, Drizzle and `@node-rs/argon2`.
- Commit at the end of each milestone: `git commit -m "M<n>: <title>"`.

## 1. Milestones

### M1 — Foundation
**Build**
- Scaffold Next.js 15 (App Router, TS strict, `src/`), Tailwind v4, shadcn/ui init, ESLint and Prettier, pnpm.
- Supabase CLI config (`supabase init`, `config.toml`). Development uses a separate cloud Supabase project, so Docker isn't needed; `supabase start` still works if you prefer a local stack. Copy `supabase/migrations/0001_init.sql` and `0002_security.sql` exactly from 05-Backend-Schema §8.
- `src/lib/env.ts` (Zod-validated env, fails fast). `.env.example` from TRD §3.
- `src/lib/db/client.ts` (postgres-js, `prepare:false`, `max:1`) and `src/lib/db/schema.ts` (Drizzle table definitions matching the SQL, with `pgSchema('app')`). **The SQL migrations remain the source of truth.** Drizzle is for typed queries only. Do not run `drizzle-kit push`.
- `src/lib/crypto/{hmac,aead,tokens}.ts` with unit tests.
- `scripts/gen-secrets.ts` (prints a filled `.env.local` block).
- `scripts/seed.ts` (§3): 1 admin, 10 test teams, practice + 10 placeholder challenges, event_state reset, variants generated with the `placeholder` generator. It writes `seed-output/credentials.csv` and `seed-output/test-flags.csv` (both gitignored).
- `tests/integration/schema.test.ts`: reproduce the checks from 05 §7 (constraints, view math, 30-way coordinate race, 20-way duplicate solve, anon denied).
- `README.md`: prerequisites, setup, scripts, folder map, links to docs.

**Accept**
- `pnpm db:push` applies the migrations to the dev project with no errors.
- `pnpm seed` runs twice in a row without errors (idempotent: it truncates the app tables first, and only runs when `NODE_ENV !== 'production'` or `--force` is passed).
- `pnpm test` is green. `pnpm build` succeeds.
- `git grep` finds no secret values. `.gitignore` covers `.env*` (except `.env.example`) and `seed-output/`.

### M2 — Authentication and sessions
**Build:** `lib/auth/{password,session,guards,csrf}.ts`; `/api/auth/{login,admin-login,logout,session}`; `/login` and `/admin/login` pages; `middleware.ts` redirects only; `requireTeam()` and `requireAdmin()` for route handlers and server components; login rate limits; **2-session cap with oldest eviction**; revoked-session modal; `scripts/bench-argon2.ts`.
**Accept:** unit tests for the token hash and CSRF; integration tests: a 3rd login evicts the oldest, an evicted session gets 401 `evicted`, admin cannot use team routes and vice versa, 11th failed login is rate-limited; argon2 bench reported (single hash ms, 100-parallel p95) and parameters chosen per TRD §5.1.

### M3 — Admin core
**Build:** admin layout and nav; Teams (bulk create → credentials CSV shown once, reset password, revoke sessions, view sessions with IP, user agent and last seen, hide/deactivate); Challenges (list, editor per App Flow §4.3 including fragment validation of 6 = 2E/2M/1D/1MD with unique orders 1–6, and the server-side "fragments reproduce configured coordinates ✓/✗" check); Event control (phase stepper with confirmation, submissions switch, coordinate config: answer → HMAC, hemisphere, bonus, trace → encrypted); Score adjustments; Audit log (every mutation writes `audit_log`).
**Accept:** E2E admin creates 3 teams and downloads the CSV; edits a challenge; changes phase; every action appears in the audit log; non-admin gets 403 on every `/api/admin/*` route (test loops over all routes).

### M4 — Participant core loop (variants, dashboard, challenge, scoring)
**Build:** `lib/variants/{derive,render}.ts` + generator registry + `placeholder` generator; regenerate-variants action; `/dashboard`; `/challenge/[number]` server-rendered with inspect surfaces (TRD §9) opening in a new tab; `/api/challenges*`; flag normalize/verify; submit transaction exactly as TRD §8.4 / 05 §5; hints; practice challenge rules; `/api/me`.
**Accept:** unit tests for normalisation (case, whitespace, wrong prefix, malformed); integration tests: correct flag → 1 solve with phase-correct points (`main_ctf` 100, `ai_mode` 50, Main Difficult 500 in both); another team's flag is rejected; 6th wrong attempt in 60 s is rate-limited; 20 parallel correct submits give 1 solve; onboarding locks real challenges, finale closes all; **secret-leak scan** (TRD §12) is clean for 2 teams.

### M5 — Coordinates
**Build:** `/coordinates` page (fragments with order clues, assembler, free-text submit); `lib/coordinates/{normalize,submit}.ts`; `/api/coordinates*`; first-winner transaction (05 §5); winner bonus.
**Accept:** normaliser unit tests (≥20 formats incl. `11.0247, 77.0028`, `11.0247N 77.0028E`, `N11.0247 E77.0028`, extra spaces, degree sign, too few or too many decimals, out-of-range); integration: 30 parallel correct submits → exactly 1 winner, others `locked`; rate limit 5/min; fragments only appear after solving their challenge; correct coordinates never appear in any response before the finale.

### M6 — Realtime, leaderboard, projector
**Build:** `lib/realtime/broadcast.ts` (REST broadcast with service key, plus the gate); `client.ts` + `leader.ts` (navigator.locks leader + BroadcastChannel relay + 15 s polling fallback + reconnect resync); `/api/public/state` (CDN cache headers, snapshot when frozen) and `/api/public/feed`; `/leaderboard`; dashboard live updates; phase banners; winner takeover; freeze/unfreeze; `/screen` projector page; connection dot; `/api/time` clock offset.
**Accept:** E2E with 2 browser contexts: a solve in A shows in B within 2 s; a phase change shows a banner in both; with Realtime blocked, B still updates within 15 s; frozen board stays frozen for participants while the admin sees live; one browser with 4 tabs opens exactly 1 WebSocket.

### M7 — Surprises and Morse
**Build:** Spidey Signal (trigger, random active team excluding the last one, derived code, reveal, submit, 60 s + grace); Flash Spidey (asset preload, synced start, question after show, `max_winners`); Mutation (targets, expiry); Morse (encode, timeline, start/pause/resume/stop, expiry extended by pauses, synced playback, submit); `/api/me/pending`; ping handling; admin pages for all four; optional `inbox_tag` routing.
**Accept:** unit tests for the Morse encoding of 0–9 and the timeline lengths; integration: the signal reveal returns 403 for non-target teams; codes cannot be redeemed twice; `max_winners`=3 with 10 parallel correct answers awards exactly 3; Morse pause/resume keeps two clients in sync within ±1 unit (E2E sampling); no answer, code or digits appear in any broadcast payload (test captures broadcasts).

### M8 — Toolkit, Manual, question import
**Build:** `/toolkit` (all tools in PRD TOOL-1, client-only, lazy-loaded); `/manual` (sections written to match the concepts the organisers' questions use); the full template renderer and transforms (§2); per-team file generators `exif-image`, `log-file`, `text-file`; `/vault/[slug]` header route and `robots.txt` lines; `scripts/import-questions.ts` for `QUESTIONS.md` (format: `QUESTIONS_TEMPLATE.md`); `scripts/check-content.ts`. **Then import the organisers' questions** when they provide `QUESTIONS.md`. Do not invent question content.
**Accept:** unit tests for every transform and generator (round-trip: rendered clue decodes back to the exact flag for 3 random teams); the importer rejects a file that breaks any rule in the template's §7 with a clear message per block; `check-content` passes on the organisers' file; a club member solves every imported challenge using only the manual + toolkit and times it (target: Easy ≤ 4 min, Medium ≤ 8, Difficult ≤ 12, Main ≤ 20).

### M9 — Finale and polish
**Build:** Grand Finale action (idempotent: snapshot, close submissions, phase finale, broadcast); `/finale` cinematic per App Flow §3.9 (reduced-motion variant, late joiner end card, replay); design pass to the Design Brief (tokens, fonts, components, phase theming, copy); accessibility pass (keyboard, focus, aria-live, contrast); mobile layouts.
**Accept:** pressing finale twice causes no double effects; every client navigates to `/finale`; all submit endpoints return `closed`; Lighthouse accessibility ≥ 95 on dashboard, challenge and leaderboard; dashboard JS ≤ 250 KB gzipped.

### M10 — Load test, rehearsal, deploy
**Build:** k6 scripts in `load/` (TRD §12); `scripts/export-results.ts`; Vercel project + env vars; Supabase production project (Pro for the event month); `docs/event-ops.md` from Appendix B.
**Accept:** load test on the production-like stack meets PRD NFR-2 with 0 duplicate awards and 0 extra winners; full rehearsal (Appendix A) passes with 10+ real people; backups exported; credentials printed.

## 2. Challenge content (written by the organisers)

**The organisers write all questions.** Claude Code builds the platform and the import path, never the question content. The hand-over format is `QUESTIONS_TEMPLATE.md` at the repo root: one YAML block per challenge, using placeholders such as `{{flag|base64}}`, `{{token}}`, `{{fragment}}`, `{{rand:N:M}}`, plus inspect-surface and per-team file options.

Fixed structure the platform enforces (change #2):

| Slot | Difficulty | Points (Main / AI) | Fragments |
|---|---|---|---|
| 0 | Practice | 0 / 0 | none |
| 1–4 | Easy | 100 / 50 | 2 of 4 |
| 5–7 | Medium | 200 / 100 | 2 of 3 |
| 8–9 | Difficult | 300 / 150 | 1 of 2 |
| 10 | Main Difficult | 500 / 500 | 1 |

- The organisers choose which challenges carry fragments, the `coordinate_order` (1–6) and the order clue text.
- Coordinate format: `LAT.LLLL,LON.LLLL`; fragment order 1 = lat integer, 2–3 = lat decimals, 4 = lon integer, 5–6 = lon decimals. Placeholder until the real one is given: `11.0247,77.0028`.
- Flag modes: **team** (default; `flag_template` such as `{{fragment}}_{{token}}`, must contain `{{token}}`) or **static** (same for all teams, allowed per question with a warning; the static flag must contain its fragment, checked when entered).
- Until the real questions arrive, the seed uses obvious placeholder questions (`PLACEHOLDER — question N`) so every feature can be built and tested.

What the platform must provide so any question can be expressed:
- Template renderer with the placeholder and transform set in `QUESTIONS_TEMPLATE.md` §3 (chainable transforms, stable per-team randomness from the variant seed).
- Inspect surfaces (§4 of the template): HTML comment, meta, hidden elements, JSON clue block, `clue_*` cookies, localStorage, `x-spidey-*` headers on `/vault/<slug>`, `robots.txt` lines.
- Built-in per-team file generators: `exif-image` (base image + EXIF field template), `log-file` (template + `{{noise:N}}` random lines), `text-file` (template).
- An importer: `pnpm import-questions QUESTIONS.md` validates every block (§7 of the template), upserts challenges, hints and assets, then regenerates variants. The admin editor accepts the same fields.

## 3. Seed specification (`scripts/seed.ts`)
1. Refuse to run against production unless `--force`. Use `DIRECT_DATABASE_URL`.
2. `TRUNCATE` all `app.*` tables except `broadcast_gate` (`RESTART IDENTITY CASCADE`), then re-insert the `event_state` singleton and reset `broadcast_gate.last_sent_at` to epoch. `event_state` must be truncated too, because it has a foreign key to `teams`. Refuse to run on a non-local database unless its project ref equals `WIPEABLE_DB_REF` or `--force` is passed.
3. Admin: `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (required, ≥ 12 chars), Argon2id.
4. 10 test teams: `Test Team 01`…`10`, usernames `team01`…`team10`, random passwords. Mark them `is_hidden=false` in dev so they appear on boards.
5. Challenges: practice + 10 **placeholder** challenges (`PLACEHOLDER — question N`, the question shows `{{flag|base64}}` so it is solvable in tests), correct difficulty split and points (100/50, 200/100, 300/150, 500/500), default fragment slots #1, #2 (Easy), #5, #6 (Medium), #8 (Difficult), #10 (Main) with orders 3, 5, 2, 6, 4, 1 and the placeholder fragments `47`, `00`, `02`, `28`, `77`, `11`, `flag_template` `{{fragment}}_{{token}}` (or `{{token}}` without a fragment), 2 placeholder hints each, `is_published=true`. The organisers' import later replaces all of this.
6. Event config: coordinate answer `11.0247,77.0028` → HMAC; hemisphere N/E; bonus 300; trace `{"place":"PLACEHOLDER","text":"Spider-Man was found here."}` → encrypted.
7. Variants for every team × challenge. Write `seed-output/test-flags.csv` (team, challenge, flag) **for development only**.
8. Print a summary table and the paths of the output files.

## 4. Definition of done (whole project)
Everything in PRD §5 and the plan's acceptance checklist, plus: secret-leak scan clean; 30-way coordinate race test green; Morse stays in sync across 3 devices; rehearsal signed off by 2 organisers; production backups taken; organiser runbook printed.

---

## Appendix A — Rehearsal script (3+ days before)
1. Seed production-like data on the event stack; create 10 real test teams; print slips.
2. 10–20 volunteers log in at once (2 devices per team: verify a 3rd device evicts the oldest).
3. Onboarding: everyone solves practice. Admin → Main CTF.
4. Solve 2–3 challenges per team; watch the projector board and feed.
5. Admin → AI Mode; confirm halved points on new solves only.
6. Trigger Spidey Signal ×2, Flash ×1, Mutation ×1, Morse ×1 (pause and resume once).
7. Three teams submit correct coordinates within the same second → one winner.
8. Kill Wi-Fi on one laptop for 30 s → it recovers and resyncs.
9. Freeze → Grand Finale → all screens play the finale; submissions closed.
10. Export results; reset for the event (`seed --force`, then import the organisers' `QUESTIONS.md`, set the real coordinates, create the real teams).

## Appendix B — Event-day runbook (EYE club)
| Time | Action | Owner |
|---|---|---|
| Day before | Organisers' questions imported and frozen; real coordinates and trace set; variants regenerated; check-content script green; export DB; print credential slips | Admin |
| 4:15 PM | Open admin panel + `/screen` on the projector; confirm phase = onboarding, submissions open, board unfrozen, coordinates unlocked | Admin |
| 4:30 PM | DB export #2; check Supabase and Vercel dashboards are green | Tech |
| 4:45 PM | Hand out slips; teams log in (≤ 2 devices each); walk through dashboard, manual, toolkit, practice | Hosts |
| 5:00 PM | **Main CTF** (phase button) | Admin |
| 5:00–5:40 | Watch the monitor; trigger 1 Spidey Signal and 1 Flash; answer help-desk questions | Admin + hosts |
| 5:40 PM | **AI Mode** (phase button); announce it on the mic | Admin |
| 5:40–6:00 | Morse transmission (≈ 5 min); Mutation; 1–2 more signals | Admin |
| 6:00 PM | **Grand Finale** (type FINALE) | Admin |
| After | Export results; purge `submitted_preview`; downgrade Supabase plan after the month | Tech |

**Incident playbook**
- *A team says its flag is right but it is rejected:* use "Test a flag" in the editor for that team. If the variant is wrong, regenerate that team's variant and award the points with a manual adjustment (with a reason).
- *Realtime looks dead:* clients keep working through 15 s polling. Check the Supabase Realtime dashboard, and tell teams to refresh.
- *Wrong phase clicked:* switch back. Solves keep the phase they were committed in, so fix any wrongly scored solves with adjustments.
- *Leaked credentials:* revoke sessions + reset the password for that team, and hand them a new slip.
- *Site down:* Vercel → previous deployment → Promote. The database is untouched.
