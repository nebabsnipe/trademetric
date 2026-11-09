# TradeMetric

Live at https://www.trademetric.app

Fantasy football trades, rankings and lineup advice built on your league's exact settings.

## What's where

| File | What it is |
| --- | --- |
| `index.html` | Page layout: the top bar, tabs and every section |
| `css/styles.css` | All colors, fonts and spacing. Colors are variables at the top (`--accent` is the orange) |
| `js/app.js` | Everything the site does: scoring, projections, the Trade Score, Season Sim, rankings, imports |
| `data/nfl.json` | The stats snapshot the site reads. Rebuilt every morning by GitHub |
| `data/preseason.json` | Preseason expectations blended into projections. Replace each summer |
| `api/ai.js` | Server function for the AI Helper, scouting reports and screenshot reading |
| `api/live.js` | Live game-day data: scores, game clocks, player stats so far, injury news (cached 2 min during games, 10 min otherwise) |
| `api/feed.js` | Highlights tab: clips from the NFL's and all 32 teams' official YouTube channels (this week and last), game results and news headlines, cached 5 minutes. Optional `YOUTUBE_API_KEY` env var reads 50 uploads per channel instead of 15 |
| `scripts/market.py` | Daily redraft market snapshot (FantasyCalc, KeepTradeCut) saved to `data/market.json` for the trade model |
| `scripts/yt_channels.py` | Finds each team's official YouTube channel ID (runs in the daily job, writes `data/yt_channels.json`) |
| `api/players.js` | Compact Sleeper player list used to sync rosters in the background |
| `api/espn.js` | Reads private ESPN leagues with the user's espn_s2 and SWID codes (never stored) |
| `supabase/schema.sql` | Table that stores each user's saved league. Run once in Supabase's SQL Editor |
| `supabase/accounts.sql` | Usernames, username sign-in and the wrong-password lockout. Run once after schema.sql |
| `supabase/accounts_v2.sql` | Usernames for social sign-in, username changes, plans, account deletion. Run once after accounts.sql |
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

When a league is imported from Sleeper or ESPN, it re-syncs in the background (rosters, team names, records, starters and points) when the site opens and every few minutes. Live and final fantasy points for the week come from that platform, and lineups follow the starters set there. Projections are TradeMetric's own. Kickers (K) are included, with kicking scoring under League Setup.

## Fresh data every day

`.github/workflows/update-data.yml` runs `scripts/update_data.py` every morning and commits the new `data/nfl.json`, which triggers a redeploy. To run it right away: GitHub → **Actions → Update NFL data → Run workflow**.

Data: [nflverse](https://github.com/nflverse/nflverse-data) (stats, schedules, betting lines, injuries, rosters, snap counts) and FantasyPros expert consensus via [DynastyProcess](https://github.com/dynastyprocess/data).

## Accounts (Supabase)

TradeMetric has its own sign-in page (no Supabase screens). People sign up with a username, email and password, or with Google, Apple or Discord, and sign in with their username or email. Sign-in lasts one season: everyone stays signed in until Feb 15 after the season, then signs in once more (their leagues stay saved). Each user's league is saved to the `user_state` table, and row-level security means people can only read their own row. The project URL and publishable key are in `js/app.js` (search for `SUPA_URL`); both are safe to be public.

**Email confirmation stays on the page you signed up on.** The email carries a code to type in, and its link still works: whoever clicks it, on any device, the original tab notices and signs in by itself.

The account area (`#account`) has Profile, Leagues, Subscription and Security sections. Subscription is a placeholder until paid plans launch; `profiles.plan` is already there for it.

### One-time Supabase setup

1. **SQL:** run `supabase/schema.sql`, then `supabase/accounts.sql`, then `supabase/accounts_v2.sql` in the SQL Editor.
2. **Emails:** Authentication -> Emails. Paste `supabase/email/confirm-signup.html` into *Confirm signup* and `supabase/email/reset-password.html` into *Reset password* (the subject line is in the comment at the top of each file). These add the code.
3. **Sender:** Authentication -> Emails -> SMTP Settings. Supabase's built-in sender only allows a couple of emails an hour and sends from Supabase's address. Connect a sender such as Resend or Postmark with an address like `hello@trademetric.app`.
4. **Redirect URLs:** Authentication -> URL Configuration. Site URL `https://www.trademetric.app`; add `https://www.trademetric.app/**` and `https://*-trademetric.vercel.app/**` to Redirect URLs so links and social sign-in work on previews too.
5. **Social sign-in:** Authentication -> Providers. Switch on Google, Apple and Discord and paste each one's client ID and secret. Buttons for providers that are still off show as dimmed with a "coming soon" note.

## Coming next

- Paid plans (Stripe), managed from Account -> Subscription
- Mobile layout pass
