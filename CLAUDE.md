# TradeMetric — project rules for Claude

TradeMetric (trademetric.app) is a paid fantasy football trade analyzer. Hosted on Vercel, deployed from this repo (`nebabsnipe/trademetric`). Domain registered at GoDaddy.

**This repo is public.** Never commit secrets (API keys, passwords, private league IDs, personal emails) or the TM Score weights to it, in code comments or docs. Secrets go in Vercel environment variables.

## How this codebase works (read before editing)
- Plain HTML/CSS/vanilla JS, no framework, no build step. `index.html` + `css/styles.css` + `js/app.js` (most logic), `js/news.js`, `js/mobile.js`. Serverless functions in `api/` (Vercel). Data in `data/` (rebuilt daily by `.github/workflows/update-data.yml`). Database/auth is Supabase (`supabase/*.sql`). See `README.md` for the full file map.
- Run locally: `npm run dev` → http://localhost:3000. AI features and `/api` need Vercel (`vercel dev`) or the deployed preview.
- **Bump the `?v=` cache-busters in `index.html` whenever you change any css or js file**, otherwise users keep the old file.
- Test changes in a browser at desktop (1280) and phone (390) widths, light and dark mode, and check the console for errors before pushing.
- Don't only test as the owner: other users differ in address, platform (Sleeper vs ESPN), account age and empty browser caches.
- The Vercel preview environment is missing `SUPABASE_SECRET_KEY` and `ANTHROPIC_API_KEY`, so previews show raw headlines and no shared store.
- Pushing to `main` deploys to www.trademetric.app in about a minute. Only push to main when the owner says to.
- The owner isn't a programmer: explain changes in plain words, not code terms.

## Feature plans and history
Longer plans and build notes are in `docs/`: offseason mode, season recap, trade visuals, advanced stats, accounts, account sync, push notifications, and a running feature-notes list. Read the relevant one before working on that area, and update it when something ships or a decision changes.

## Hard rules — never break these
- **Never name other fantasy sites or data sources** anywhere on the site.
- **Never show the TM Score weights or formula** anywhere on the site.
- **Never show a 100% chance to win** unless the user is truly 100% to win.
- **Every trade must be verified as real** before it is shown as a trade alert (we once showed a false "Brock Bowers traded to the Raiders" alert).
- **Redraft only** for now. No dynasty features yet.
- **Rankings stay free/public.** Everything else is premium. During the beta, everyone gets Pro unlocked.
- **Keep the site simple and uncluttered.** Aim for a clean, professional look (in the spirit of the big fantasy analysis sites) and avoid anything that looks like generic "AI slop" UI.

## Branches & deploys
- `main` = live site.
- Offseason mode work goes on the `offseason-mode` branch (Vercel preview), **not** main. It was built as a copy of the real site's code and gets merged in later.

## Data & accounts
- User data (news history, alerts, league data) is saved **on the server, not in the browser**, so every device gets the same state. The site should work for every user exactly as it does on the owner's machine.
- Player injury/status data comes from one consistent source, preferring the user's own league platform (Sleeper league → Sleeper data, ESPN → ESPN).
- If a user imports a league with the same ID as one already saved, delete the old one and keep the new import.
- Sign-in sessions last one season. Social sign-in (Google, Apple, etc.). The account area should be ready for a subscription system: about $6–8/month or around $50/year, with a 7-day free trial that requires a card up front.
- Account icon letter = first letter of the username.

## Offseason mode
- Offseason is the default/baseline state. Connecting an active league unlocks the in-season trade analyzer and live updates.
- After a league's season ends, accounts auto-switch to offseason mode (owner said about a week; `docs/offseason-mode-plan.md` says 10 days). A season recap ("wrapped") event happens when leagues end.
- The top nav shows all premium tabs; clicking one requires sign-in.
- Offseason TM Score blends expert consensus, ADP and the TradeMetric opportunity score. The weights live in `TMO_W` in `js/offseason.js` (on the `offseason-mode` branch). **Never write the weights on the site or in docs** — this repo is public.
- The ranking model should also factor in reports (team usage talk, likely backfield additions, etc.), not just stats.
- Rankings player breakdown: trimmed (no depth chart or extra lines), plus a short per-player "TradeMetric take". Leave the rankings table itself as is.

## My Team (home page)
- Start or sit: **click-only** (no drag), no bulky on/off buttons, and **empty on load** (no pre-placed players).
- No recommended-trades section on My Team.
- No "add a player" type-in box at the bottom.
- Injured reserve card: no "X is IR eligible" text and no "Synced from ESPN" footer.
- No "Week X · stats through Week Y" line at the top. "Load sample league" is removed entirely.
- "Weakest spot" must never pick DEF or K.
- Matchup position comparison: show a "peek" (first few slots, then a fade and a "see all positions" link).
- Lineup alerts only for obvious mismatches: an empty slot, or a bench player projected **at least 5 points more** than the starter.
- Injury opportunities: only backups projected over about 7 pts/game with the extra work; can include players to trade for.

## Trades tab
- Big full-width "Trade builder" / "Trade ideas" tabs under the header, with the idea count shown as a badge.
- "Tell us what you want" request box: one input and a few chips. No chat window or extra panels. The AI returns **structured preferences only, never trades**.
- Trade rating "Your starting lineup": a week-by-week chart. No slot-by-slot bars, no position-by-position breakdown, no separate points-per-week strip.
- Trade visuals should make differences clearly visible (slightly exaggerated), since most trades are close.
- Trade recommendations should account for league teams' standings and lineups.

## Other tabs
- No Draft tab in the in-season site.
- Alerts: opening the Alerts tab marks them seen. Seen alerts clear after 3 days, unseen after 7. Trade and #1-finish notifications pop up for users who missed them, only within 7 days.

## Phone layout
- A separate phone layout switches automatically from desktop. It should feel app-like (like a native iPhone app), be easy to scroll, and have fewer click-into screens.

## Future plans (don't build unless asked)
- Dynasty support: formulas will change; users would tell the AI their strategy (contending vs. rebuilding, target year).
- Mobile app with big-play banners/notifications linking to highlights.
- Google search configuration (SEO).
- A full professional visual redesign of the whole site.
