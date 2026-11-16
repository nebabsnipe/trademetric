# Feature notes (running list)

Notes taken 2026-11-09. Build only when the owner says to.

## Planned (not started)

### Google Search setup (added 2026-11-14)
Configure Google Search for www.trademetric.app so the site shows up properly in Google.
- Set up Google Search Console and verify the domain (DNS TXT record at GoDaddy).
- Add a `sitemap.xml` and `robots.txt`, and submit the sitemap in Search Console.
- Check page titles, meta descriptions and share previews (Open Graph) on the public pages, especially the free rankings page.
- Keep paid/signed-in pages out of the index; let rankings be indexed.
- Request indexing once it's live and watch the coverage report for errors.

## 1. Big-play banners + News tab

**Status: LIVE. Merged to main 2026-11-09 (merge commit e6bb756), deploys to www.trademetric.app.** The `news-tab` branch is pushed too (b55d59f).
- Merge note: main had moved on (roster picker + IR). The only conflict was css/styles.css, where both sides added a block at the same spot (IR styles and News styles). Both were kept. Cache-busters: app.js?v=5, news.js?v=2, styles.css?v=5. After the merge, My Team, Trades, Players, Hub, Season and News all rendered with no console errors.
- **Matchup strip:** it is hidden for the sample league (`tmnNowHtml` skips key `sample` / `S.example`). It only shows real imported leagues' matchups. The owner thought the sample score was a placeholder, so it should never show demo data.

### Refresh round (owner asked: refresh the whole tab, better and less repetitive headings, clips attached to their play, remove Final lines)
- **Final lines removed:** the `Finals` filter and the Final lines card (`tmnFinalsCard`) are gone. Filters are now `All · Big plays · Injuries · Clips`, each with a count. Matchup results stay as cards in a "Results" section under All, with headlines written from the margin (Survived / Blowout / Heartbreaker…).
- **Layout:** header with a Live pill and a one-line summary ("6 big plays · 1 injury to watch · 3 with video"). The Now strip has two rows (your team, their team) and a win-% bar, and clicking a tile filters to that league. The feed is split into sections (Big plays, Injuries, Results, Trade and waiver signals) in mood order. Big plays are a **timeline**: day headers, the real time of the play plus the quarter and clock on the left rail, and a colored dot per type.
- **Headlines:** `TMN_COPY` in js/news.js, 4–8 templates per type. They are filled with real details: `{p}` / `{last}` (name), `{y}` (yards), `{nick}` (NFL opponent, e.g. Ravens), `{qtxt}` (in the 3rd), `{pts}`, `{wp}` / `{wp0}`, `{opp}` / `{team}` (fantasy teams), `{x}` / `{pr}` (vs projection). An `r|` or `c|` prefix makes a template runs-only or catches-only. A template is skipped if this play lacks a detail it needs. `tmnHead` rotates through every template for a type before any repeats (`TMN.used`, saved in localStorage). Labels: Long touchdown, Second TD, Hat trick, Breakaway, Big run, Deep ball, Going off, Lead change, Opponent hurt, Against you.
- **Clips attached to the play:** `tmnClipMap()`. Each clip goes to at most one play, and only if it is the same player in the same game (ESPN clips carry the game id; `api/live.js` now adds `id` to each game). The title's yardage must match within 1 yard. With no yardage in the title, the clip still matches if it names the TD ("second TD") or if he had only one big play that game. TD versus non-TD and run versus catch wording are checked, and the clip must be posted after the play. A matched clip shows on the card as "Watch the play" and opens the viewer. The Clips filter shows every clip, with matched ones outlined and linked back to their play.
- **Tested:** Playwright, all `/api` mocked, sample league, 5 plays + 1 big game, 4 clips. The right clips attached; a "12-yard run" clip was correctly NOT attached to a 31-yd run. Headlines rotate. No console errors in light/dark at 1280 and 390.

### What was built (round 1)
- **Files:** `js/news.js` (engine, banners, News tab, settings; loaded before app.js), `api/plays.js` (ESPN play-by-play), small hooks in `js/app.js` (tab, live poll, bell, Account → Leagues), `index.html` (News nav button, view, FAQ entry "News tab and big-play banners"), styles in the "News tab and big-play banners" block of `css/styles.css`.
- **Thresholds** live in `TMN_R` at the top of `js/news.js`.
- **`/api/plays`** reads ESPN's scoreboard + game summary for every game that has kicked off, keeps TDs and 20+ yd runs/catches, parses names from both text styles, drops penalty no-plays. Cached 1 min live. **Not yet verified against live ESPN.** If it returns `ok:false`, the page falls back to comparing stat totals between 2-minute checks.
- **Banners:** arrive big (8s hold, timer bar), shrink into a corner chip that lasts 5 minutes; tap either → News. Clincher holds 20s, gold, stamped. One banner per 90s. Bell counts unseen News events.
- **First load is silent:** whatever already happened when the page opens goes into the feed without popping banners.
- **Settings:** Account → Leagues → Notifications: a banner switch per league + "Your opponents' big plays" (off by default). Saved in `S.notif`.

### Differences from the spec (decide if any should change)
- **Not built (no live data source):** 25+ yd catch with 20+ YAC, and bench player hitting 70%+ snaps.
- **2.2× projection rule also requires 12+ pts.**
- **Banners fire only when he's in your starting lineup** in a league with banners on. Bench plays still go into the feed, tagged "bench".
- **QB passing TDs don't count as "his" TD** — the receiver gets the banner.
- **Crunch swing** uses the projected final margin flipping from ≤0 to >0 with ≤30 projected pts left; max one per league per 10 min.
- **Clincher hard check:** lead > (sum over their unfinished starters of max(3× remaining projection, 8× fraction of game left)) + 2, and win % ≥ 99%.
- **Opponent ruled out mid-game** uses Sleeper's status flipping to Out/IR during his game (best effort).
- **Other leagues' win %** use that league's scoring and real lineups/schedule when the import has them. A league with no imported schedule shows no matchup.

### Still open
1. Verify `/api/plays` against a real Sunday (`/api/plays?week=N` during games), and check how often real clip titles carry yardage.
2. Web push / mobile app for phone alerts when the site is closed.

---

### Banner trigger rules (spec)
- **Rushes:** 30+ yards; 50+ automatic.
- **Receptions:** 40+ yards; 25+ with 20+ YAC (*not built*).
- **Touchdowns:** 1st TD only if 20+ yards or worth 12+ pts; 2nd always; 3rd+ always, escalating copy.
- **Big game:** 28+ pts, or 2.2× pregame projection.
- **Clincher:** WP 99%+ and nothing left on their side can catch you; once per matchup.
- **Crunch swing:** losing or tied, late in the final game, your player scores and you flip to winning.
- **Opponent / roster impact:** opponent's starting RB or WR out mid-game; bench player at 70%+ snaps (*not built*).

### News tab scope — GLOBAL across all leagues
- Every item carries a league chip; `All leagues ▾` dropdown; Now strip = your real matchups; banner on/off per league in Account → Leagues.

### News tab moods
- **Gameday (live):** big plays first. **Day-after:** results first. **Midweek:** injuries, waiver and trade signals first.

## Motion polish ported from 21st.dev (added 2026-11-16)
All of it lives in `js/polish.js` (loaded last, never changes app.js logic) with styles at the end of `css/styles.css`. Everything respects the "reduce motion" setting.
- **Round 1:** sliding highlight under segmented controls and the Trade builder / Trade ideas tabs; table rows glide to their new spot on re-sort; key numbers roll to their new value; shimmer loaders; weekly points chart in the player card; alerts grouped by day. Animated theme switch (circle reveal from the sun/moon button, phone menu too) is in app.js.
- **Round 2:** alerts popup items and News cards arrive one after another (Magic UI "Animated List", only when the popup opens or the tab is first shown, not on every refresh); the Live dot ripples (iconiq "Status Dot"); confetti bursts out of a "clinched" banner (Magic UI "Confetti", own small canvas, no library); the toast gets a green check or amber "!" icon and slides up (cnippet "Toast").
- Not used: the Colorful-Pricing section (owner decided to keep the current pricing grid). A win-chance ring on the matchup (Magic UI "Animated Circular Progress Bar") shipped briefly and was removed the same day at the owner's request.

## Scoreboard restyle test (added 2026-11-16, `theme-refresh` branch only, not on main)
Owner tried a quieter red "Terrel" palette first and turned it down: the site should stay as aggressive as it is, and stay orange. This version keeps the original orange colors and pushes the bold look further.
- **My Team tiles:** big slanted numbers; the projection tile is a solid orange block with a change badge (this week vs. league average) and a line of projected points for this week and the next four; playoff odds gets a thick meter; weakest spot shows its gap as a solid badge.
- **Matchup:** orange top edge, bigger scores, win chance in a slanted orange block, thick slanted score bar. Peek / "see all positions" unchanged.
- **Season Sim:** bigger dial and headline, stats as solid black blocks (white in dark mode), thick bars, your row with an orange edge.
- **Trade week chart:** wide bars, bold slanted labels, thick zero line, playoffs as an orange band.
- References from 21st.dev: progress-metric-card (matchup), analytics-bento (Season Sim), advanced-stats (chart). dashboard-02 and efferd dashboard-2 could not be found there.
