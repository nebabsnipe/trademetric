# Plans: free and Pro (no payments yet)

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
| Mock drafts, season recap | Not on main yet (offseason-mode branch) |

## Server routes
| Route | Free or Pro |
|---|---|
| `/api/plan` | Free (answers what this person gets) |
| `/api/live`, `/api/proj`, `/api/market`, `/api/players` | Free (same public data for everyone; rankings need it) |
| `/api/espn` | Free (copies the user's own private ESPN league in) |
| `/api/report` | Free (problem reports) |
| `/api/news?league=` / `?trades=` / `?recap=` / `?probe=` | Free (top stories) |
| `/api/news?feed=` / `?batch=` / `?name=` | **Pro** (news about your own players) |
| `/api/feed` (clips) | **Pro** |
| `/api/plays` (big plays) | **Pro** |
| `/api/ai` POST | **Pro** (GET only says whether AI is set up) |
| `/api/push/subscribe`, `/api/push/test` | **Pro** |
| `/api/push/devices`, `/unsubscribe`, `/key` | Signed in / free (so anyone can always turn notifications off) |
| `/api/push/cron` | Server job; only sends to Pro accounts |

Refusals: signed out → 401 `signed_out`; free → 403 `pro_required`. During the beta every route answers exactly as before (same caching).

## Grandfathering
- `supabase/plans.sql` adds `beta_users` (one row per account that existed during the beta) and marks every current account. While the beta is on, the server also marks each account when it opens the site (needs `SUPABASE_SECRET_KEY`, so production only). Run the file once more on the day the switch goes off.

## Prices
- `TM_PRICES` in `js/plan.js`: $5 a month, $30 a year, 7-day free trial. The button says "Coming soon".
- PostHog feature flag `price-test` (off): variant `higher` shows the second price set; anything else, or no flag, shows $5 / $30.

## Analytics
`upgrade_screen_shown` (feature, price_variant), `upgrade_button_clicked`, `locked_tab_clicked`. Person properties `plan` (`beta` / `free` / `pro`) and `beta_user`.
