# Push notifications

Status (2026-11-23): **built on the `push-notifications` branch, not live.** The foundation is in and one real
notification type works end to end in code: injuries / status changes. The other types have switches but send
nothing yet. Still to do by hand before it works anywhere: the Vercel keys, `supabase/push.sql`, and choosing
the schedule (below).

Real notifications on the lock screen or desktop, even with the site closed. Standard Web Push, sent straight
to each browser's own push service. No third-party push company.

## The pieces

| File | What it is |
| --- | --- |
| `manifest.webmanifest`, `icon-192.png`, `icon-maskable-512.png`, `badge-96.png` | Lets the site be added to a phone's Home Screen as an app (required for iPhone notifications) |
| `sw.js` | The service worker. Push only: it shows the notification and handles the tap. It has no fetch handler and no cache, so it can't serve an old build |
| `js/push.js` | The "Push notifications" card in Account -> Leagues, and turning a device on or off |
| `api/push.js` | One server function for everything: `/api/push/key`, `/devices`, `/subscribe`, `/unsubscribe`, `/test`, `/cron` (one file because the hosting plan allows 12 functions and this is number 11) |
| `api/_push.js` | The send helper (`sendToDevices`) and every rule: confirmation, wording, quiet hours, the hourly limit, the Pro check (`canPush`) |
| `supabase/push.sql` | `push_subscriptions` (one row per device, tied to the account) and `push_sent` (what was sent, so nothing repeats) |
| `supabase/push_cron.sql` | The proposed 15-minute schedule. Not run yet |
| `scripts/test-push.mjs` | Checks the rules. `node scripts/test-push.mjs` |

## One-time setup

1. **Vercel -> Settings -> Environment Variables**, for **Production and Preview**:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` address or the site address),
   `CRON_SECRET` (a long random value). The scheduled check also needs `SUPABASE_SECRET_KEY`, which Preview
   doesn't have today. The keys are never committed. Changing the VAPID keys later signs every device out of
   notifications, so keep them.
2. **Supabase -> SQL Editor:** run `supabase/push.sql`.
3. **Schedule:** see "The schedule" below.

Until 1 and 2 are done the card says notifications aren't available yet and everything else works as before.

## Rules every notification follows (`api/_push.js`)

- **Confirmed, never a single data point.** An injury change is only sent when the user's own feed still says
  it right now AND either the second feed also lists the player as hurt, or it has stayed that way for 10+
  minutes (two separate reads agree). A blip the feed corrects is never sent. If the user's feed fails to
  load, nothing is sent.
- **One consistent source.** Same rule as the site: all leagues on one platform -> that platform's report,
  otherwise the default one. The other report is only used as the second opinion above.
- **No repeats.** Each event has a key (player + new status + half-day). It's written to `push_sent` before
  sending and the database refuses a second copy, even if two checks overlap.
- **Quiet hours.** No injury (or, later, lineup) pushes 11pm-8am in the time zone of the user's most recently
  used device. They're held and sent after 8am if still true and under 12 hours old.
- **Rate limit.** At most 4 separate notifications per user per hour; extras go out as one summary; after
  that, anything else waits for the next check.
- **One tag per player**, so "questionable" then "out" replaces the first notification instead of stacking.
- **Pro later.** `canPush()` returns true for everyone during the beta. It's the only place to change.
- Leagues set to "News tab only" in Account send no pushes. The Injuries switch is `S.acct.push.off`
  (saved on the account, so it applies to every device).
- Signing out removes that device. If someone else signs in on the same browser, the device moves to them.

## The schedule

The injury check has to run with nobody on the site. The Vercel plan is **Hobby**, which allows a scheduled job
only **once a day** (and a more frequent one fails the deploy), so `vercel.json` has no cron entry.
Options, simplest first:

1. **Supabase's built-in scheduler (recommended).** `supabase/push_cron.sql` calls `/api/push/cron` every 15
   minutes with the secret. Reliable to the minute, free, one paste in the SQL Editor, nothing new to sign up
   for.
2. **GitHub Actions schedule.** Already used for the daily data update, but scheduled runs are often 10-30+
   minutes late and sometimes skipped at busy times, which is poor for injury news.
3. **Vercel Pro** ($20/month): cron down to once a minute, configured in `vercel.json`.

The endpoint is the same for all three: `GET /api/push/cron` with `Authorization: Bearer <CRON_SECRET>`.
Add `?dry=1` to see what it would send without sending.

Side benefit: the check also records status changes in `status_log` (the same history the News tab reads), so
the history no longer depends on someone having the site open.

## Not done yet

- Big plays, trades, lineup alerts and #1 finishes: the switches exist (marked "Coming soon") but nothing
  sends them. Trades must go through the same verification as trade alerts before any push.
- Tested so far: the rules (script), the server route's access checks, a real encrypted send to a push service
  (dead address -> device removed), and the card in every state at desktop and phone widths, light and dark.
  **Not yet tested on real devices** (needs the setup above): Chrome on Mac/Windows, Safari on Mac, iPhone
  from the Home Screen.
