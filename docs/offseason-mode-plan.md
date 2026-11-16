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
### 2. Season Recap (Pro) — tab and Coming soon page built; tool not built (see `recap-wrapped.md`)
- Private to the account owner — sign-in required, auth-gated route
- Triggered when a league's final week settles
- Lives on homepage hero for the recap window, then moves to `/recap/[leagueId]/[year]`
- Final summary card exportable as image / shareable (card only, not the full slideshow)
- Store raw data at time of trade so grades can be recalculated if formula improves
- Needs to be live by ~Dec 28 (fantasy playoffs end)

### 3. Draft Tools (Pro) — tab and Coming soon page built; tools not built
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
- **Home page tool grid** still marks only three tools as Coming soon; Recap and League fit are also not built yet.
