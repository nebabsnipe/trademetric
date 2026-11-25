# Offseason Mode Plan

## Overview

TradeMetric runs year-round. Offseason mode is the **default baseline state** — what every new visitor and unconnected account sees. Connecting an active ESPN league unlocks in-season mode. After a league's season ends (plan: 10 days; owner has also said about a week — confirm), the account auto-flips to full offseason (league stays connected, roster cleared).

---

## Build status (preview branch)

Built on branch **`offseason-mode`** (Vercel preview). Not merged to main. A **Preview** pill shows next to the logo on any host that isn't trademetric.app.

**Done (2026-11-14, commits 50da767, 9a22070):**
- **Mode pill** in the top bar (Offseason / In-season), click to flip. Override saved as `tm_mode_override`. With no override: signed out or still on the sample league → Offseason; real league → In-season.
- **Offseason Home** (`#home`, public): dark hero "Get ready for your next draft", Top 10, Sleepers and Busts cards, TradeMetric Pro tool grid (Recap, League-fit rankings, TM Score breakdown, Draft pick values, Mock drafts, Trade analyzer — last three marked Coming soon).
- **TradeMetric Rankings** (`#tmrank`, public): TM Score column with bar, vs-market ▲/▼, experts rank, market rank, opportunity grade (A+ to F), 2026 Pts/G. Gap-based tier bars. Position, Sleepers/Busts and search filters. Tap a row → player breakdown, **blurred and locked for non-Pro** (Pro unlocks).
- **Beta Pro switch** (`TMO_BETA_PRO = true` at the top of `js/offseason.js`): every signed-in account gets Pro free during the beta; signed-out visitors see locks with "Sign in free". Turn it off when the beta ends. Otherwise Pro = `profiles.plan` not `free`.
- Preview-only **View as Pro** switch (localStorage `tm_pro_preview`), hidden while beta Pro is on.
- Phone layout: bottom tab bar gets Home and Rankings icons; table drops to #, player, TM Score, vs market.

**Done (2026-11-14, commit d0def9b):**
- **Player breakdown trimmed.** The panel under a ranking row now has only: the three score bars (Experts, Market, TradeMetric model), expected points per game, and receiving role (WOPR) for RB/WR/TE. Depth chart, offense, points over expected and age were removed from the panel (age stays in the row subtitle). The weights and formula are not shown anywhere.
- **TradeMetric take** (Pro) in the same panel — see the section below.
- **Pro tabs in the offseason nav:** Home, Rankings, **Recap** (`#recap`), **Draft Tools** (`#drafttools`, pick values + mock drafts), **League Fit** (`#leaguefit`).
  - Signed out: each tab has a small lock; the page says what the tool does with a **Sign in free** button (beta copy).
  - Signed in (Pro): a **Coming soon** page for each tool.
  - Signed in without Pro (after the beta): "See Pro plans" button.
  - Phone: the three tabs are in the **More** sheet, not the bottom bar. In offseason mode the sheet lists the Pro tools and hides Season Sim / League / Draft (same as the desktop nav); in-season it is unchanged. The offseason bottom bar is now three even columns (Home, Rankings, More).
- Page copy for the three tools lives in `TMO_PAGES` in `js/offseason.js`.
- Tested in a browser with `/api` mocked: signed out and fake signed-in user, light and dark, 1280 and 390 wide, no console errors.

**Where it lives:** `js/offseason.js` (all client logic: `TMO_W`, `tmoBuild`, `renderOffHome`, `renderTmRank`, `tmoWhy`, `tmoTakeLoad`, `renderProTab`, `TMO_PRO_TABS`, `TMO_BETA_PRO`), `api/take.js` (the take), "Offseason mode" block at the end of `css/styles.css`, small hooks in `js/app.js` (TABS, `go()` public tabs, `render()`, boot, `leaveApp`, `adoptState`), `js/mobile.js` (More sheet), views `v-home` / `v-tmrank` / `v-recap` / `v-drafttools` / `v-leaguefit` in `index.html`.

**Preview data stand-ins:** consensus = rest-of-season expert ranks (`nfl.json` → `ros`); market/ADP = redraft market values (`market.json` → `fc1`). Swap for real offseason consensus + ADP feeds when picked.

---

## Brought up to date with the live site (2026-11-25, not pushed yet)

The live site's changes through 2026-11-25 (account sync, shared news store, News fixes, motion polish, matchup colors, no-league accounts) are merged into this branch. Where both sides had changed the same spot, the live site's version was kept and the offseason hooks were added back on top. An account with no league now counts as offseason, the same as a signed-out visitor. The phone More sheet no longer lists Draft in-season (the live site removed that tab). Checked signed out at 1280 light and 390 dark: Home, Rankings, News, Recap, Draft Tools and League Fit all open with no errors. Signed-in pages still need a check on the preview.

---

## Mock drafts (built 2026-11-25, on the preview branch)

The Draft Tools tab (`#drafttools`) is now the mock draft entry page for anyone signed in. Signed out it stays the locked page, with a small looping board preview. Draft pick values is still Coming soon.

- **Three ways to draft, one draft room:** Draft vs CPU (starts at once), Draft with friends (private room, invite link `#draft/<code>`), Join an online draft (three public lobbies from presets, 3-minute countdown from the first person in, Quick join). Empty seats are always filled by CPU teams.
- **Files:** `js/mockdraft.js` (everything on the page), `css/mockdraft.css` (all classes start with `md-`), `api/draft.js` (rooms, rules, CPU drafting, clock, grades), `supabase/mockdraft.sql` (tables), `scripts/test-mockdraft.mjs` (checks). Small hooks: `renderProTab` in `js/offseason.js`, `go()` and `enterApp()` in `js/app.js` (the `#draft/<code>` link), `index.html` (files, FAQ entry "Mock drafts"), `vercel.json` (data files bundled with the function).
- **Player order:** "ADP" in the room is the blend of expert rank and market value the rankings already load, adjusted for the room's scoring (and the superflex market numbers in superflex rooms). The source is never named. TM rank and the vs-market chip sit beside it; the pool can be sorted by TM rank with tier dividers. Kickers and defenses are in the data, so they are in the pool, placed in the last three rounds.
- **CPU teams:** each gets a hidden plan at random (balanced, running backs early, receivers early, early tight end, early quarterback, late quarterback) that only steers the first six rounds. Picks are weighted toward the best few by ADP, with a wider spread in later rounds. They fill starting spots before the bench, take no second QB or TE before the starters are in (except superflex), no K or D/ST before the last three rounds, and always end with a full legal lineup. The plan is shown on the results page once the draft is over.
- **The clock:** the server stores when the pick runs out. Pages count down to it and nudge the server when it passes; the server checks the time itself, so many pages nudging at once still make one pick. Out of time: top of your queue, else best available that fits. Two misses in a row (rooms with other people) puts you on autopick until "I'm back".
- **Solo extras:** Pause, Sim to my pick, Undo (back to your previous pick), resume later, pick-clock "No limit".
- **Friends rooms:** host changes settings, drags the draft order or randomizes, turns empty seats into CPU teams, removes people, starts, and can pause (5 minutes at most). Team rename, room chat (200 characters, plain text, rate limited), emoji reactions on picks. Host leaving hands the room to the next person; everyone leaving finishes the draft on autopick and saves it for each member.
- **Online lobbies:** names are account usernames, no chat, no pause, 60-second clock. Leaving puts the seat on autopick.
- **Results:** grade A+ to F with a rank in the room, by-position bars, best value, biggest reach, projected lineup, round by round with ADP, the full board, any team's result, Draft again, Share (image of the grade card), and a "My mock drafts" list (last 20).
- **Grade:** blends value against ADP, TM rank of the roster, lineup strength and roster balance, each compared with the other teams in the room. The blend can be set with the `DRAFT_GRADE_W` environment variable ("a,b,c,d"). **Provisional until the owner approves it.** Never shown on the site.
- **Saved on the account:** last settings used, the sound switch, and (until the tables exist) the solo draft in progress and the history list.

### Setup needed (not done yet)
1. Run `supabase/mockdraft.sql` in the Supabase SQL editor.
2. `SUPABASE_SECRET_KEY` set in Vercel for **Preview** as well as Production (the preview does not have it today).
3. Supabase Realtime left on (it is by default). Nothing to add to a publication.

Until 1 and 2 are done, **solo drafts work anyway**: the page sends the draft back to the server with each request, the server checks and advances it, and the draft in progress is kept on the account. Friends rooms and online lobbies say they are not switched on yet.

### Not verified yet
- The server was tested with the real code against an in-memory stand-in for the database (200 simulated drafts, solo, friends with three browser sessions, online lobbies). **It has not run against the real Supabase tables**, and Realtime could not be tested here; the tests used the 2-second fallback check.
- 21st.dev's Magic connector was not available in the session, so the motion pieces were written by hand from those component patterns (ring countdown, number ticker, animated list, strip, command-style search, avatar group, drag to reorder, bottom sheet, toasts, spotlight cards, shine), not copied from pulled code.
- Clicking a player opens a small card made for the draft room, not the in-season player card (that one needs a connected league).

---

## Offseason News (built 2026-11-23, not deployed yet)

The News tab in offseason mode. Code in `js/offnews.js`; the in-season News (`js/news.js`) is untouched.

- **Tabs:** Feed · Following · Moves. Injuries, Clips, big plays, #1/#2 finishes and banners are hidden in offseason mode.
- **Phase line** in the left column, from `TMN_PHASES` in `js/offnews.js` ("Free agency opens in 12 days"). The 2027 dates are estimates from past years: update them when the NFL announces them.
- **Server:** `GET /api/news?off=1` (in `api/news.js`). Kinds: trade, sign, release, retire, coach (head coach or offensive coordinator), inj (season-ending), susp, contract. No rumors. Last 14 days by default; the page asks for 30 so Moves can use it. Each story lists every outlet that ran it. No AI.
- **Feed:** players you follow first (orange dot), then league-wide news for players in the TradeMetric top 300 (coaching changes always count). Followed = your follows plus everyone on your saved league rosters (no kickers or defenses).
- **Pro impact line** on each player story: his TM rank now, the change since the day before the move (from the daily snapshots in `data/tmhist.json`), and his role outlook (Growing / Steady / Threatened) when a TradeMetric take already exists. The feed never writes a take (`GET /api/take?outlooks=` only reads stored ones). Signed out: a locked line with "Sign in free".
- **Moves tab:** confirmed transactions for TradeMetric top-300 players in the last 30 days, with position filters. A tap opens the player's row in the Rankings.
- **Alerts** (the bell) for players you follow: traded, new team, signed, released, retired, season-ending injury, suspended, or a head coach or offensive coordinator change on his team.
- **Verification:** a trade, signing or release is never shown until it is backed by a team change in the nightly data (`moves`, or the new `txn` list of signings and releases) or by two outlets. Every alert must be verified the same way.
- **Nav:** News is in the offseason nav after Rankings. Phone bottom bar: Home · Rankings · News · More.
- **Access:** the Feed and Moves are public (like the Rankings). Following, alerts and the impact line need sign-in (Pro, free during the beta).

### Data added
- `txn` in `data/nfl.json` (`scripts/update_data.py`): players who joined a team from no team, or dropped off the player list, `[id, from or '', to or '', date, name, pos]`, kept 30 days. A player who only dropped off the list is never shown without a story, since that can also mean the data lost him.
- `data/tmhist.json` (`scripts/tm_snapshot.mjs`, run by the daily job): one rankings snapshot per day, kept 32 days. The script loads `js/offseason.js` as is, so no score details are copied anywhere.

### Not verified yet
- Tested in a browser with sample stories (the local server has no `/api`). Real story matching and the kind sorting need a read-through on the preview.
- The daily job runs on `main`, so snapshots and `txn` only build up once this is merged. Until then the preview has one snapshot, so rank changes won't show there.

---

## TradeMetric take (built 2026-11-14)

A short AI-written read on each player, shown in the breakdown panel next to the score bars.

- **What it is:** 2–3 plain sentences on his outlook for next season, plus a **role outlook** tag: **Growing**, **Steady** or **Threatened**.
- **What it is written from:** his numbers (ranks, expected points per game, WOPR, opportunity grade, age next season) plus recent reports — stories that name him (coach comments on usage, role, depth chart) and moves at his position on his team (signings, trades, releases, draft picks). Stories come from the same outlets as the News tab (`api/news.js`: `collect()` with a new `outlook` search over 30 days, and the same AI call settings via `askClaude`).
- **Rules the AI is given:** only use the facts provided; plain words; never name a website, outlet, reporter or data source; never mention the formula or weights. The server also drops any sentence that names an outlet or another fantasy site before saving.
- **When it is written:** only when someone opens a player's panel. Never in bulk.
- **Caching:** one take per player on the server. It is reused until new stories about him come in (checked at most every 6 hours per player) or it is 7 days old. The browser also keeps it for the session, so reopening a panel makes no request.
- **Pro only:** `POST /api/take` needs a signed-in account's token (checked with Supabase on the server). While `BETA_PRO = true` in `api/take.js` every signed-in account counts; turn it off together with `TMO_BETA_PRO`. Signed-out visitors see a placeholder inside the existing blurred lock; no take text is sent to them.
- **Limits:** 60 new takes per account per hour.
- **Role outlook storage:** saved with the take in the Supabase table **`player_takes`** (`outlook` column: growing / steady / threatened). It does **not** change any score yet. Next step when ready: read it into `TM_opportunity_score`.

### Setup needed for takes to be saved (not done yet)
1. Run `supabase/takes.sql` in the Supabase SQL editor (creates `player_takes`, server-only).
2. Add `SUPABASE_SERVICE_ROLE_KEY` to the Vercel project env vars (Production **and** Preview).
3. Make sure `ANTHROPIC_API_KEY` (or `APIKEY1`) is set for the Preview environment too.

Until 1 and 2 are done, takes work but are only kept in the server's memory, so they are rewritten after a server restart and role outlooks are not stored.

### Not verified yet
- The take has only been tested with mocked stories and a mocked AI reply. Real take quality on the preview (with live stories) still needs a read-through.
- `vercel.json` now bundles `data/nfl.json` with `api/take.js` (so player names come from our own data, not the request). Confirm on the first preview deploy that takes load.

---

## Mode Logic

### Three states
| State | Trigger | What's shown |
|---|---|---|
| **Offseason** | No league connected, OR after the season-end buffer | Rankings, draft tools, season recap, draft pick value tool |
| **In-Season** | Active league connected + within NFL fantasy calendar | Trade analyzer, live roster/standings-aware recs |
| **Draft Season** | Active league connected + pre-season window (Jun–Aug) | Draft rankings front and center, pick trade tool |

### Mode resolution (priority order)
1. Manual override (localStorage `tm_mode_override`) always wins
2. If no league connected → **Offseason**
3. If league connected but season ended more than the buffer ago → **Offseason** (league stays linked, no roster)
4. If league connected + pre-season window (Jun–Aug) → **Draft Season** *(not built yet)*
5. If league connected + active season window → **In-Season**

### "Season over" definition
- **Per-account**: triggered off that ESPN league's final scoring week completing
- **Global fallback**: mid-January cutoff for leagues that don't report cleanly
- **Recap window**: recap lives on homepage hero; after the buffer, moves to `/recap/[leagueId]/[year]` and site fully transitions to offseason
- Generate and store the recap snapshot **before** the roster clear
- After the buffer → roster data cleared, league identity + history preserved

### Post-recap connected state
- League stays connected with no active roster
- Year-over-year recap comparisons available as history builds
- League pre-populated when next season starts (no reconnect needed)
- "Your league draft is in X days" countdown once new season approaches

---

## Access Model — paid site, rankings are the free hook

TradeMetric is a **paid product**. Rankings are the one public thing; everything else is Pro.

- **Free / public (no sign-in)**: TradeMetric Rankings (order, TM Score, tiers, vs-market, sleepers & busts) and the offseason homepage
- **Pro (paid)**: player breakdown and TradeMetric take, league-fit rankings, Season Recap, draft pick value tool, mock drafts, trade analyzer, waiver recs, anything roster-aware
- Locked features show a lock + "Pro" tag and an inline unlock prompt, not a hard redirect
- **Nav (built):** every Pro tab shows in the offseason top nav so people see everything they're missing; signed out, clicking one opens a page that explains the tool and asks them to sign in. The trial step comes with checkout *(not built yet)*
- **Beta:** Pro is free for every signed-in account until the beta ends
- No other fantasy app names appear on the site. Data sources are inputs to the TradeMetric formula — not credited or surfaced to users unless legally required by a source's terms.
- The TM Score weights and formula are never shown on the site.

### Pricing and trial (decided 2026-11-14)
- **7-day free trial, card required up front**; auto-bills when the trial ends unless cancelled; send a reminder before the first charge
- **Target price:** about $6–8/month or ~$50/year
- **Checkout:** Stripe (handles trials and auto-billing), sets `profiles.plan` *(not built yet)*

---

## Rankings — TradeMetric Formula

Offseason rankings use a **different model than the in-season trade formula**. The in-season formula accounts for rest-of-season value, standings context, and weekly volatility — none of which apply offseason.

The output is published as **TradeMetric Rankings** — no mention of data inputs or other tools. The formula is the product.

### Formula — internal only, never shown on the site or written in this public repo's docs
TM Score = weighted blend of expert consensus, market ADP and `TM_opportunity_score`. Weights live in `TMO_W` in `js/offseason.js`. Chosen to keep rankings sensible while the model is unproven. Plan: backtest against last season, and raise the TradeMetric share once it proves it calls breakouts well.

**How the parts are blended:** each part is put on the market's value curve at the player's position (consensus rank → market value at that positional rank; opportunity rank → same), so QB and RB numbers are comparable, then blended and scaled so #1 = 100.

**What goes into `TM_opportunity_score` (built):** expected fantasy points per game, WOPR (not QBs), points over expected per game, age curve for next season's age, depth chart rank, team offense. Players with fewer than 4 games are pulled toward average. Only two of them (expected points per game, WOPR) are shown in the player breakdown.

**Not built yet:** role outlook from the TradeMetric take (stored, not used yet), OLine rank, scheme, QB quality, contract year.

### Tiers
Gap-based: a new tier starts where the drop to the next player is much bigger than the typical drop around it (min 3 per tier, max 16).

### Sleepers & Busts
- **Sleeper**: TM ranks him well above market, inside TM top 150
- **Bust**: TM ranks him well below market, inside market top 150
- Framed as "TradeMetric sees something the market doesn't" — no mention of what the market source is

---

## Offseason Features to Build

### 1. Rankings — ✅ built (preview), with trimmed breakdown and TradeMetric take
### 2. Season Recap (Pro) — ✅ slideshow built (preview) and linked from the Recap tab, with a sample recap (see `recap-wrapped.md`)
- Private to the account owner — sign-in required, auth-gated route
- Triggered when a league's final week settles
- Lives on homepage hero for the recap window, then moves to `/recap/[leagueId]/[year]`
- Final summary card exportable as image / shareable (card only, not the full slideshow)
- Store raw data at time of trade so grades can be recalculated if formula improves
- Needs to be live by ~Dec 28 (fantasy playoffs end)

### 3. Draft Tools (Pro) — mock drafts built (see above); pick values not built
**Draft pick values**
- Reuses trade calculator UI, aimed at draft picks
- "Is 1.04 worth more than 1.07 + a 3rd?"

**Mock drafts**
- Opponents that vary strategy each run; post-draft grade

### 4. League Fit (Pro) — tab and Coming soon page built; tool not built
- Rankings re-sorted for the user's league scoring, roster spots and roster needs

### 5. Trial checkout
- Stripe checkout with the 7-day card-up-front trial; locked tabs then prompt sign-in + trial

### 6. Role outlook into the opportunity model
- Use the stored Growing / Steady / Threatened outlook as an input to `TM_opportunity_score`

### 7. Next-Season Preview
- Rankings updated as NFL draft / FA news comes in

---

## Design direction
Clean and professional: roomy rows, position color chips (QB purple, RB green, WR blue, TE orange), dark tier bars in Kanit italic, the TM Score as the star column. The rankings table stays free and uncluttered. The offseason pages are meant to become the style guide for redoing the rest of the site later.

---

## Open Questions
- **Site footer names data sources** and shows on the public offseason pages; the How it works page names market sources too. Decide whether those credits are required by the sources' terms or should be removed.
- **Market data source**: which source(s) for offseason consensus + ADP? Terms of service check needed.
- **Exact price** within the $6–8/mo, ~$50/yr range.
- **When the beta ends** (flip `TMO_BETA_PRO` off in `js/offseason.js` and `BETA_PRO` in `api/take.js`).
- **Rankings update cadence**: static until NFL draft, or updated weekly with news?
- **Recap name**: "Recap" is the working title — finalize before launch
- **Supabase redirect URL** for the preview domain so sign-in works on the preview
- **Home page tool grid:** Recap and Mock drafts link to their tabs; League fit, Draft pick values and Trade analyzer are marked Coming soon.
