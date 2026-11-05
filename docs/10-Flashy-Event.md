# 10 — FLASHY SPIDER-MAN (bonus event)

An admin-triggered, separate bonus event. It does not touch challenges, flags, keys or the
`flashy_spider` surprise from docs/07, which should stay disabled so no team can earn both.

## Flow
Admin triggers → every team gets a full-screen overlay (polled every 5 s, so a refresh or reconnect
gets the right state) → the team presses play (the server counts it, at most 2) → once the server's
clock says the video can have finished, the four options appear → one answer, or SKIP EVENT.

## Rules the server enforces
- Team identity is the session. Nothing about a team, a score or correctness comes from the client.
- At most **2 playbacks per team per run**. One SQL statement locks the team's row and checks the
  count, so parallel requests cannot pass it.
- The options appear, and an answer is accepted, only after `video_seconds - 5` seconds from the
  team's latest playback. **This is a time check, not proof anyone watched.** The video URL is public
  once a team has it, and a viewer can seek or open it directly.
- **One attempt.** A wrong answer ends it; the response never says which option was right.
- The correct option is stored only as `HMAC(FLAG_HMAC_KEY, 'flashy:' + label)` in `answer_hash`.
  The admin enters it in the panel; it is not in code, migrations or any response.
- The bonus is written once to `score_transactions` (category `surprise`, ref_type `flashy_run`,
  ref_id = the run). The existing unique index on (team, ref_type, ref_id) is the last guard. A bonus
  of 0 writes no row. The default bonus is 0.
- Skip is stored, pays 0, and cannot be reopened. Ending the run (row lock) refuses all later
  playbacks, answers and skips. Triggering again makes a new run with a new chance to earn.
- Settings are copied into the run when it starts, so editing them mid-run changes nothing for it.
- One live run at a time (partial unique index), so a double-clicked Trigger starts one.

## Where
Migration `0007_flashy_event.sql` · `src/lib/flashy/*` · `src/app/api/flashy/*` ·
`src/app/api/admin/flashy/*` · `src/components/flashy/flashy-layer.tsx` (mounted in the team layout) ·
`src/components/admin/flashy-panel.tsx` (on /admin/surprises) · `tests/integration/flashy.test.ts`.

## Before the event
Set the video address, video length, bonus points and the four options in /admin/surprises, then
Trigger. The video is not supplied yet: until it is, Trigger stays disabled.
