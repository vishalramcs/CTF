# 10: Fragment Rules

Organiser decision, 6 Nov 2026. **Overrides 09 for the goal mechanic.** No answers, flags or fragment values belong in this file.

## 1. What changed
The goal is three locations, each rebuilt from a North and a South fragment (six fragments). The four-key vault is no longer shown to teams; its code, table and the `final_transmission.json` stay in the repo, unused. Position scoring, ranking and the first-correct race are unchanged: the base points (Easy 100, Medium 200, Difficult 300, Main 500, editable per question) feed the existing engine.

## 2. Fragments
| Slot (`coordinate_order`) | Id |
|---|---|
| 1 / 2 | L1-N / L1-S |
| 3 / 4 | L2-N / L2-S |
| 5 / 6 | L3-N / L3-S |

Exactly six regular questions carry a fragment: 2 Easy, 2 Medium, 2 Difficult. Which question holds which slot is the admin's choice (Admin, Coordinates), so a location may mix difficulties. The value lives only on `app.challenges` (`fragment_value`) and a flag template can embed it with `{{fragment}}`.

## 3. Awards (all server side, derived from `app.solves`)
- A correct flag on a fragment-bearing question earns that fragment. Opening a question earns nothing.
- A correct Main Question flag earns all six at once, and its points once. `solves` is unique per team and question, so nothing is awarded twice.
- A location is reconstructed when the team holds both of its fragments (or the Main Question is solved). Its text comes from `app.final_coordinates` position 1-3 (label = place, value = full text) and is sent only then.

## 4. Where it shows
Team dashboard: Locations board (three cards, Locked or value per fragment). Question page: the fragment, plus the location text when the solve completes it. Admin Challenges: tier and fragment summary. Admin Coordinates: slot table, fragment plan, location text, final answer.
