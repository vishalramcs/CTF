# QUESTIONS_TEMPLATE.md — how to hand over your questions

You (the organisers) write all challenge questions. Fill in one block per challenge, then give this file to Claude Code at Milestone 8 ("import the questions from QUESTIONS.md"). You can also type the same fields straight into the admin challenge editor.

The platform supplies the per-team parts for you. Write the question once with **placeholders**, and every team automatically gets its own values and its own flag.

---

## 1. The slots you need to fill

| Slot | Difficulty | Points (Main / AI Mode) | Carries a coordinate fragment? |
|---|---|---|---|
| 0 | Practice | 0 / 0 | No |
| 1–4 | Easy ×4 | 100 / 50 | **2 of these 4** |
| 5–7 | Medium ×3 | 200 / 100 | **2 of these 3** |
| 8–9 | Difficult ×2 | 300 / 150 | **1 of these 2** |
| 10 | Main Difficult | 500 / 500 | **Yes** |

You choose which challenges carry fragments, as long as the 2 / 2 / 1 / 1 split holds. You also choose the order (1–6) and write each order clue.

## 2. Coordinates
- Final coordinates: `__.____ , __.____` (lat, lon, 4 decimals each), e.g. `11.0247,77.0028`.
- Split into 6 two-digit fragments, by order:
  - 1: lat integer part
  - 2: lat decimals 1–2
  - 3: lat decimals 3–4
  - 4: lon integer part
  - 5: lon decimals 1–2
  - 6: lon decimals 3–4
- Example: `11.0247,77.0028` → `11`, `02`, `47`, `77`, `00`, `28`.
- If your longitude needs 3 digits (over 99°), tell Claude Code, because the format must change.

## 3. Placeholders you can use in question text, evidence and file templates

| Placeholder | Becomes | Example output |
|---|---|---|
| `{{flag}}` | This team's full flag | `SPIDEY{47_k3w9qz2m}` |
| `{{flag\|base64}}` | Base64 of the flag | `U1BJREVZezQ3X2szdzlxejJtfQ==` |
| `{{flag\|hex}}` | Hex of the flag | `535049444559...` |
| `{{flag\|url}}` | URL-encoded flag | `SPIDEY%7B47_k3w9qz2m%7D` |
| `{{flag\|url2}}` | Double URL-encoded | `SPIDEY%257B...` |
| `{{flag\|rot13}}` | ROT13 of the flag | `FCVQRL{47_x3j9dm2z}` |
| `{{flag\|caesar:N}}` | Caesar shift by N (letters only) | |
| `{{flag\|reverse}}` | Reversed | |
| `{{flag\|sha256}}` | SHA-256 hex of the flag | for "find the matching string" tasks |
| `{{flag\|binary}}` | 8-bit binary | |
| `{{token}}` | This team's 8-char token only | `k3w9qz2m` |
| `{{fragment}}` | This challenge's fragment (same for every team) | `47` |
| `{{rand:N:M}}` | Team-specific random integer between N and M (stable per team) | `37` |
| `{{rand_word}}` | Team-specific random word (stable per team) | `tangle` |

Transforms can be chained left to right: `{{flag|rot13|base64}}` means ROT13 first, then Base64.

**Anti-AI tip:** use at least one team-specific value that sits only in the page (a cookie, a header, a generated file, a `{{rand:...}}` number), so pasting the question text into an AI isn't enough.

## 4. Hiding clues in the page (inspect-element challenges)
Per challenge, you can place values (with placeholders) in any of these:
- HTML comment
- `<meta>` tag
- hidden element
- JSON clue block
- cookie (name must start with `clue_`)
- localStorage key
- response header on a `/vault/<slug>` page (name must start with `x-spidey-`)
- `robots.txt` line

## 5. Per-team files
- **Image with metadata:** upload a base image and name the EXIF field plus its value, e.g. `ImageDescription = {{flag|base64}}`.
- **Log file:** write the log as a template. Lines can contain placeholders, and you can add `{{noise:300}}` to bury them in 300 realistic random lines.
- **Any text file:** a template with placeholders.

## 6. One block per challenge (copy this)

```yaml
number: 1                     # 0–10
title: The First Signal
difficulty: easy              # practice | easy | medium | difficult | main_difficult
category: base64              # free text, shown as a small tag
story: |
  Spider-Man's last transmission was scrambled...
question: |
  <p>Decode the intercepted message below and submit the flag.</p>
evidence:                     # optional, shown under the question in order
  - type: code                # code | text | image | file | log
    content: "{{flag|base64}}"
inspect:                      # optional hidden clues (section 4)
  html_comment: ""
  meta: []
  hidden: []
  cookies: []                 # e.g. - { name: clue_shift, value: "{{rand:3:9}}" }
  local_storage: []
  vault_headers: []
files: []                     # optional per-team files (section 5)
flag:
  mode: team                  # team (default, different per team) | static (same for all teams)
  template: "{{fragment}}_{{token}}"   # team mode: inside the braces. MUST include {{token}}; include {{fragment}} if it carries one
  static: ""                  # static mode only: the full flag, e.g. SPIDEY{web_47_open}
fragment:                     # leave all three empty if this challenge has no fragment
  value: "47"                 # 2 digits
  order: 3                    # 1–6, unique across the 6
  clue: "Thread Mw==."        # shown only after solving: how teams learn the order
hints:
  - "Strings ending in = are often Base64."
  - "The Toolkit's Base64 tab can decode it."
```

## 7. Checks the system runs on your questions
- Exactly 10 challenges + practice, with the 4 / 3 / 2 / 1 difficulty split.
- Exactly 6 fragments, split 2 Easy / 2 Medium / 1 Difficult / 1 Main Difficult.
- Orders 1–6 used once each, and the fragments in order reproduce your coordinates.
- Every team-mode template contains `{{token}}`. Every fragment challenge's flag contains its fragment.
- For each challenge and 3 random teams, the clue decodes back to the exact flag.
- Static-mode flags are flagged with a warning, because teams can share them.
