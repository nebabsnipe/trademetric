# Desktop redesign (branch `desktop-redesign`)

A new look and layout for the desktop site (701px wide and up). The phone layout is not touched: every phone
screenshot is pixel-identical to `main`. No features were added or removed.

**Status (2026-11-27):** Phases 0–4 built: setup, audit, the shell, the new My Team matched to the reference
(`design-ref/reference.webp`), and the photo switch. Not started: polishing the other tabs (5), final checks (6).

## Where things live
| File | What it is |
| --- | --- |
| `css/desktop.css` | All the new styling. Loaded only at 701px and up, so it cannot reach the phone. Colours, corner sizes, blur and spacing are variables at the top (`--tmd-…`) |
| `js/desktop.js` | The top bar's week/live pill and account chip, and My Team's three columns. Uses only numbers the site already works out |
| `js/photos.js` | The one place player photos and team logos come from (`tmPhoto`, `tmTeamLogo`) and the `TM_PHOTO_MODE` switch. Set to `private` on this branch |
| `private-photos/` | **Unlicensed.** Which headshot each player uses (`private.js`, rebuilt by `scripts/dev/photo_ids.py`). Must never reach main |
| `scripts/check-photos.mjs` | Runs on every Vercel build. Fails a main or Production build if the mode is `private` or `private-photos/` exists |
| `img/backdrop.webp` | The stadium-mood background. Drawn by `scripts/dev/make-backdrop.py` from shapes and noise; no photo, nothing to license |
| `fonts/outfit-var.woff2` | The typeface (Outfit, free under the Open Font License), hosted on the site itself |
| `scripts/dev/` | Runs the site locally with every outside service faked, takes screenshots, and compares them (`shots.mjs`, `compare.py`) |
| `design-ref/` | Where the reference screenshot goes |

## The photo switch
`TM_PHOTO_MODE` at the top of `js/photos.js`:
- `off`: no photos or logos. Players show as team-colour jerseys with their number; fantasy teams as coloured initials. Looks finished; safe to ship.
- `licensed`: reads `/licensed-photos/head/<player-id>.webp`, `/licensed-photos/hero/<player-id>.webp` and `/licensed-photos/logo/<team>.webp`. Any file that is missing falls back to the `off` drawing.
- `private`: real headshots and team logos for designing. This branch only.

Every player uses his headshot (owner's call, 2026-11-27: no full-body cut-outs). 815 of the site's 841 players have one; the rest show the jersey.
On your own computer you can switch modes without editing the file: in the browser console, `localStorage.setItem('tm-photo-mode','off')` then reload.

The Vercel preview links need a Vercel sign-in (Vercel Authentication is on for every deployment except the real domain), and the owner is the only member of the Vercel team, so only the owner can open them.

## What My Team shows now (desktop)
- **Left:** team name and record; the top projected starter; the same four tiles as before; playoff / bye / title odds per team from Season Sim.
- **Centre:** a carousel of your starters, best first (click opens the player card); this week's matchup with win chances and projected margin; the simulated finish (wins and playoff odds).
- **Right:** your matchup's score (live or projected) with win chances; league standings.
- **Below:** lineup alerts, the full matchup card, starting lineup, bench, IR, roster strength, injury opportunities, start or sit and fixes, in the same order as before.

## Where it differs from the reference, and why
- **Colours were sampled from the reference** (`design-ref/reference.webp`) and are variables at the top of `css/desktop.css`.
- **The stadium backdrop is drawn, not photographed** (`scripts/dev/make-backdrop.py`), so there is nothing to license.
- **Odds list lines show real weekly scores**, not odds trends. The site keeps no history of playoff odds, so a trend of those would be invented; each team's last six weekly scores are real.
- **No "draw" chip.** Two win-chance chips plus projected margin.
- **Win chances never read 100% or 0%** unless they truly are.
- **Team badges are coloured circles with initials.** Fantasy teams have no logos in the data.
- **The four-way switch on the matchup card** jumps to Matchup, Lineup, Bench or Start / sit further down the page. Those are the views that exist; no new ones were made.
- **Search and settings icons** open the Players search and League settings that already exist.
- **Hero without photos:** a large team-colour jersey with the player's name and number (photo mode `off`). Real photos are phase 4.
- **The main colour on desktop is blue**, per the reference. The orange stays in the logo. The phone still uses orange.

## Left to do before this could go public
- Photos: buy a licence, fill `/licensed-photos/`, set the mode to `licensed`, delete `private-photos/`.
- The other tabs only have the new colours and cards so far; their own details still need a pass (phase 5).
- Light theme works and is readable but is not polished.
- Old desktop styles in `css/styles.css` are overridden, not yet removed.
