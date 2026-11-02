# TradeMetric

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
| `scripts/yt_channels.py` | Finds each team's official YouTube channel ID (runs in the daily job, writes `data/yt_channels.json`) |
| `api/players.js` | Compact Sleeper player list used to sync rosters in the background |
| `api/espn.js` | Reads private ESPN leagues with the user's espn_s2 and SWID codes (never stored) |
| `supabase/schema.sql` | Table that stores each user's saved league. Run once in Supabase's SQL Editor |
| `supabase/accounts.sql` | Usernames, username sign-in and the wrong-password lockout. Run once after schema.sql |
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

## Scoring

When a league is imported from Sleeper or ESPN, it re-syncs in the background (rosters, team names, records, starters and points) when the site opens and every few minutes. Live and final fantasy points for the week come from that platform, and lineups follow the starters set there. Projections are TradeMetric's own.

## Fresh data every day

`.github/workflows/update-data.yml` runs `scripts/update_data.py` every morning and commits the new `data/nfl.json`, which triggers a redeploy. To run it right away: GitHub → **Actions → Update NFL data → Run workflow**.

Data: [nflverse](https://github.com/nflverse/nflverse-data) (stats, schedules, betting lines, injuries, rosters, snap counts) and FantasyPros expert consensus via [DynastyProcess](https://github.com/dynastyprocess/data).

## Accounts (Supabase)

People create an account with a username, email and password, and sign in with their username or email. "Keep me signed in" keeps them signed in on that device; without it they're signed out after 2 weeks (their league stays saved). Each user's league is saved to the `user_state` table, and row-level security means people can only read their own row. The project URL and publishable key are at the bottom of `js/app.js` (search for `SUPA_URL`); both are safe to be public.

## Coming next

- Sign in with Google
- Mobile layout pass
