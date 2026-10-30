# 07 — Rules v2 (supersedes conflicting parts of docs 01–06)

Source: the organisers' "Master Software Development Prompt" (SPIDEY CTF – The Multiverse Crisis), §1–16. The stack stays Next.js + Supabase Postgres on Vercel. Where this doc and docs 01–06 disagree, **this doc wins**. Docs 01–06 carry a pointer to it. Everything not mentioned here (security rules, variants, inspect surfaces, templates, realtime design) stays as written.

## 1. Removed
- AI Mode: no `ai_mode` phase, banner, chip or halved points. `ai_points` is dropped.
- Coordinate "first correct team wins" bonus, `winners`, `coordinate_submissions`, the 6-slot Coordinate Board (replaced by §4).
- Morse transmissions and Spidey Signal codes (replaced by the three fixed surprises, §5).
- The practice challenge (number 0). Add back only if the organisers ask.
- Individual registration, team join codes, 4-member cap, PARTICIPANT role: login stays one shared login per team (§2).

## 2. Identity and sessions
- One login per team, created by an admin. Username = a short team code (e.g. `team07`), **not shown on any public page**. Password = the team name lowercased, trimmed, spaces removed, reversed; stored as Argon2id like every other password. Reset-password restores the same derived value.
- **Known weakness, accepted by the organisers:** the password is derivable from the team name, which is public. The hidden username is the only barrier. Revisit before the event.
- `MAX_SESSIONS_PER_TEAM = 1`. A new login ends the old session (existing M2 behaviour, reason `evicted`).
- Admin roles: `SUPER_ADMIN` and `DEVELOPER` (replaces `admin`). Only SUPER_ADMIN grants or revokes developer access. Both reach `/admin`; role-restricted actions are checked server-side.
- Event status (replaces phases): `not_started` → `running` ⇄ `paused` → `ended`. Submissions are accepted only while `running`.

## 3. Challenge scoring (dynamic decay)
Base points: Easy 60 (×4), Medium 110 (×3), Hard 175 (×2), Main 400 (×1). Total 1320.

`awarded = base − 0.5 × (successful team solves before this one)`

- Computed only on the server, in one transaction: `pg_advisory_xact_lock(hashtext('solve:'||challenge_id))`, count prior solves, insert the solve (with `solve_position`) and its ledger row. `UNIQUE(team_id, challenge_id)` stays as the backstop.
- Wrong flags change nothing. A repeat by the same team awards nothing.
- Points are `numeric(7,1)` and summed in SQL, never as JS floats.

## 4. Locations and Cosmic Keys
Location points are fixed (3 × base) and separate from challenge points. Each team earns each location once.

| Level | Unlock rule | Location points | Key |
|---|---|---|---|
| Easy | Solve any 2 of the 4; the fragments they carry (configurable) unlock the decoder | 180 | Easy Cosmic Key |
| Medium | Fragments sit on specific challenges (e.g. M1 = A, M3 = B); solving M1+M2 gives A only; all required fragments unlock the decoder | 330 | Medium Cosmic Key |
| Hard | Both challenges solved | 525 | Hard Cosmic Key |
| Main | Main flag correct unlocks main coordinates and the combining instructions (may use earlier fragments, configurable) | 1200 | Main Cosmic Key |

- Developers configure which challenge gives which fragment, and each location's expected answer (stored as HMAC, never returned).
- Unrecovered fragments are never sent to a team that hasn't earned them (leak scan covers this).
- A correct submission writes one `location_achievements` row, one ledger row and one `team_cosmic_keys` row with a timestamp. None can repeat.
- This replaces the old rule that fragments are identical on all teams: fragments are still the same for every team, and still live only on the server, but now come from the configurable mapping.

## 5. Surprises (exactly three, fixed rewards)
Spidey Signal 30, Flashy Spider 50, Spider Mutation 70 (total 150). Each: enable/disable, availability time, task/question and answer or video set by a developer, one reward per team, discovery and completion timestamps, completion history. Flashy Spider plays a video, then asks a question. Answers are hashed and verified on the server, rate-limited like other attempts.

## 6. Score ledger and leaderboard
- `score_transactions` is the single source of truth. Categories: `challenge`, `location`, `surprise`, `adjustment`. Manual adjustments need a reason and write `audit_log`.
- Leaderboard columns: rank, team, challenge points, location points, surprise points, total (plus solved count, locations, surprises done).
- Order: higher total, then earlier time of reaching that total, then shared rank. Top 3 get gold, silver, bronze. Never exposes flags, answers, passwords or unrecovered fragments.
- Theoretical maximum 3705 (1320 + 180 + 330 + 525 + 1200 + 150), before decay.

## 7. Database changes (migration 0003, in R1)
Add: `score_transactions`, `locations`, `location_submissions`, `location_achievements`, `cosmic_keys`, `team_cosmic_keys`, a fragment-mapping table, `announcements`. Alter: `challenges` (new points, drop `ai_points`/practice/old fragment columns), `solves` (`solve_position`, numeric points), `users.role`, `event_state` (status), `surprise_events` (three fixed rows). Drop: `winners`, `coordinate_submissions`, morse and signal tables. Replace `v_scoreboard`, `v_public_scoreboard`, `v_public_feed` with ledger-based views. Keep RLS deny-all and server-only access.
