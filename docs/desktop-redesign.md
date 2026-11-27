# Desktop redesign (branch `desktop-redesign`)

A new look and layout for the desktop site (701px wide and up). The phone layout is not touched: every phone
screenshot is pixel-identical to `main`. No features were added or removed.

**Status (2026-11-27):** Phases 0–3 built: setup, audit, the shell (colours, backdrop, frame, top bar) and the new
My Team. Waiting on the owner's notes. Not started: photos (phase 4), polishing the other tabs (5), final checks (6).

## Where things live
| File | What it is |
| --- | --- |
| `css/desktop.css` | All the new styling. Loaded only at 701px and up, so it cannot reach the phone. Colours, corner sizes, blur and spacing are variables at the top (`--tmd-…`) |
| `js/desktop.js` | The top bar's week/live pill and account chip, and My Team's three columns. Uses only numbers the site already works out |
| `js/photos.js` | The one place player photos and team logos come from (`tmPhoto`, `tmTeamLogo`) and the `TM_PHOTO_MODE` switch. Set to `off` for now |
| `img/backdrop.webp` | The stadium-mood background. Drawn by `scripts/dev/make-backdrop.py` from shapes and noise; no photo, nothing to license |
| `fonts/outfit-var.woff2` | The typeface (Outfit, free under the Open Font License), hosted on the site itself |
| `scripts/dev/` | Runs the site locally with every outside service faked, takes screenshots, and compares them (`shots.mjs`, `compare.py`) |
| `design-ref/` | Where the reference screenshot goes |

## What My Team shows now (desktop)
- **Left:** team name and record; the top projected starter; the same four tiles as before; playoff / bye / title odds per team from Season Sim.
- **Centre:** a carousel of your starters, best first (click opens the player card); this week's matchup with win chances and projected margin; the simulated finish (wins and playoff odds).
- **Right:** your matchup's score (live or projected) with win chances; league standings.
- **Below:** lineup alerts, the full matchup card, starting lineup, bench, IR, roster strength, injury opportunities, start or sit and fixes, in the same order as before.

## Where it differs from the reference, and why
- **Reference image never arrived**, so colours were chosen from the written brief, not eyedropped. They are variables and quick to change.
- **No sparkline in the odds list.** The site keeps no history of playoff odds, so a trend line would be invented. A bar shows the current odds instead.
- **No "draw" chip.** Two win-chance chips plus projected margin.
- **Win chances never read 100% or 0%** unless they truly are.
- **Team badges are coloured circles with initials.** Fantasy teams have no logos in the data.
- **The four-way switch on the matchup card** jumps to Matchup, Lineup, Bench or Start / sit further down the page. Those are the views that exist; no new ones were made.
- **Search and settings icons** open the Players search and League settings that already exist.
- **Hero without photos:** a large team-colour jersey with the player's name and number (photo mode `off`). Real photos are phase 4.
- **The main colour on desktop is blue**, per the reference. The orange stays in the logo. The phone still uses orange.

## Left to do before this could go public
- Photos: licensing, the three modes, the build check, and locking the preview link (phase 4).
- The other tabs only have the new colours and cards so far; their own details still need a pass (phase 5).
- Light theme works and is readable but is not polished.
- Old desktop styles in `css/styles.css` are overridden, not yet removed.
