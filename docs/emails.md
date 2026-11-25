# Emails

Status (2026-11-25): **LIVE on main.** `EMAIL_LIVE` is on in Production, so emails go to real recipients. Previews are never live. The one-time announcement went to the 4 real accounts the same day. **The daily check is not scheduled yet** (`supabase/emails_cron.sql` has not been run), so no update emails go out until it is; the owner is choosing the start date. The two `tmtest_*` accounts' addresses are on the block list (`reason = invalid`).
the owner's own inbox with the intended person shown in the subject.

**2026-11-25 change (owner):** the first plan emailed almost nothing. The owner widened it the same day to a set of
update emails, each with its own switch. Still: one email per kind at a time, never repeated, and every fact
checked against the league's own data.

## The full list (nothing else gets emailed)

**Account emails** (always sent, no switch), from `support@`:

| Email | When |
| --- | --- |
| Welcome | Once, right after a new account's first sign-in (accounts under 14 days old) |
| Confirm email, reset password | Sent by Supabase Auth through Resend (`supabase/email/`) |
| League stopped updating | A saved league can't be read for 48 hours in a row. Once per league per breakage |

**One-time announcement** (`announce`, sent once ever, key `announce:2026-11`): goes to every account with a confirmed
address, saying the update emails are starting and offering a one-click "turn off all update emails". Whoever does
nothing keeps getting them. Run by hand with `/api/email/announce` (needs the CRON_SECRET; `?dry=1` shows who it
would reach). Until `EMAIL_LIVE` is on it only ever goes to the owner's account.

**Update emails** (each has a switch in Account → Leagues → Email, and a one-click unsubscribe), from `updates@`:

| Group | Switch | Default | When | Limit |
| --- | --- | --- | --- | --- |
| Every week | Matchup results · Standout games · #1 at his position · Highlights | On | **One** weekly recap email, 6+ hours after the week's last game (Tuesday). Each switch is a section of it; nothing in the switched-on sections = no email | One per week |
| As it happens | Injuries | **Off** | A morning email when a player on your team was ruled out or put on IR since yesterday (confirmed, same rules as push) | One a day |
| | Trade deadline | On | When a league's deadline is within 3 days. Once per league | One a day |
| | Clinched a playoff spot | On | Mathematically locked, confirmed on two checks a day apart | One big moment a day |
| | Won the championship | On | Title game final and the league says they won, confirmed twice | One big moment a day |
| Offseason | Season recap is ready | On | **Built, switched off** until the recap feature is live | One big moment a day |
| | Player moves | On | Feb–Aug: a player from your team is listed on a new NFL team on two daily checks | About one a week |
| | Draft season reminder | On | Once in August, only to accounts unused for 30+ days | One big moment a day |

**Never emailed:** lineup alerts, live big plays, news or rumors, unverified trades.
**Billing** (trial ending, receipt, payment failed, renewal, cancelled): the templates exist
(`api/_email_templates.js`, samples in `supabase/email/billing/`) but nothing sends them. They belong to the payments work.

### What goes in the weekly recap (`api/_weekly.js`)
- **Matchup:** the league's own final score and your record. A two-week playoff round is reported after its second week.
- **Standout games:** 28+ points, or 2.2x his projection and at least 12 (the site's big-game rule). Up to 3, bench included (marked). Not for kickers or defenses.
- **#1 at his position:** only when the whole position's scores for the week could be read **and** agree with the
  league's own number for your player. Otherwise the section is left out. Ties say "co-#1".
- **Highlights:** the league's official game clips that are tagged with your players. Up to 3. Links only, no images.

## The pieces

| File | What it is |
| --- | --- |
| `api/_email.js` | **The one helper every email goes through** (`sendEmail`): switches, no repeats, one a day, the safety switch, the block list |
| `api/_email_templates.js` | Every email's wording and the one shared design (light and dark, phone, plain-text version, no images) |
| `api/_league_check.js` | Decides "clinched" and "champion" from the league's own results, standings and bracket, with reasons |
| `api/_weekly.js` | The weekly recap's facts, injuries, trade deadlines and offseason player moves |
| `api/email.js` | One server function: `/api/email/welcome`, `/unsub`, `/hook`, `/cron`, `/test` (function 12 of the plan's 12) |
| `js/email.js` | The Email card in Account -> Leagues, and asking for the welcome email after a first sign-in |
| `supabase/emails.sql` | `email_sent`, `email_prefs`, `email_block`, `email_watch` |
| `supabase/emails_cron.sql` | The once-a-day schedule. **Not run yet** |
| `supabase/email/` | The Supabase sign-in emails and billing samples. Rebuilt by `node scripts/build-emails.mjs` |
| `scripts/test-email.mjs` | Checks every rule with the outside services faked. `node scripts/test-email.mjs` |

## Rules every email follows (`api/_email.js`)

- **Never twice.** `(user, type, key)` is written to `email_sent` before sending and the database refuses a second
  copy, even if two checks overlap. The key names the event, e.g. league + season.
- **Limits per group.** Big moments: one a day (championship > clinch > recap > draft reminder; the other is dropped
  for good). Weekly recap: one a week. Injuries: one a day. Trade deadline: one a day. Player moves: about one a week.
- **Switches.** Account -> Leagues -> Email: eleven small switches in three groups, all on by default except
  injuries, saved on the account (`email_prefs`). A switched-off kind is never sent.
- **Unsubscribe.** Every big-moment email has a signed link (works signed out) and the `List-Unsubscribe` headers.
  The link turns off that kind and offers "turn off all" and "turn back on". Opening the page alone changes
  nothing until the page itself confirms (mail scanners open links).
- **Bounces and complaints.** Resend reports them to `/api/email/hook`; the address goes in `email_block` and is
  never emailed again.
- **Safety switch.** Unless `EMAIL_LIVE` is `1` **and** it's the real site, every email goes only to the owner's
  address, with `[TEST, for someone@...]` at the start of the subject. Preview deployments are never live.
  Test sends are recorded apart from real ones, so testing never uses up a real send.
- **From and reply addresses.** The name shown is always TradeMetric. Account emails (welcome, league stopped
  updating, and the Supabase sign-in codes) come from `support@trademetric.app` and replies go to `support@`. Big
  moments come from `updates@trademetric.app` and replies also go to `support@`. Override with
  `EMAIL_FROM_ACCOUNT`, `EMAIL_FROM_UPDATES`, `EMAIL_REPLY_TO`. **`support@` has to be an inbox someone reads
  before `EMAIL_LIVE` is switched on** (trademetric.app can't receive mail in Resend today).
- **Failed sends** are reported to Sentry and leave no record, so the next check tries again.
- **Nothing sends if anything is missing** (database, key, link secret): it fails closed.

## How "clinched" and "champion" are decided (`api/_league_check.js`)

Read from the league's own platform on the server. Never a projection or a win chance.

- **Clinched:** the regular season is over and the team is in the winners' bracket; or games remain, but even if
  every team that could still tie or pass it won out, and every other division's winner took a spot, a spot is
  still left. Ties in the standings count against the team (tiebreakers can't be known ahead of time), so it can say
  "not yet" a week after the league's own site shows a clinch. It never says yes early.
- **Champion:** the one winners'-bracket game in the last round is final, the league lists this team as the
  winner, and the final ranking (where the league gives one) agrees.
- If the results and the standings disagree (scores still settling), nothing is concluded.
- Both have to hold on **two daily checks at least 20 hours apart** before an email goes out. If the second check
  disagrees, it's forgotten.
- Not sent as old news: a clinch once the playoffs are being played, or anything outside the season's dates.
- **Private ESPN leagues are skipped** (their login codes stay in the person's browser), for these two emails and
  for "league stopped updating".

## One-time setup

1. **Supabase -> SQL Editor:** run `supabase/emails.sql`.
2. **Vercel -> Settings -> Environment Variables**, Production and Preview:
   `RESEND_API_KEY`, `EMAIL_LINK_SECRET` (a long random value; signs unsubscribe links, so don't change it later),
   `RESEND_WEBHOOK_SECRET` (from step 3). Optional: `EMAIL_POSTAL` (a mailing address shown in the footer). Already there: `SUPABASE_SECRET_KEY`, `CRON_SECRET`.
3. **Resend -> Webhooks -> Add:** endpoint `https://www.trademetric.app/api/email/hook`, events `email.bounced`
   and `email.complained`. Copy its signing secret into `RESEND_WEBHOOK_SECRET`.
4. **Supabase Auth emails:** Authentication -> Emails. SMTP is already Resend (host `smtp.resend.com`, port `465`,
   username `resend`, password = a Resend API key, sender name `TradeMetric`, sender address `support@trademetric.app`). Paste `supabase/email/confirm-signup.html`
   into *Confirm signup* and `reset-password.html` into *Reset password*; the subject line is in the comment at the
   top of each file.
5. **Schedule:** after merging, run `supabase/emails_cron.sql` (once a day, same password as the push schedule).
6. **Make `support@trademetric.app` a real inbox** that someone reads (e.g. forwarding at the domain host, or Resend receiving).
7. **Go live:** set `EMAIL_LIVE` to `1` in Production only, and redeploy.

## Trying it by hand

`/api/email/test?what=...` with the `CRON_SECRET` (or, on a preview only, `EMAIL_TEST_KEY`). Everything goes to
the owner's account through the same `sendEmail()`:
`status` · `send&type=clinch&key=abc` · `biggest&types=clinch,champ` · `check&league=espn:123` ·
`weekly&week=12` (the owner's real weekly recap for that week, sends nothing) · `cron&dry=1` · `unsub&type=clinch` ·
`click&type=clinch` · `reset`. The daily check itself: `/api/email/cron?dry=1`.
