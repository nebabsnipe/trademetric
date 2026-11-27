# Plans: free and Pro

**Status: on the `pro-gating` branch. The beta switch is ON**, so every signed-in account has Pro and the site works exactly as before.

## The beta switch
- One setting in Vercel: **`TM_BETA_PRO`** (Settings → Environment Variables).
  - Not set (today), or any value except `off`: beta ON. Every signed-in account has Pro.
  - `off`: beta OVER. Only accounts with `profiles.plan = 'pro'` have Pro.
- After changing it, redeploy (Deployments → ⋯ → Redeploy). The page never decides on its own; it asks `/api/plan`.
- Code: `api/_plan.js` (server) and `js/plan.js` (page, `tmIsPro()`).

## Who sees what once the switch is off
| | Signed out | Free account | Pro |
|---|---|---|---|
| Rankings | Yes | Yes | Yes |
| News: top stories (league-wide) | Yes | Yes | Yes |
| News: following your players, injuries, clips | Sign in | Upgrade screen | Yes |
| My Team, Trades, Season Sim, League, waivers, trade values | Sign in | Upgrade screen | Yes |
| AI Helper, alerts bell, big-play banners, push | No | Upgrade screen / hidden | Yes |
| Player-card news | No | "Part of Pro" line | Yes |
| Account (plan, leagues, security) | — | Yes | Yes |
| Mock drafts: create a room or draft solo | Sign in | Upgrade screen | Yes |
| Mock drafts: join a friend's room by invite link (or code) | Sign in, then lands in the lobby | Yes | Yes |
| Season recap, League Fit | Locked page | Upgrade screen | Yes |

## Server routes
| Route | Free or Pro |
|---|---|
| `/api/plan` | Free (answers what this person gets) |
| `/api/live`, `/api/proj`, `/api/market`, `/api/players` | Free (same public data for everyone; rankings need it) |
| `/api/espn` | Free (copies the user's own private ESPN league in) |
| `/api/report` | Free (problem reports; now answered by `api/push.js`) |
| `/api/stripe-webhook` | Stripe only (signature checked) |
| `/api/billing/status`, `/checkout`, `/portal` | Signed in (any plan). Checkout is refused while the beta is on |
| `/api/billing/cron` | Server job (CRON_SECRET) |
| `/api/news?league=` / `?trades=` / `?recap=` / `?probe=` | Free (top stories) |
| `/api/news?feed=` / `?batch=` / `?name=` | **Pro** (news about your own players) |
| `/api/feed` (clips) | **Pro** |
| `/api/plays` (big plays) | **Pro** |
| `/api/ai` POST | **Pro** (GET only says whether AI is set up) |
| `/api/push/subscribe`, `/api/push/test` | **Pro** |
| `/api/push/devices`, `/unsubscribe`, `/key` | Signed in / free (so anyone can always turn notifications off) |
| `/api/push/cron` | Server job; only sends to Pro accounts |
| `/api/news?off=` (offseason feed) | Free |
| `/api/draft` create (solo or friends room) | **Pro** |
| `/api/draft` join, quick join, picks and the rest | Signed in (free accounts can join rooms) |
| `/api/take` (TradeMetric takes, outlooks) | **Pro** |
| `/api/recap` | **Pro** (and only your own league) |

The offseason routes (`draft`, `take`, `recap`, `news?off=`) live on the `offseason-mode` work (`pro-gating-offseason` branch). There `/api/plan` is served by `/api/market` to stay inside Vercel's limit of 12 server functions; on main it is served by `/api/push`.

Refusals: signed out → 401 `signed_out`; free → 403 `pro_required`. During the beta every route answers exactly as before (same caching).

## Grandfathering
- `supabase/plans.sql` adds `beta_users` (one row per account that existed during the beta) and marks every current account. While the beta is on, the server also marks each account when it opens the site (needs `SUPABASE_SECRET_KEY`, so production only). Run the file once more on the day the switch goes off.

## Prices
- Payments are built (`payments` branch, see `docs/payments.md`). The amounts shown come from Stripe itself (the two
  price ids in Vercel), with a 7-day free trial. `TM_PRICES` in `js/plan.js` is only the fallback for the beta pricing
  grid before Stripe is connected.
- PostHog feature flag `price-test` (off): only changes the fallback numbers. Once Stripe is connected, running a price
  test needs a second pair of Stripe prices.

## Analytics
`upgrade_screen_shown` (feature, price_variant), `upgrade_button_clicked`, `locked_tab_clicked`. Person properties `plan` (`beta` / `free` / `pro`) and `beta_user`.
