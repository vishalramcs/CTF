# 09: Key Rules

Organiser decision, 2 Nov 2026. **Overrides 08 where they disagree.** No answers, flags or key values belong in this file.

## 1. What changed
The final goal is now four keys that open a sealed message, replacing coordinate fragments. Position scoring (08 §2), ranking (08 §4) and the first-correct race stay. The race box now takes the final flag, not a location.

## 2. Keys
| Key | Earned by |
|---|---|
| KEY 01 | Any 2 correct flags in Q1-Q4 |
| KEY 02 | Any 2 correct flags in Q5-Q8 |
| KEY 03 | Any 2 correct flags in Q9-Q12 |
| KEY 04 | Solving Q13, whose flag wraps the decoded token |

Values are encrypted in `app.vault_keys`, and a team receives a value only after earning it. The Q1 and Q5 slots still count towards their tiers. Fragment columns remain for the older Q5 row but no dashboard shows them.

## 3. Final decryption
`final_transmission.json` is public from the start, in the Q13 files. Key = HKDF-SHA256 over each key prefixed by its 4-byte big-endian length, in order KEY 01 to KEY 04, with the file's salt and info `SPIDEY-TRACXER-FINAL-V1`. Cipher = AES-256-GCM, with the 16-byte tag at the end of the ciphertext. Any wrong or missing key fails the tag check. The decoder (`src/lib/vault/crypto.ts`) holds no keys and no answer. An admin releases it in the last 5 to 10 minutes from the Event page, and a team can also write its own.

## 4. Full-access team
`teams.full_access` lets a tester read and submit every question at any event status, published or not. It is a hidden team and can't become the race winner. Its solves still take a position until the event reset clears them, so reset before the real event.

## 5. Flag prefix
Organiser decision, 7 Nov: every flag is `EYE{...}` and `FLAG_PREFIX` is `EYE`. All 13 static flags were re-hashed under `EYE` (`scripts/switch-prefix-eye.ts`, audited), so a `SPIDEY{...}` submission is now malformed.

## 6. Questions
Evidence lives in `src/lib/workspace/files/<workspace>/`, served only through the signed-in workspace route. Generator and organiser reference: `seed-output/` (never committed).
