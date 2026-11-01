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
| `api/espn.js` | Reads private ESPN leagues with the user's espn_s2 and SWID codes (never stored) |
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

## Fresh data every day

`.github/workflows/update-data.yml` runs `scripts/update_data.py` every morning and commits the new `data/nfl.json`, which triggers a redeploy. To run it right away: GitHub → **Actions → Update NFL data → Run workflow**.

Data: [nflverse](https://github.com/nflverse/nflverse-data) (stats, schedules, betting lines, injuries, rosters, snap counts) and FantasyPros expert consensus via [DynastyProcess](https://github.com/dynastyprocess/data).

## Coming next

- User accounts and saved leagues (Supabase)
- Mobile layout pass
