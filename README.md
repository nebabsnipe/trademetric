# TradeMetric

Live at https://www.trademetric.app

Fantasy football trades, rankings and lineup advice built on your league's exact settings.

## What's where

| File | What it is |
| --- | --- |
| `index.html` | Page layout: the top bar, tabs and every section |
| `css/styles.css` | All colors, fonts and spacing. Colors are variables at the top (`--accent` is the orange) |
| `js/app.js` | Everything the site does: scoring, projections, the Trade Score, Season Sim, rankings, imports |
| `js/news.js` | The News tab, big-play banners and per-league notification switches. Trigger rules (yardage, touchdowns, big games, crunch-time swings, clinchers) are in `TMN_R` at the top |
| `js/offnews.js` | The News tab in offseason mode: Feed, Following and Moves, the phase line (dates in `TMN_PHASES`), the Pro impact line and alerts for players you follow |
| `data/nfl.json` | The stats snapshot the site reads. Rebuilt every morning by GitHub |
| `data/preseason.json` | Preseason expectations blended into projections. Replace each summer |
| `api/ai.js` | Server function for the AI Helper, scouting reports and screenshot reading |
| `api/plays.js` | Play-by-play for the News tab: touchdowns and 20+ yard runs and catches from ESPN's game summaries, cached 1 minute during games. If it fails, the page falls back to comparing live stat totals |
| `api/live.js` | Live game-day data: scores, game clocks, player stats so far, injury news (cached 2 min during games, 10 min otherwise) |
| `api/feed.js` | Highlights tab: clips from the NFL's and all 32 teams' official YouTube channels (this week and last), game results and news headlines, cached 5 minutes. Optional `YOUTUBE_API_KEY` env var reads 50 uploads per channel instead of 15 |
| `scripts/market.py` | Daily redraft market snapshot (FantasyCalc, KeepTradeCut) saved to `data/market.json` for the trade model |
| `scripts/tm_snapshot.mjs` | Daily TradeMetric Rankings snapshot (runs in the daily job, writes `data/tmhist.json`, kept 32 days) for the offseason News impact line |
| `scripts/yt_channels.py` | Finds each team's official YouTube channel ID (runs in the daily job, writes `data/yt_channels.json`) |
| `js/recap-video.js` | The season recap's "Save video": draws a 15-second highlight reel on a canvas and records it in the browser |
| `js/mockdraft.js`, `css/mockdraft.css` | Mock drafts on the offseason Mock Drafts tab: entry page, lobby, draft room, board, results |
| `api/draft.js` | Server for mock drafts: rooms, rules, CPU drafting, the pick clock and grades. `node scripts/test-mockdraft.mjs` checks it; add `dump 3` to print three simulated drafts |
| `supabase/mockdraft.sql` | Tables for mock draft rooms. Run once after accounts_v2.sql |
| `api/_players.js` (answers `/api/players`, through `api/market.js`) | Compact Sleeper player list used to sync rosters in the background |
| `api/_shared.js` | The shared news store: injury status history, story recaps and the league news archive, saved in Supabase so they are built once and sent to everyone (see "Shared news store" below) |
| `api/push.js`, `api/_push.js` | Push notifications: saving devices, the test button, and the scheduled injury check with all its rules. See `docs/push-notifications.md` |
| `sw.js`, `manifest.webmanifest`, `js/push.js` | The push-only service worker, the Home Screen app details, and the Push notifications card in Account |
| `api/espn.js` | Reads private ESPN leagues with the user's espn_s2 and SWID codes (never stored) |
| `supabase/schema.sql` | Table that stores each user's saved league. Run once in Supabase's SQL Editor |
| `supabase/accounts.sql` | Usernames, username sign-in and the wrong-password lockout. Run once after schema.sql |
| `supabase/accounts_v2.sql` | Usernames for social sign-in, username changes, plans, account deletion. Run once after accounts.sql |
| `supabase/shared.sql` | Tables for the shared news store. Run once after accounts_v2.sql |
| `supabase/push.sql` | Devices that have notifications on, and the record of what was sent. Run once after shared.sql |
| `supabase/email/` | TradeMetric-branded confirmation and password-reset emails to paste into Supabase |
| `scripts/update_data.py` | Downloads fresh stats, injuries, schedules, betting lines and expert rankings |

Handy places in `js/app.js`:
- **Trade Score:** search for `CONS_W`, `STAR_POW`, `QB_1QB` and `TS_W` to change the weights.
- **Team colors:** search for `TEAM_PAL`.
- **Default scoring:** search for `BASE_SC`.

## Run it on your computer

```
npm run dev
```
Then open http://localhost:3000. (Needs Node 18+.) The AI features only work on Vercel or with `vercel dev`.

## Put it online (Vercel)

1. Go to vercel.com, sign in with GitHub, click **Add New → Project**, and pick this repository. Leave every setting at its default and click **Deploy**.
2. For the AI features: in the Vercel project, open **Settings → Environment Variables** and add `ANTHROPIC_API_KEY` with a key from console.anthropic.com. Redeploy.
   Set a monthly spend limit in the Anthropic console, since anyone visiting the site can use the AI.
3. Optional: **Settings → Domains** to add your own domain.

Every change pushed to the `main` branch goes live automatically in about a minute.

## Trade model (redraft)

1. **Player value:** rest-of-season points per game x chance he plays each week (injury status; IR/PUP/suspended = 0 until an estimated return week) x matchup; fantasy playoff weeks count 1.75x.
2. **Team impact:** week-by-week change in the best starting lineup + bench insurance + best free agent for a freed roster spot.
3. **Would they accept:** market value (FantasyCalc, KeepTradeCut, FantasyPros snapshot) + their lineup change + need bonus.
4. **Final score:** Season Sim playoff/title odds change + Weeks 15-17 points, weighted by team mode, minus injury and stacking risk. Grades A+ to F for both sides.

Weights live in `MODE_W` and `PO_WT` in `js/app.js`.

## Scoring

When a league is imported from Sleeper or ESPN, it re-syncs in the background (rosters, team names, records, starters and points) when the site opens and every few minutes. Your other saved leagues (the ones not on screen) re-sync their rosters, records and lineups too: whenever the site opens, when the NFL week changes, and every 6 hours while it stays open. Live and final fantasy points for the week come from that platform, and lineups follow the starters set there. Projections are TradeMetric's own. Kickers (K) are included, with kicking scoring under League Setup.

## Fresh data every day

`.github/workflows/update-data.yml` runs `scripts/update_data.py` every morning and commits the new `data/nfl.json`, which triggers a redeploy. To run it right away: GitHub → **Actions → Update NFL data → Run workflow**.

Data: [nflverse](https://github.com/nflverse/nflverse-data) (stats, schedules, betting lines, injuries, rosters, snap counts) and FantasyPros expert consensus via [DynastyProcess](https://github.com/dynastyprocess/data).

## Accounts (Supabase)

TradeMetric has its own sign-in page (no Supabase screens). People sign up with a username, email and password, or with Google, Apple or Discord, and sign in with their username or email. Sign-in lasts one season: everyone stays signed in until Feb 15 after the season, then signs in once more (their leagues stay saved). Each user's leagues are saved to the `user_state` table, and row-level security means people can only read their own row.

**Everything follows the account, not the browser.** The same row also holds the rest of what the site remembers about you (`S.acct` in `js/app.js`): news history, alerts you've seen, the injury statuses last seen for your players, #1 finishes, the Feed filter, your stat columns, your trade-ideas request and light or dark mode. Signing in on any device loads the server's copy, and it always replaces whatever that browser had. The browser's localStorage is only a cache so the page opens instantly (`trademetric-v1`, plus short-lived copies of server responses such as the clips feed). When two devices are open at once, a save only lands if nobody else saved first; the device that loses loads the other's copy and adds its own news to it. The only thing kept per device is the optional ESPN private-league codes, which are never sent to the database. The project URL and publishable key are in `js/app.js` (search for `SUPA_URL`); both are safe to be public.

**Email confirmation stays on the page you signed up on.** The email carries a code to type in, and its link still works: whoever clicks it, on any device, the original tab notices and signs in by itself.

The account area (`#account`) has Profile, Leagues, Subscription and Security sections. Subscription is a placeholder until paid plans launch; `profiles.plan` is already there for it.

### One-time Supabase setup

1. **SQL:** run `supabase/schema.sql`, then `supabase/accounts.sql`, then `supabase/accounts_v2.sql`, then `supabase/shared.sql` in the SQL Editor.
2. **Emails:** Authentication -> Emails. Paste `supabase/email/confirm-signup.html` into *Confirm signup* and `supabase/email/reset-password.html` into *Reset password* (the subject line is in the comment at the top of each file). These add the code.
3. **Sender:** Authentication -> Emails -> SMTP Settings. Supabase's built-in sender only allows a couple of emails an hour and sends from Supabase's address. Connect a sender such as Resend or Postmark with an address like `hello@trademetric.app`.
4. **Redirect URLs:** Authentication -> URL Configuration. Site URL `https://www.trademetric.app`; add `https://www.trademetric.app/**` and `https://*-trademetric.vercel.app/**` to Redirect URLs so links and social sign-in work on previews too.
5. **Social sign-in:** Authentication -> Providers. Switch on Google, Apple and Discord and paste each one's client ID and secret. Buttons for providers that are still off show as dimmed with a "coming soon" note.

### Shared news store

News that is the same for everyone is built on the server once and sent to every visitor, instead of each browser building its own copy while it happens to be open:

- **Injury status history.** Every time `/api/live` reads the injury feeds it records what changed. The News tab turns the last 7 days of changes into cards for your players, so a brand-new account or a new phone shows the same history as a computer that was open all week.
- **Story recaps.** Each story's AI recap is written once and reused for every reader (same wording for everyone, and the AI is only paid for once).
- **League news.** Outlets only list their newest stories, so the last 7 days of trades, signings and injuries are kept.

Two one-time steps switch it on. Until both are done the site works the way it did before (injury changes are noticed by whichever of your devices is open and shared through your account; recaps are written per server):

1. Run `supabase/shared.sql` in Supabase's SQL Editor.
2. In Supabase open **Settings -> API Keys** and copy the **Secret key** (starts with `sb_secret_`). In Vercel open **Settings -> Environment Variables**, add `SUPABASE_SECRET_KEY` with that value, and redeploy. Never put this key in the page's code; it is only read by the server functions.

The history is recorded whenever someone has the site open (the live data refreshes every few minutes). Changes that happen while nobody is on the site are recorded at the next visit, stamped with that time.

## Always the newest build

`index.html` is never cached (`vercel.json`), and every css and js file carries a `?v=` number. **Bump those numbers in `index.html` whenever a css or js file changes.** A tab or home-screen copy left open notices the new numbers when it comes back to the front and reloads itself.

## Coming next

- Paid plans (Stripe), managed from Account -> Subscription
- Mobile layout pass
