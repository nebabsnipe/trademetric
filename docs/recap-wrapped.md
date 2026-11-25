# Season Recap (Draft Plan)

**Working title: "Recap" — final name TBD before launch.**

**Status: Draft — in progress, more cards/features to be added**

A unique, full-screen slideshow experience. NOT a Spotify Wrapped clone — built around the "War Room" identity: dark, data-driven, feels like a front office scouting report being revealed. Each card feels like a verdict being handed down, not a music app stat.

**Format:** Full-screen cards, one idea per screen, tap/click to advance. Dark background, data-reactive accent colors, smooth transitions. Final card is shareable as an image.

**Core identity:** The grade stamp is TradeMetric's signature visual — it hits the screen with authority. The data being shown is *their league's* data, so nothing can replicate it.

---

## Access & Sharing

- **Private by default**: `/recap/[leagueId]/[year]` requires you to be signed in as the owner — no public access, no other league members can view it.
- **Share the final card**: the shareable summary (last card) can be downloaded as an image or shared via link/OG meta. The *card image* is shareable; the *full slideshow* is not.

---

## Card Sequence (Current Draft)

### Card 1 — League Trades Total
**"Your league made X trades this season"**
- Giant animated number counts up to X
- Subtext: "That's X more than the average fantasy league" (if benchmark exists)
- Minimal — the number IS the design
- Background: slow CSS gradient pulse

### Card 2 — Personal Hook + Podium
**"You were involved in X of them"**
- Your number drops in big and bold first
- Podium animates in — 3-step (2nd, 1st, 3rd order like awards ceremony)
- Each slot: manager avatar/initials, name, trade count
- Crown on the most active trader
- Smooth staggered fade-in per podium position

### Card 3 — Your Best Trade
**"Your best trade"**
- Two player cards side by side — what you gave vs. what you got
- Grade badge (A+, A) animates in with a glow effect
- One-line verdict: *"You saw something nobody else did"*
- Green accent

### Card 4 — Your Worst Trade
**"Your worst trade"**
- Same two-card layout
- Grade badge (D, F) with a slight shake/wince animation
- One-liner that's fun not brutal: *"We've all been there"* / *"Hindsight is 20/20"*
- Red accent, light tone

### Card 5 — Trade That Defined Your Season
**"The trade that defined your season"**
- Shows trade + standings impact: before/after position with arrow
- *"You went from X to X in the standings after this"*
- Gold/amber accent

### Card 6 — Most Controversial League Trade
**"Your league's most controversial trade"**
- Trade between two managers (you if applicable)
- Split-screen grade: what each side got per TradeMetric
- *"The trade your league couldn't stop talking about"*
- Closest formula split = most controversial

### Card 7 — Your Best Waiver Add → League Top 5
**"Your best waiver add"**
- Your pickup: player card, week added, points contributed after pickup
- Points-after-pickup calculated by cross-referencing transaction date with weekly scores
- Transitions after 2s to: **"Your league's top 5 waiver adds"**
- Ranked list fades in one by one — manager, player, week, season impact
- ✅ Confirmed: ESPN API returns `WAIVER`, `BBID_WAIVER`, `FREE_AGENT` transaction types with auth cookies already in use

### Card 8 — Rankings Timelapse
**"Here's how your season unfolded"**
- Animated standings race across weeks (bar race or timeline)
- Highlights at start → mid-season → final position
- Auto-callouts at big jumps: *"Week 7 — you climbed 3 spots"*
- Performance comments: *"Went 4-0 in October"* / *"Tough stretch Week 10–12"*
- Most cinematic card — 5–8 seconds to play out

### Card 9 — Highest Scoring Games
**"Your best weeks"**
- Top 3 highest-scoring weeks: week number, score, opponent, W/L
- Shout out standout player performances if player-level data accessible
- *"Week 9 — [Player] dropped 48 for you"*

### Card 10 — Clutch Moments
**"You showed up when it mattered"**
- Playoff week record, close game record (decided by <10 pts)
- Biggest comeback win
- Clutch player: who won you a close matchup
- Stat callouts: *"X-X in elimination games"*

### Final Card — Shareable Summary
**"[League Name] Recap 2026"** *(final name TBD)*
- Your name + team name
- 4–5 key stats grid: trades made, best trade grade, final standing, highest score, waiver rank
- TradeMetric logo + trademetric.app
- Download as image / share button (card image only — full slideshow stays private)
- OG meta for Twitter/X, iMessage preview
- Background: their entire league's trade network rendered as a constellation — all trades as lines connecting manager nodes, fading in slowly. Completely unique to their season.

---

## Visual Identity — "The War Room"

Not a music app. A front office analytics room.

| Element | Treatment |
|---|---|
| Background base | Near-black (#0d0d0d) or deep navy |
| Texture | Subtle blueprint grid or scouting board feel |
| Accent colors | Data-reactive: green (win), red (loss), gold (defining moment), purple (timelapse) |
| Typography | Heavy, high-contrast — precision over bubbly |
| Grade stamp | Signature TradeMetric visual — stamps in with weight, like a verdict |
| Player cards | Slide in like physical trade chips being moved on a board |
| Transitions | Slide + fade; number count-ups; staggered reveals |
| Podium | CSS/JS animated, staggered easing |
| Timelapse | Animated SVG or canvas bar race, ~5–8s autoplay |
| Final card bg | Procedural trade network graph — their league's data generates the visual |
| Shareable card | html-to-image or canvas export |

**Background approach per card type:**
- Simple stat cards (1, 2): slow CSS aurora/mesh gradient
- Trade cards (3, 4, 5, 6): subtle blueprint grid, grade stamp does the heavy lifting
- Waiver card (7): Lottie animation
- Timelapse (8): Three.js or canvas particle field behind the chart
- Scoring/clutch (9, 10): stadium atmosphere blur at low opacity
- Final card: procedural trade network constellation

---

## Data Requirements

| Card | Data needed | Status |
|---|---|---|
| League trade count | All trades this season | ✅ ESPN API |
| Personal trade count + podium | Per-manager trade counts | ✅ ESPN API |
| Best/worst trade | Trade history + formula grades | ✅ ESPN + formula |
| Defining trade | Standings before/after each trade | ✅ ESPN API |
| Controversial trade | Formula grade split across all trades | ✅ ESPN + formula |
| Best waiver add | Waiver transactions + points after pickup | ✅ Confirmed accessible |
| Rankings timelapse | Weekly standings history | ✅ ESPN API |
| Highest scoring games | Weekly scores | ✅ ESPN API |
| Clutch moments | Matchup results + playoff week flags | ✅ ESPN API |
| Player-level shoutouts | Individual weekly scores | ⚠️ Verify depth of ESPN data |
| Shareable card | Aggregated from above | — |

---

## Open Questions
- **Final name**: "Recap" is the working title — nail down before launch
- **Player-level weekly stats** for Card 9 shoutouts — confirm ESPN returns individual scores or need secondary source
- **Timelapse animation library**: lightweight canvas lib vs. custom SVG?
- **URL**: `/recap/[leagueId]/[year]` works for now, update if name changes
- **Auto-play vs. tap-to-advance**: auto-play with pause, or manual only?

---

## Build notes — Phase 1 (data), Nov 2026

The card list is now the 12-card build prompt (league trades, your trades + podium, best, worst, defining trade, biggest fleece, waivers, standings timelapse, best weeks, biggest beatdown, clutch, share card). The approved look is the reference file `recap-reference.html` (not in the repo yet).

- **Endpoint:** `api/recap.js` → `GET /api/recap?league=<id>&year=<yyyy>` with the user's sign-in token. It reads the user's own saved leagues to confirm the league is theirs and which team is theirs. Private leagues: `POST` with the ESPN codes (used for the request only, never stored). ESPN only for now; Sleeper returns "unsupported".
- **Trades:** ESPN only shows what was in an accepted trade to league members, so trades are rebuilt by following each player's owner over time (draft, pickups, drops, lineup moves, weekly rosters). A move between two teams with no pickup in between is a trade, and it is only counted if it matches a real accepted trade between those teams (vetoed trades never move players, so they drop out).
- **Trade grades:** what each side's players scored after the deal, measured against a replacement-level player at the same position each week. "Biggest fleece" = the league trade with the most lopsided split.
- **Player-level weekly scores:** confirmed, ESPN returns them (used for "top player" on best weeks, best player, waiver points).
- **Comeback:** uses NFL kickoff times to work out the score as each game window started ("down X going into Monday night").
- **In-progress seasons:** the recap uses finished weeks only and says `seasonComplete: false`.
- **Empty states:** the response has a `cards` list saying which cards have real data; the slideshow skips the rest.
- **Manager grade:** blends final finish, start/sit accuracy, trade results and waiver value. The owner approved the blend on 2026-11-25. The blend can be set with the `RECAP_GRADE_W` environment variable and is never shown on the site.

## Build notes — Phase 2 (slideshow), Nov 2026

- **Page:** `recap.html` + `css/recap.css` + `js/recap.js` (all classes `rc-`). Open as `/recap?league=<id>&year=<yyyy>`; with no league it uses the signed-in user's current ESPN league. `/recap/<id>/<yyyy>` (and `/recap/<id>`) also work, through rewrites in `vercel.json`.
- **Look:** copied from the approved reference file; the design is 390×844 and is scaled to fit the window (centred column on desktop).
- **Skipped cards:** the API's `cards` list decides which cards appear; the progress bar and counter only count those.
- **Save image / Share:** the share card is redrawn onto a canvas (no libraries) and saved as a PNG; Share uses the phone's share sheet when it can, otherwise saves the image.
- **Local testing:** on localhost only, `&dev=<espnTeamId>` builds the recap straight from the league's public data without signing in.
- **Recap tab:** the site's Recap tab (offseason mode) now has an "Open your recap" button for signed-in users and a "See a sample recap" button for everyone.
- **Sample recap:** `/recap?sample=1` plays the slideshow from `data/recap-sample.json`, a made-up 10-team league in the same shape the API returns. No sign-in or league needed, so the preview can always show it.
- **Opens on top of the site (owner's request, 2026-11-25):** the Recap tab's buttons open the recap in a layer over the site, with the page behind dimmed and blurred (`tmoRecapOpen` in `js/offseason.js`, `.rcx` in `css/styles.css`). It is the same `recap.html`, loaded in a frame with `?embed=1`. Close with the X, Escape, or a click outside. `/recap` still works as its own page.
- **Cover screen:** the recap now opens on a cover ("Your season, graded.", team and league, three facts, Start) before card 1.
- **Card list:** on wide screens a list of the cards sits beside the card (click to jump, current card highlighted); the card grows to most of the window's height.
- **Recap tab preview:** the tab shows a phone-shaped live preview that loops the sample recap (`?demo=1`: no cover, no controls). Clicking it opens the sample.
- **Team badges (owner's request, 2026-11-25):** every player on the trade, fleece and waiver cards has a small badge in his NFL team's colors with the team's letters, so you can tell who is who at a glance. Colors are the same list the main site uses (`TC` in `js/recap.js`).
- **Waiver card:** under "Your best waiver add" there is now a smaller "Your next best adds" list (up to three, from `waivers.myNext` in the API). The league top 5 rows also carry the team badge.
- **Not done yet:** a public link/preview image for sharing (only the image is shareable for now).

## Clutch card and side panel (2026-11-25, owner's notes)

- **Clutch is only shown when it is true.** The card appears if you had a winning record in games decided by under 10 points (at least two of them), or won an elimination game without a losing record in them, or made a real comeback (down 10 or more at a kickoff window and won). Otherwise the card is left out and the recap is one card shorter. Inside the card, a losing close-game record or a winless elimination record is not shown.
- **Biggest comebacks.** The API now returns `clutch.comebacks` (up to three, one per game, biggest hole first; `clutch.comeback` is still the biggest). The card shows the biggest as before and the next two as short rows under it. With comebacks but no clutch records the headline changes ("You were never out of it").
- **Side panel is smaller.** The full list of card names is gone. It now shows the card number in the card's color, its name, what's next, and one small bar per card (tap a bar to jump). It is about two thirds the old width and only as tall as its content.
- Checked with the sample recap (`/recap?sample`) in three cases: clutch, not clutch (card skipped, 11 cards), and comebacks only.
