# 04 — Design Brief

**Product:** SPIDEY tracXer — Search the SpiderXman
**Feel in one line:** a night-time spider-tracking terminal. Dark city, red and blue signal light, web lines and glitch, fast and readable under event pressure.

---

## 1. Design goals (in priority order)
1. **Readable under pressure.** Scores, timers, flags and errors are legible at a glance on a 13" laptop in a bright lab, and on a projector.
2. **Feels like an event.** Phase changes, solves, surprises and the finale should feel cinematic, but only in short bursts. The working surfaces (challenge text, toolkit) stay calm.
3. **Fast.** No heavy assets on the critical path. Effects are CSS and SVG first.
4. **Beginner-friendly.** Every screen says what to do next.

## 2. IP and branding rules (must follow)
- Use **original** spider and web iconography only: our own spider glyph, web lines, "signal" rings.
- **Do not use** official Marvel/Sony logos, the Spider-Man mask or face, suit artwork, film stills, comic panels, trailers, official fonts or soundtrack. Do not trace or redraw them either.
- The event title "SPIDEY tracXer" and story text can reference the theme in words. Visuals stay original.
- Flash Spidey visuals: use original animations (SVG/Lottie we make) or club-made clips, kept under 2 MB.
- The finale line "SPIDER-MAN WILL RETURN… IN SECRET WARS." is plain styled text, with no logos.

## 3. Visual direction
- **Setting:** a city skyline at night seen through a HUD. Thin web lines radiate from the corners, scanlines are faint, and "spider-sense" pulses ring outward on alerts.
- **Shapes:** sharp 4–6 px radii, angled corner cuts on cards (`clip-path` notches), thin 1 px borders with a glowing focus edge.
- **Motion vocabulary:** *thwip* (a fast 120 ms line draw), *glitch* (2–3 frame RGB split, max 250 ms), *pulse* (concentric ring), *web-draw* (stroke-dashoffset). Nothing loops forever except the Morse spider and the live dot.

## 4. Design tokens

### 4.1 Colour (dark theme only)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#07090F` | Page background (night) |
| `--bg-elev` | `#0E1320` | Cards, panels |
| `--bg-elev-2` | `#151B2C` | Inputs, code blocks |
| `--line` | `#1F2840` | Borders, web lines |
| `--text` | `#E8ECF6` | Primary text |
| `--text-dim` | `#97A1BA` | Secondary text |
| `--spider-red` | `#E2232A` | Primary actions, brand |
| `--spider-red-hi` | `#FF4A50` | Hover, glow |
| `--signal-blue` | `#2D6BFF` | Links, info, focus ring |
| `--signal-blue-hi` | `#5C8DFF` | Glow |
| `--success` | `#2BD47D` | Correct, solved |
| `--warn` | `#FFB020` | Rate limit, polling |
| `--danger` | `#FF4D6A` | Wrong, offline |
| `--gold` / `--silver` / `--bronze` | `#F4C542` / `#C9D1E0` / `#D08A4E` | Top 3 |
| `--ai-mode` | `#9B5CFF` | AI Mode accent (replaces blue accents during `ai_mode`) |

Difficulty chips: Easy `#2BD47D`, Medium `#2D6BFF`, Difficult `#FF8A1F`, Main Difficult `#E2232A` with an animated web border.

Contrast: all text on `--bg`/`--bg-elev` must meet WCAG AA (4.5:1 body, 3:1 large). Never encode state by colour alone. Pair it with an icon or label (✓ Solved, 🔒 Locked).

### 4.2 Typography (Google Fonts, `font-display: swap`, subset latin)
| Role | Font | Notes |
|---|---|---|
| Display (titles, scoreboard numbers, finale) | **Big Shoulders Display** 700/900 | Condensed, comic-poster energy. Uppercase with tracking +2%. |
| UI and body | **Archivo** 400/500/600 | Clean, readable at small sizes. |
| Mono (flags, code, toolkit, Morse) | **JetBrains Mono** 400/600 | Tabular numerals for scores and timers. |

Scale: 12 / 14 / 16 (body) / 20 / 24 / 32 / 48 / 72 (finale). Line height 1.5 body, 1.1 display.

### 4.3 Spacing, layout, elevation
- 4 px grid. Spacing: 4, 8, 12, 16, 24, 32, 48.
- Container max 1200 px. Dashboard: 12-col grid, a challenge grid of 3 columns on desktop, 2 on tablet and 1 on mobile, with a right rail of 320 px collapsing under 1024 px.
- Elevation through border and glow, not big shadows: `box-shadow: 0 0 0 1px var(--line), 0 8px 24px -12px rgba(0,0,0,.6)`. Focus: `0 0 0 2px var(--signal-blue)`.

## 5. Components (shadcn base, restyled)
| Component | Notes |
|---|---|
| **ChallengeCard** | Notched corner, number in display font, title, difficulty chip, points (old value struck through in AI Mode), state badge. Hover: web lines draw in from the corner (150 ms). Solved: green check, dim overlay, points earned. Locked: lock icon, "Opens at 5:00". |
| **PhaseBanner** | Full-width strip under the header. Left: phase name. Middle: rule line. Right: countdown (mono). Sweeps in on change with a glitch frame. |
| **ScorePill** | Team score (display font) + rank `#n`. Counts up on increase (400 ms). |
| **FlagInput** | Mono input, prefix ghost text `SPIDEY{`, submit button in red. Wrong: 300 ms shake + red edge. Correct: a green pulse ring + "thwip" line. Rate-limited: amber, with a countdown inside the button. |
| **LeaderboardTable** | Tabular numerals. Row rank changes animate with FLIP (300 ms). Own row highlighted blue. Top 3 with metal accents. |
| **SolveFeed** | Newest on top. Each item slides in: "⚡ Team Name cracked #4 Spider Vision +100". At most 20 items. |
| **FragmentCard** | A 2-digit value in large mono inside a hex, the source challenge #, and the clue text. Draggable, with a keyboard alternative. |
| **CoordinateAssembler** | Six slots in the `__.____,__.____` layout, with snap animation and a live string preview. |
| **SpiderSignal** | Our original spider glyph (SVG, about 72 px) at a random safe position. A slow crawl plus a pulse ring, and a 60 s circular timer. Click: the web bursts open to reveal the code. |
| **MorseSpider** | A 56 px spider docked bottom-right. "On" = body red-hi + glow, "off" = dim. Expand to 240 px. A small beep (optional, off by default). Never more than 3 flashes/s. |
| **FlashOverlay** | Black backdrop at 90%, the visual centred, then the question card. |
| **Toasts** | Top-right on desktop, top on mobile. Short and specific. |
| **ConnectionDot** | Green (live), amber (polling), red (offline), with a tooltip. |
| **Admin UI** | Same tokens, denser tables, and a red "danger zone" styling for finale, phase and reset actions with typed confirmations. |

## 6. Phase theming
| Phase | Visual changes |
|---|---|
| Onboarding | Calm. Blue accents, a "Practice" highlight on card #0, and "Opens at 5:00" locks. |
| Main CTF | Red and blue accents. Web corners active. |
| AI Mode | The accent swaps to `--ai-mode` violet. A persistent "AI MODE" chip with a subtle glitch every 20 s (disabled under reduced motion). Card points show the halved value. |
| Finale | Everything else stops. Black stage, `/finale` takes over. |

## 7. Motion and accessibility rules
- Durations: micro 120–200 ms, panels 250–350 ms, takeovers 600 ms–4 s.
- `prefers-reduced-motion`: disable glitch, crawl and confetti. Banners fade only. The Morse spider still blinks (it is the content) but without scale or glow pulsing. The finale uses static cards with fades.
- Photosensitivity: no full-screen flashes brighter than about 80% white or faster than 3/s. Flash Spidey uses a fade-in, not a strobe.
- Keyboard: every action is reachable with Tab, visible focus rings, Enter submits, Esc closes overlays (except a takeover's first 2 s).
- Screen readers: the feed and banners use `aria-live="polite"`. Results of a flag submit use `role="status"`.
- Touch targets ≥ 44 px on mobile.

## 8. Imagery and assets budget
- Spider glyph and web patterns: inline SVG (< 4 KB each).
- Skyline background: one SVG or CSS gradient silhouette (< 20 KB). No large photos.
- Sound (optional): 3 short sfx (thwip, solve, alert), each < 30 KB, muted until the user's first click (autoplay rules). The finale may use one original track < 1 MB, preloaded only on `/finale`.
- Flash Spidey media: < 2 MB, preloaded when the admin launches (by the client on the `flash` event before `startsAt`).
- Critical JS for the dashboard < 250 KB gzipped. Lazy-load the toolkit, finale and admin.

## 9. Copy voice
Short, playful, mission-style, never confusing.
- Correct: "Signal fragment recovered. +200"
- Wrong: "Not the signal. 4 tries left this minute."
- Rate limited: "Spider-sense overload. Retry in 0:42."
- Locked: "This trail opens at 5:00 PM."
- Coordinates wrong: "No signal at those coordinates."
- Winner (others): "Spider-Man traced by Team X! Points still decide the leaderboard."
- AI Mode: "AI MODE ON. AI tools are allowed. Points are halved except Main Difficult."
- Offline: "Connection lost. Reconnecting…"

## 10. Screens to design first (in order)
1. Dashboard (desktop + mobile)
2. Challenge page (with all states of the flag input)
3. Leaderboard / projector screen
4. Coordinate Board
5. Overlays: phase banner, winner takeover, Spidey Signal, Morse spider, Flash
6. Finale sequence storyboard
7. Admin: event control, monitor, surprises
