# Trades tab rework — visuals

**Status: shipped to main 2026-11-09 (commit b94acfd).** Follow-up cleanups shipped the same day (commits 528cb9f, 8c134d0, cf00a9d). The original "hands-on" plan (drag, tilt scale, sliders, trade map) was dropped for a simpler, cleaner design. Later changes (Nov 14–15): the "Your starting lineup" section is now a week-by-week chart (slot bars, position breakdown and points-per-week strip removed), the "tell us what you want" request box was added, and Trade builder / Trade ideas became big full-width tabs. See `CLAUDE.md` for the current rules.

## Round 4 (commit cf00a9d) — Your roster picker
A two-column list: rows ordered by position then value, each with jersey, pos rank, team, Pts/G and a check that fills when the player is in the deal; an All/QB/RB/WR/TE/K-DST filter (`data-rpos`); a "18 players · 2 in deal" count; short names and Pts/G under the name on phones; a fade-in on tray cards (`TD.fresh`). IR players carry an IR marker.

## Round 3 (commit 8c134d0)
- **Trade rating:** the trailing Compare players button is gone. The trade table footer and recommended-trade cards still have Compare players.
- **Your roster** sits at the top of the Trade table card, above the You give / You get trays, and shows every player. Empty trays say "Pick from your roster" and "Pick from Players to trade for".
- **Copy trimmed** throughout.

## Round 2 (commit 528cb9f)
- Trade builder is the first section.
- **Players to trade for:** the whole row adds the player (click again to remove); only the name opens the player card. Rows are focusable (Enter/Space).
- **Trade rating:** removed "Full breakdown", "Why this works for both sides" and **Mark as accepted**. `bothSides`, `dealBreakdown`, `playoffPanel`, `playoffCall`, `realGauge` deleted.
- **Current week:** once any player in a deal has kicked off this week (`liveOf(id)`), `evalTrade` passes `skipNow`: `teamImpact` and `weekStrip` start at Week+1, and `simulate(over, keepNow)` keeps both original rosters for the current week. The rating shows a one-line note.
- League Hub trade log hides when empty.

## What shipped (round 1)
Vanilla JS, inline SVG and CSS. No new data, no libraries. Light and dark mode, tested at 1280 and 390.

- **Trade cards** (`tradeCardHtml`): "You give" over "You get" with jersey badges and Pts/G; both sides' grades as large letter tiles with a fairness bar; pills for lineup change per week, playoff odds before → after, Realism Score; explanation clamped to 4 lines; Open in builder and Compare players buttons.
- **Trade table** (`renderTrade`): `#give-tray` / `#get-tray` player cards with this week's projection, rest-of-season Pts/G and last-3 average. `TD.give` / `TD.get` are the state.
- **Trade rating** (`renderRating`): big grade cards (`.gcard`), tiles for lineup change, playoff odds, title odds and Realism.
- **Compare players** (`openCompare` / `drawCompare`, `data-compare="give|get"`): projections, percentile rank within position (`pctRank`) as diverging bars across the `H2H` rows, a weekly points chart, next six matchups by difficulty, role and risk. Multi-player deals can switch which player is compared (`data-cmp`).

## Known quirk
In "Points per week" mode the grade card shows `myLG`, which includes bench insurance. It can disagree in sign with the "Lineup change" tile (`you.lp`, starters only). Consider relabelling one of them.

## Ideas not built
- Grade Lens: sliders over `MODE_W` (win now vs playoffs vs upside). Cheap, because `parts` is linear in the weights.
- Trade Map: a scatter of all `allTrades()` candidates (your gain vs theirs).
- Their side + "Find a sweetener".
- Offseason mode: decide whether the Trades tab shows a sample deal or hides.
