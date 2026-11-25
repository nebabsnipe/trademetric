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
- **Recap tab:** the site's Recap tab (offseason mode) now has an "Open your recap" button for signed-in users.
- **Sample recap:** `/recap?sample=1` plays the slideshow from `data/recap-sample.json`, a made-up 10-team league in the same shape the API returns. No sign-in or league needed, so the preview can always show it.
- **Opens on top of the site (owner's request, 2026-11-25):** the Recap tab's buttons open the recap in a layer over the site, with the page behind dimmed and blurred (`tmoRecapOpen` in `js/offseason.js`, `.rcx` in `css/styles.css`). It is the same `recap.html`, loaded in a frame with `?embed=1`. Close with the X, Escape, or a click outside. `/recap` still works as its own page.
- **Cover screen:** the recap now opens on a cover ("Your season, graded.", team and league, three facts, Start) before card 1.
- **Card list:** on wide screens a list of the cards sits beside the card (click to jump, current card highlighted); the card grows to most of the window's height.
- **Recap tab preview:** the tab shows a phone-shaped preview that loops a short video of the sample recap (`media/recap-sample.mp4`, about 15 seconds: the cover pulls back into a stack of cards, the stack flicks through with each card's name underneath, and the camera pushes in on the best trade, the standings race and the share card before looping back to the cover). It is not clickable. If the sample recap or the card designs change, the video needs to be recorded again. People who have "reduce motion" turned on see a still image instead.
- **Team badges (owner's request, 2026-11-25):** every player on the trade, fleece and waiver cards has a small badge in his NFL team's colors with the team's letters, so you can tell who is who at a glance. Colors are the same list the main site uses (`TC` in `js/recap.js`).
- **Waiver card:** under "Your best waiver add" there is now a smaller "Your next best adds" list (up to three, from `waivers.myNext` in the API). The league top 5 rows also carry the team badge.
- **No sample recap for users (owner's decision, 2026-11-25):** the "Watch a sample" buttons were removed; a sample recap is not a feature. The made-up league in `data/recap-sample.json` is now only used for the silent looping preview on the Recap tab (not clickable).
- **Not done yet:** a public link/preview image for sharing (only the image is shareable for now).

## Clutch card and side panel (2026-11-25, owner's notes)

- **Clutch is only shown when it is true.** The card appears if you had a winning record in games decided by under 10 points (at least two of them), or won an elimination game without a losing record in them, or made a real comeback (down 10 or more at a kickoff window and won). Otherwise the card is left out and the recap is one card shorter. Inside the card, a losing close-game record or a winless elimination record is not shown.
- **Biggest comebacks.** The API now returns `clutch.comebacks` (up to three, one per game, biggest hole first; `clutch.comeback` is still the biggest). The card shows the biggest as before and the next two as short rows under it. With comebacks but no clutch records the headline changes ("You were never out of it").
- **Side panel is a slim rail** (owner picked option A of four mock-ups). A thin pill beside the card: the card number in the card's color, a small round up button (previous card) and down button (next card), one dot per card (the current one is tall and glows; tap a dot to jump), and the card's name with what's next in a small label beside its dot. Shown only when the window has room for it.
- Checked with the sample recap (`/recap?sample`) in three cases: clutch, not clutch (card skipped, 11 cards), and comebacks only.

## Save video (2026-11-25)

- **Where:** a "Save video" button on the last card, above Save image / Share. Code in `js/recap-video.js`, styles at the end of `css/recap.css`.
- **What it makes:** a vertical 1080x1920 highlight reel, about 15 seconds, no sound. Scenes: team name and season, final standing with record, best week with the top player, up to two highlights (biggest comeback, best trade, biggest beatdown, in that order, only when the data exists), then the manager grade stamped in with the TradeMetric wordmark. Each scene has its own color, and story-style progress bars run along the top.
- **How:** drawn on a canvas and recorded in the person's own browser. Nothing is uploaded and no server function was added. A sheet shows the video being made (about 15 seconds, the tab has to stay open), then plays it back with Save video, Share (where the device supports sharing a file) and Done.
- **File type:** MP4 where the browser can record it (Chrome, Safari), otherwise WebM. A browser that cannot record video gets a short message and the image option.
- **Checked:** recorded from the sample recap in headless Chrome: a 16.4 second, 1080x1920 MP4 of about 5 MB. Not yet tried on a real phone.

## Recap tab: slide-to-play screen (phase 1, 2026-11-25)

- **What:** signed-in users now land on a new Recap tab screen instead of the old text + "Open your recap" page. A phone-shaped frame plays a small silent loop of the recap, a slide-to-play track at the bottom of the frame opens the slideshow at card 1, and one side card per recap card sits either side (arrows move them along). On a phone the side cards only peek in and a swipeable row of card chips sits under the frame. Signed-out visitors still get the locked Pro page with the sign-in button.
- **Files:** `js/recap-tab.js` and `css/recap-tab.css` (all classes `rc-`). `renderProTab` in `js/offseason.js` hands the Recap tab to `rcTabRender`; `tmoRecapOpen(card)` can now start on a given card and announces when the recap is closed.
- **The preview is the real cards, not a video file.** The frame loads the slideshow page itself in its preview mode (`/recap?demo=1&sample=1`), so the preview always matches the cards. In that mode the buttons and card counter are hidden. `media/recap-sample.mp4` is now only used on the signed-out page.
- **Colours:** the page uses the site's own colours (orange accent, light and dark). The frame keeps the recap's dark look.
- **Two states.** Before watching: badge "Sample league", side cards faded with a lock, chips dimmed. After watching: badge "Your league", "Slide to watch again", side cards and chips open the slideshow at that card.
- **Phase 2, done (2026-11-25, on the `season-recap` branch):**
  - **Watched** means the slideshow reached its last card. It is saved on the account inside the existing saved data (`S.acct.recapSeen`, one entry per "league id:year"), so no new database table or column. The browser also keeps a copy (`tm-recap-seen`) so the screen does not flash the locked look on load; the two copies are brought level whenever the tab opens.
  - **After watching**, the frame plays the same small loop from the user's own league (`/recap?demo=1&league=…&year=…`), the badge says "Your league", and the side cards and chips open the slideshow at that card. Cards the user's recap leaves out are left out of the side cards and chips too. If their own recap cannot load, the sample keeps playing and the badge stays "Sample league".
  - **The unlock** plays once, when the slideshow is closed after the last card was reached: side cards fade up left to right, the locks give way to "Open card", the badge flips.
  - **Hooks added to `js/recap.js`:** it tells the site when the last card is reached, and the small preview tells the site which league and cards it is playing (or that it failed).
  - `?unlocked=1` is removed. The hint under the frame says "This one is yours. Pick any card to jump in." until Save video ships, then "Save it, or pick any card" comes back.
- **Frame preview tidy-up (2026-11-25):** the preview page is loaded at the recap's full 390x844 size and shrunk to the frame, so it looks exactly like the recap. In the preview the TM mark is hidden along with the buttons and counter (the progress bars stay). With "reduce motion" on, the preview stays still on card 1 instead of playing. The preview's address is `/recap?demo=1` (`&sample=1` for the sample league); `?embed=1` was already taken by the full recap that opens on top of the site.
- **Phase 3 (not started):** the Save video button in the frame stays hidden. Note: a browser-made "Save video" already exists on the slideshow's last card (`js/recap-video.js`).

- **Planned (owner, 2026-11-25):** the landing screen's layout is approved. Its theme and colours will be changed later to feel more like football. Not started; wait for the owner's direction before restyling.
