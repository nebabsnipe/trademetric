# Emails

Status (2026-11-25): **built on the `emails` branch, not live.** `EMAIL_LIVE` is off, so every email goes only to
the owner's own inbox with the intended person shown in the subject.

TradeMetric sends very few emails: account stuff and a handful of really big moments. Everything else is an
in-site alert or a phone push. **If in doubt, don't email.**

## The full list (nothing else gets emailed)

| Email | When | Can be switched off |
| --- | --- | --- |
| Welcome | Once, right after a new account's first sign-in | No |
| Confirm email, reset password | Sent by Supabase Auth through Resend (`supabase/email/`) | No |
| League stopped updating | A saved league can't be read for 48 hours in a row. Once per league per breakage | No |
| Clinched a playoff spot | Mathematically locked, confirmed on two checks a day apart | Yes |
| Won the championship | Title game final and the league says they won, confirmed on two checks a day apart | Yes |
| Season recap is ready | **Built, switched off** (`on: false` in `TYPES`, `api/_email.js`) until the recap is live | Yes |
| Draft season reminder | Once in August (from the 10th), only to accounts unused for 30+ days | Yes |

**Never emailed:** lineup alerts, injuries, big plays, trades, weekly wins or losses, news.
**Billing** (trial ending, receipt, payment failed, renewal, cancelled): the templates exist
(`api/_email_templates.js`, samples in `supabase/email/billing/`) but nothing sends them. They belong to the payments work.

## The pieces

| File | What it is |
| --- | --- |
| `api/_email.js` | **The one helper every email goes through** (`sendEmail`): switches, no repeats, one a day, the safety switch, the block list |
| `api/_email_templates.js` | Every email's wording and the one shared design (light and dark, phone, plain-text version, no images) |
| `api/_league_check.js` | Decides "clinched" and "champion" from the league's own results, standings and bracket, with reasons |
| `api/email.js` | One server function: `/api/email/welcome`, `/unsub`, `/hook`, `/cron`, `/test` (function 12 of the plan's 12) |
| `js/email.js` | The Email card in Account -> Leagues, and asking for the welcome email after a first sign-in |
| `supabase/emails.sql` | `email_sent`, `email_prefs`, `email_block`, `email_watch` |
| `supabase/emails_cron.sql` | The once-a-day schedule. **Not run yet** |
| `supabase/email/` | The Supabase sign-in emails and billing samples. Rebuilt by `node scripts/build-emails.mjs` |
| `scripts/test-email.mjs` | Checks every rule with the outside services faked. `node scripts/test-email.mjs` |

## Rules every email follows (`api/_email.js`)

- **Never twice.** `(user, type, key)` is written to `email_sent` before sending and the database refuses a second
  copy, even if two checks overlap. The key names the event, e.g. league + season.
- **One big moment a day per person.** If two are due, the bigger one goes (championship > clinch > recap > draft
  reminder) and the other is dropped for good.
- **Switches.** Account -> Leagues -> Email: one small switch per big moment, all on by default, saved on the
  account (`email_prefs`). A switched-off kind is never sent.
- **Unsubscribe.** Every big-moment email has a signed link (works signed out) and the `List-Unsubscribe` headers.
  The link turns off that kind and offers "turn off all" and "turn back on". Opening the page alone changes
  nothing until the page itself confirms (mail scanners open links).
- **Bounces and complaints.** Resend reports them to `/api/email/hook`; the address goes in `email_block` and is
  never emailed again.
- **Safety switch.** Unless `EMAIL_LIVE` is `1` **and** it's the real site, every email goes only to the owner's
  address, with `[TEST, for someone@...]` at the start of the subject. Preview deployments are never live.
  Test sends are recorded apart from real ones, so testing never uses up a real send.
- **From address.** Test sends use `noreply@trademetric.app`. Live sending refuses to start until `EMAIL_FROM` is
  set on purpose.
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
   `RESEND_WEBHOOK_SECRET` (from step 3). Before going live also `EMAIL_FROM` and `EMAIL_REPLY_TO`.
   Optional: `EMAIL_POSTAL` (a mailing address shown in the footer). Already there: `SUPABASE_SECRET_KEY`, `CRON_SECRET`.
3. **Resend -> Webhooks -> Add:** endpoint `https://www.trademetric.app/api/email/hook`, events `email.bounced`
   and `email.complained`. Copy its signing secret into `RESEND_WEBHOOK_SECRET`.
4. **Supabase Auth emails:** Authentication -> Emails. SMTP is already Resend (host `smtp.resend.com`, port `465`,
   username `resend`, password = a Resend API key, sender name `TradeMetric`). Paste `supabase/email/confirm-signup.html`
   into *Confirm signup* and `reset-password.html` into *Reset password*; the subject line is in the comment at the
   top of each file.
5. **Schedule:** after merging, run `supabase/emails_cron.sql` (once a day, same password as the push schedule).
6. **Go live:** set `EMAIL_LIVE` to `1` in Production only, and redeploy.

## Trying it by hand

`/api/email/test?what=...` with the `CRON_SECRET` (or, on a preview only, `EMAIL_TEST_KEY`). Everything goes to
the owner's account through the same `sendEmail()`:
`status` · `send&type=clinch&key=abc` · `biggest&types=clinch,champ` · `check&league=espn:123` ·
`cron&dry=1` · `unsub&type=clinch` · `reset`. The daily check itself: `/api/email/cron?dry=1`.
