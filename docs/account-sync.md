# Account sync: user data off the browser, onto the account

Status (2026-11-14): **live on main** (commit f117227). `supabase/shared.sql` has been run and the shared store is answering in production (`/api/live` returns `injLog`).

## What changed

**Per-account data** lives in `S.acct`, saved in the existing `user_state` row:
news history, alerts seen, injury statuses last seen, #1 finishes, Feed filter, stat columns, trade-ideas request, light/dark.
Old browser keys (`tm-news-v1`, `tm-news-st-v1`, `tm-news-top-v1`, `tm-news-show-v1`, `tm_stats`, `tm_trv`, `tm_want`, `tm-alerts-seen`, `hashmark-theme`) are merged in once and removed.

**Server always wins.** Opening the site loads the server copy and replaces the browser cache. Saves are checked against the version the device last saw; a device that loses the race loads the other copy and merges its own news into it. One exception, once per browser: the first run of this build keeps a local copy that was saved later than the server's.

**Still in localStorage, on purpose:** `trademetric-v1` (cache of the account copy), short-lived caches of server responses (clips feed, articles, league news, trade stories, recaps, injury statuses), sign-in session keys, and the optional ESPN private-league codes (never stored on the server).

**Shared data built on the server** (`api/_shared.js`, `supabase/shared.sql`, needs `SUPABASE_SECRET_KEY` in Vercel): injury status history (`status_log`), story recaps (`news_recaps`), 7-day league news archive (`shared_kv`).

**New accounts get 7 days:** status history from the server log (recording started 2026-11-14, so it fills in from here), last week's big plays rebuilt from the server, existing #1 catch-up.

**League re-sync:** every saved league re-reads rosters, names, records, IR and lineups on open, on week change and every 6 hours.

**Builds:** `index.html` is `no-store`; all `?v=` bumped; an open tab reloads itself when the `?v=` numbers change. Bump the numbers in `index.html` whenever css or js changes. Current (as of 2026-11-14): css 24, news 17, app 23, mobile 2, images 3.

**News taps:** the Feed / Injuries / Clips buttons are only rebuilt when they change, and a failed trade-story lookup waits two minutes instead of retrying on every repaint.

## 2026-11-15: friend's Feed stuck on 5 cards, all "12pm" (SOLVED)

Symptom: a friend's computer showed the same 5 Feed cards for days, each stamped 12:00 pm, and "projections" where the owner sees live numbers.

**Cause:** he was on the old address `trademetric-rho.vercel.app`. The redirect rule in `vercel.json` (`/:path*` with a host match) did not match the home page `/`, so the page loaded on the old address while every `/api` and `/data` request it made was redirected cross-site to www.trademetric.app and blocked by the browser. No news, no live data, no plays. The 5 cards were trades from the nightly data file, which carries dates but no times.

**Fix (commit 8971dbc):** an explicit `/` redirect for that host, plus an in-page fallback at the top of `index.html` and `privacy.html` that moves the page to www.trademetric.app. Checked live: the old address now lands on www.trademetric.app with full news and live data. The friend has to sign in once on trademetric.app (sign-in is stored per address); his leagues come back from his account.

Also shipped (commit 3ed297d):
- Failed league-news and player-story loads are recorded, retried after a minute, and shown on the page ("Some news didn't load").
- Date-only trade cards show the day, not 12:00 pm.
- **Problem reports:** each visitor's browser posts a short technical report to `/api/report` when something fails, when the Feed looks thin, or once a day: build, browser, width, time zone, league types, how much news loaded, failed requests, script errors. Saved in `client_reports` (`supabase/reports.sql`), readable only by the owner's account. No league contents, emails or passwords. Privacy page updated. **The table only exists once `supabase/reports.sql` is run; until then reports are dropped.**

Lesson: nearly everything has been tested in the owner's browser, on his account, ESPN league and trademetric.app. Other users differ in address, platform (Sleeper), account age and empty browser caches.

## How it was checked

- Local copy with stand-in data: two-device sync, conflicts, migration, new account, league re-sync, taps at 1280 and 390, failed-load notice, report sending.
- Test build with the real account and ESPN league at 1280: sign-in, save and reload against the real database, every tab, no errors.
- Live site after deploy, same account in two separate browser profiles (1280 and 390): same news history, injuries, #1 cards, alerts and settings; 30 of 33 Feed cards identical.

## Open

- Run `supabase/reports.sql`.
- Fresh-user run-through, not started: a test account, import a Sleeper league (friend's ideally) and the ESPN league, every tab at desktop and phone width.
- Three trade cards differed between the two browsers (which story about the trade was attached). Should converge within 30 minutes; worth a re-check.
- The Injuries tap failure was never reproduced on the live site with phone emulation. Needs a check on a real phone.
- The Vercel preview environment has no `SUPABASE_SECRET_KEY` or `ANTHROPIC_API_KEY`, so previews show raw headlines and no shared store.
- Optional: a scheduled job that opens `/api/live` every 30 minutes so status history keeps building when nobody has the site open. Not added.
