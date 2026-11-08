# 01 — Product Requirements Document (PRD)

> **Rules v2:** parts of this document are superseded by [07-Rules-v2.md](07-Rules-v2.md) (scoring, login, locations, surprises, no AI Mode). Where they disagree, 07 wins.

**Product:** SPIDEY tracXer — Search the SpiderXman
**Type:** Browser-based, beginner-friendly, Spider-Man–themed CTF for a live college event
**Organiser:** EYE club, PSG College of Technology
**Version:** 1.0 (plan approved, with the change set applied)
**Read with:** 02-TRD, 03-App-Flow, 04-Design-Brief, 05-Backend-Schema, 06-Implementation-Plan

---

## 1. Summary

Spider-Man's signal has been lost. Teams log in to one website. They solve 10 embedded challenges, collect 6 coordinate fragments, work out the right order, and submit Spider-Man's coordinates. The first correct coordinate submission wins the "trace" and gets a bonus. Play then continues on points until the 6:00 PM Grand Finale. A live scoreboard, admin-triggered surprise events and a Morse-blinking spider make it an event rather than a plain CTF.

No prior security knowledge is needed. A beginner manual and a built-in toolkit cover everything.

## 2. Goals and non-goals

### Goals
1. Run a 75-minute live event for about 60–100 participants in teams, with no downtime and no scoring disputes.
2. Be beginner-friendly: every challenge can be solved with the manual and the built-in toolkit.
3. Be cheat-resistant: flags and coordinates never reach the browser, answers are team-specific, and every score is decided by the server.
4. Feel live: the scoreboard, solve feed, phase banners, winner announcement and finale reach every screen within about 2 seconds.
5. Let one admin run the whole event from a single panel.

### Non-goals (v1)
- Public sign-up, email, OAuth or password recovery by email.
- Dynamic scoring (points decaying with the number of solves). Points are fixed by difficulty and phase.
- Paid hints or hint penalties. Hints are free.
- Running participant-supplied code. Only admin-authored challenge content is ever rendered.
- Multi-event or multi-tenant support. One event per deployment.
- Native mobile apps. The site is mobile-responsive, but laptops are the primary device.

## 3. Users and roles

| Role | Who | Access |
|---|---|---|
| **Admin** | 1–3 EYE club organisers | `/admin/*`. Full control: teams, challenges, phases, surprises, Morse, scores, finale, audit. |
| **Team** | One shared login per team, up to **2 concurrent devices** (`MAX_SESSIONS_PER_TEAM=2`) | Participant pages only. Sees only its own variants, solves and fragments. |
| **Screen** | Projector in the venue | `/screen`, opened under an admin session. Public leaderboard, feed and finale cinematic. |

There is no public sign-up. The admin bulk-creates team credentials before the event.

## 4. Event schedule (confirmed)

| Time (IST) | Phase (`event_phase`) | What happens |
|---|---|---|
| 4:45–5:00 | `onboarding` | Log in, tour the dashboard, read the manual, try the toolkit, solve the 0-point **practice challenge**. Real challenges are visible but locked. |
| 5:00–5:40 | `main_ctf` | All 10 challenges open. Full points. |
| 5:40–6:00 | `ai_mode` | AI tools allowed. Easy, Medium and Difficult points halve. Main Difficult stays at 500. |
| 6:00 | `finale` | Leaderboard freezes, submissions close, rankings and the final trace are revealed, cinematic ending plays. |

The admin changes phases manually. The system never changes phase on a timer, but the admin panel shows a clock and reminders.

## 5. Functional requirements

Each requirement has an ID so code, tests and milestones can refer to it.

### 5.1 Authentication and sessions
- **AUTH-1** The admin logs in at `/admin/login`. Teams log in at `/login`. These are separate forms with role checks on the server.
- **AUTH-2** Passwords are hashed with Argon2id, tuned for serverless CPU (see TRD §5).
- **AUTH-3** Sessions use random tokens in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Only the SHA-256 of a token is stored.
- **AUTH-4** A team may have **at most 2 active sessions** (`MAX_SESSIONS_PER_TEAM`, default 2). A 3rd login revokes that team's oldest session, and the kicked device sees "Logged in elsewhere".
- **AUTH-5** The admin can revoke all sessions of a team and reset its password.
- **AUTH-6** Login is rate-limited: 10 failed attempts per username per 10 minutes, and 30 per IP per 10 minutes.
- **AUTH-7** Admin sessions expire after 12 hours. Team sessions expire after 8 hours.

### 5.2 Participant dashboard
- **DASH-1** Shows 10 challenge cards (4 Easy, 3 Medium, 2 Difficult, 1 Main Difficult) plus the practice card. Each card shows number, title, difficulty, **current** point value (it changes in AI Mode), and solved or unsolved state.
- **DASH-2** All 10 challenges are open from the start of `main_ctf`, in any order.
- **DASH-3** Clicking a card opens `/challenge/[number]` **in the same tab**, behind a Spider-Man transition (a different one each time); Back returns to the dashboard. A modified click (Ctrl/middle) still opens a new tab. *(Changed 8 Nov 2026 by organiser decision; was: new tab.)*
- **DASH-4** Shows the team's live score and rank, a phase banner with a countdown to the next scheduled phase, and the live solve feed.
- **DASH-5** Links to Toolkit, Manual, Coordinate Board and Leaderboard.

### 5.3 Challenge page
- **CH-1** The challenge page shows the story, the question and the investigation materials (text, images, files, logs), rendered with this **team's variant values**.
- **CH-2** Participants are meant to inspect the page: HTML comments, meta tags, hidden elements, JS, response headers, cookies, localStorage and `robots.txt`. These clues are intended.
- **CH-3** Every flag has the form `SPIDEY{...}`. The prefix is set by `FLAG_PREFIX`. Submission is case-insensitive inside the braces, and surrounding whitespace is ignored.
- **CH-4** The submission box gives instant feedback: correct (with points and any fragment), wrong (with attempts left this minute), already solved, rate-limited (with retry time) or closed.
- **CH-5** Free hints can be revealed one at a time.
- **CH-6** After a solve, the page shows "Solved", the points awarded and, for fragment challenges, the fragment and its order clue.

### 5.4 Team-specific variants
- **VAR-1** **All 10 challenges are team-specific.** Question values and the flag token differ per team.
- **VAR-2** The coordinate fragment inside a flag is **identical for every team**. Only the token wrapper differs. Flag shape: `SPIDEY{<fragment>_<teamtoken>}` for fragment challenges and `SPIDEY{<teamtoken>}` otherwise.
- **VAR-3** Variants are derived from `HMAC(VARIANT_KEY, team_id:challenge_id)`. They are generated when a team or challenge is created, and the admin can regenerate them.
- **VAR-5** **The organisers write every question.** Questions use placeholders (`{{flag|base64}}`, `{{token}}`, `{{fragment}}`, `{{rand:N:M}}`, …) that the platform fills per team. The hand-over format is `QUESTIONS_TEMPLATE.md`. A question that cannot vary may use a **static** flag (same for every team); the editor warns about it.
- **VAR-4** A flag copied from another team is rejected as wrong.

### 5.5 Coordinates
- **COORD-1** 6 challenges carry fragments, spread as **2 Easy, 2 Medium, 1 Difficult, 1 Main Difficult**.
- **COORD-2** Each fragment is a 2-digit string. Its position (`coordinate_order` 1–6) is **not** shown. Teams work it out from order clues hidden in the challenge stories and in the Main Difficult challenge.
- **COORD-3** Coordinate format: `LAT.LATLAT,LON.LONLON`. Order 1 gives the integer part of the latitude, orders 2–3 its 4 decimals, order 4 the integer part of the longitude, orders 5–6 its 4 decimals. Example (placeholder): `11.0247,77.0028`. The hemisphere is fixed by event config (N/E by default).
- **COORD-4** The Coordinate Board lists the fragments this team has unlocked, by challenge number, with the order clue each challenge revealed, and 6 draggable slots for the team to arrange.
- **COORD-5** "Submit Final Coordinates" accepts free text such as `11.0247, 77.0028`, `11.0247N 77.0028E` or `11.0247,77.0028`. The server normalises it before checking.
- **COORD-6** The **first correct submission wins**, decided atomically. After that, coordinate submission is locked for everyone. The winner is announced live on every screen and gets `winner_bonus_points` (configurable, default 300).
- **COORD-7** Play continues on points until 6:00. The correct coordinates and the final trace are revealed only at the finale.
- **COORD-8** Coordinate submissions are limited to 5 wrong attempts per team per minute.

### 5.6 Scoring
- **SCORE-1** Points by difficulty and phase:

| Difficulty | `main_ctf` | `ai_mode` |
|---|---|---|
| Easy | 100 | 50 |
| Medium | 200 | 100 |
| Difficult | 300 | 150 |
| Main Difficult | 500 | 500 |

- **SCORE-2** Points depend on the phase **in the database at the moment the solve is committed**, never on the client clock.
- **SCORE-3** One solve per team per challenge, enforced by a unique constraint.
- **SCORE-4** Flag submissions are limited to 5 wrong attempts per team per challenge per minute. Every attempt is logged.
- **SCORE-5** Total score = challenge points + surprise points + Spidey Signal points + Morse points + manual adjustments + coordinate winner bonus. This is computed by **one SQL view** and never stored as a client-writable number.
- **SCORE-6** Ties are broken by whoever reached the score first (earliest last-scoring time), then by team name.
- **SCORE-7** The practice challenge is worth 0 points and is accepted only during `onboarding`, `main_ctf` and `ai_mode`.

### 5.7 Live features
- **LIVE-1** The public leaderboard (team name, score, solves, rank) updates for everyone within about 2 seconds of any score change.
- **LIVE-2** Solve feed: "Team X solved #4 — Spider Vision (+100)".
- **LIVE-3** Phase changes show a banner on every screen. AI Mode gets a distinct visual.
- **LIVE-4** The coordinate winner announcement shows on every screen at once.
- **LIVE-5** Leaderboard freeze: participants and the projector see the frozen snapshot. The admin sees the real board.
- **LIVE-6** After a disconnect, refresh or sleep, the client resyncs the full state from the API. It never relies only on missed realtime messages.

### 5.8 Surprise events (admin-triggered, server-validated)
- **SUR-1 Spidey Signal:** a spider symbol appears on **one randomly chosen active team's** screens for 60 seconds. Clicking it reveals a unique code, which the team submits for bonus points (default 50). The admin can trigger it repeatedly. By default a team cannot be chosen twice in a row.
- **SUR-2 Flash Spidey:** a short visual (image, GIF or short video, under 2 MB) flashes on all screens for a configurable 2–8 seconds, then a question appears. Correct answers earn bonus points. An optional `max_winners` limits it to the first N teams.
- **SUR-3 Spidey Mutation:** a surprise puzzle (encoded text, metadata, a hidden clue) is pushed to all teams or chosen teams, with an answer box and a closing time.
- **SUR-4 Morse Transmission:** the admin enters a number sequence. The server converts it to Morse, and a spider icon blinks it on target screens, in sync from server time. It repeats while active. The admin can start, pause, resume and stop it, and it expires after a configurable time (default 5 minutes). Teams submit the digits for bonus points (default 100).
- **SUR-5** All surprise and Morse answers are stored as hashes, validated on the server, limited to 5 wrong attempts per team per minute, and scored at most once per team.

### 5.9 Admin panel
- **ADM-1** Teams: bulk import from CSV or a count-based generator, credential CSV export (shown once), rename, deactivate, hide (test teams), reset password, revoke sessions.
- **ADM-2** Challenges: create and edit title, difficulty, points, story, question template, assets, generator, flag mode, fragment, `coordinate_order`, order clue, hints, publish toggle. A "Preview as team X" view, and "Regenerate variants".
- **ADM-3** Event control: phase buttons with confirmation, open/close submissions, freeze and unfreeze leaderboard, coordinate settings (answer, bonus, hemisphere, trace text).
- **ADM-4** Live monitor: every attempt across flags, coordinates, surprises and Morse, filterable by team and challenge, with suspicious-pattern highlighting (same wrong flag from several teams, bursts).
- **ADM-5** Surprises and Morse controls as in §5.8, with a target picker.
- **ADM-6** Manual point adjustment. A reason is required, and every adjustment is audited.
- **ADM-7** Audit log of every admin action and every security-relevant event.
- **ADM-8** Grand Finale button, which runs freeze, closes submissions, reveals rankings, reveals the final trace and starts the cinematic. It is idempotent: pressing it twice does nothing extra.

### 5.10 Toolkit and manual
- **TOOL-1** Client-side tools: Base64 encode/decode, Hex encode/decode, URL encode/decode, ROT-N / Caesar, a simple substitution helper, hash generator (MD5, SHA-1, SHA-256), image metadata (EXIF) viewer, log viewer with filter and search, text diff, and team notes saved in localStorage.
- **TOOL-2** The toolkit never sends input to the server.
- **MAN-1** The beginner manual covers every concept used by the 10 challenges, with one worked mini-example each, and how to use DevTools (Elements, Network, Application tabs).

### 5.11 Finale
- **FIN-1** The finale sequence plays on every screen: "Signal locked…", then the top 3, then the full rankings, then the coordinate winner, then the revealed coordinates and final trace, then "SPIDER-MAN WILL RETURN… IN SECRET WARS." 🕷️
- **FIN-2** After the finale starts, no submission of any kind is accepted.

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 | Supports 100 participants on about 120 devices at once, plus the admin and the projector. |
| NFR-2 | p95 latency: dashboard under 1.5 s, challenge page under 2 s, flag submit under 1 s, leaderboard update visible under 2 s. |
| NFR-3 | Zero double awards and zero double coordinate winners, under concurrency tests. |
| NFR-4 | No secret (flag, flag hash, HMAC key, coordinates, Morse sequence, surprise answers, unrevealed signal codes) ever appears in client bundles, HTML, API responses or realtime payloads. |
| NFR-5 | Works on current Chrome, Edge, Firefox and Safari, on laptops and on phones from 360 px wide. |
| NFR-6 | Respects `prefers-reduced-motion`. Morse blinking stays below 3 flashes per second. |
| NFR-7 | Initial dashboard JS stays under 250 KB gzipped. No large assets on the critical path. |
| NFR-8 | Data can be exported (CSV and JSON) before and after the event. |

## 7. Success metrics
- Every team that logs in solves at least the practice challenge and 1 real challenge.
- No scoring disputes that need a manual fix during the event.
- No downtime over 30 seconds. No realtime outage that resync does not fix.
- The coordinate winner is decided, and announced on every screen within 3 seconds.

## 8. Constraints and assumptions
- Hosting: reliability is preferred over zero cost. The recommended spend is about **$25 for one month** (Supabase Pro). See TRD §11.
- About 30–35 teams, each with up to 2 devices.
- Venue Wi-Fi may be unreliable, so the client must tolerate reconnects.
- Branding: original spider and web iconography only. No official Marvel logos, film stills, character art or soundtrack (see Design Brief §2).
- Flag prefix is `SPIDEY` by default and is configurable through `FLAG_PREFIX` (for example, `CyberSiege` if the club keeps its standard format).

## 9. Open items to settle before content freeze
1. The real coordinates and what the "final trace" shows (place name, map image, story text).
2. **The organisers' 10 questions + practice** in `QUESTIONS.md` (format: `QUESTIONS_TEMPLATE.md`), needed by Milestone 8, plus which 6 carry fragments, their order and order clues.
3. Team list (names) and the final team count.
4. Venue Wi-Fi capacity, and whether participants can use mobile hotspots as backup.
