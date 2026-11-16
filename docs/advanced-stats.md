# Players tab — advanced stats

**Status: live on main** (the stat picker, `STATS` and `QUAL` are in `js/app.js`).

## Summary
Almost everything was already in the weekly player stats file the site downloads every morning (`targets`, `carries`, `target_share`, `air_yards_share`, `wopr`, `receiving_air_yards`, rushing/receiving TDs). Two new free sources were added in the same pattern as `scripts/update_data.py`: an expected-points file and play-by-play (only nine columns read, for red zone).

## Stats
| Stat | Notes |
|---|---|
| OPP | carries + targets |
| Tgt / Car | weekly log |
| AY % | can go negative for backs targeted behind the line — real, not a bug |
| WOPR | used directly from the source (1.5 × target share + 0.7 × air-yards share) |
| Car % | team carry totals taken before filtering to skill players |
| RZ opp / Inside 10 | from play-by-play |
| TD / xTD / TDOE | includes passing TDs so QB xTD means something |
| FP / FP/G | what he actually scored (Pts/G is the rest-of-season projection) |
| xFP, xFP/G, FPOE | full PPR, labelled as such |

## Table layout (built): one stat picker
A single `Show` dropdown above the table adds one extra column for any of the sixteen stats, sorted descending, with a plain-English definition beside it. Never more than twelve columns. Grouped into Volume, Usage, Scoring and Expected. Choice saved under `tm_stat` (now on the account). Definitions live in one `STATS` table in `js/app.js`.

## Qualified players
QB/RB/WR/TE only, at least 3 games and a 15% average snap share; expected stats need 2 games. Others show a dash and sort last. Thresholds in `QUAL` at the top of `js/app.js`.

## Payload
`data/nfl.json` went from 360 KB to 410 KB. Expected and red zone stats stored as season totals.

## Still open
1. Help page explainers for WOPR, xFP and FPOE in `#v-help`.
2. Use FPOE and WOPR as buy-low / sell-high signals in the trade formula.
