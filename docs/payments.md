# Payments: TradeMetric Pro through Stripe

**Status: built on the `payments` branch (on top of `pro-gating` and `emails`). Test mode only. Not live, not merged.**
The beta switch is still ON, so nobody is asked to pay.

One plan, two ways to pay: monthly or yearly, both with a 7-day free trial that needs a card up front.
The prices themselves live in Stripe. The site reads them from Stripe, so it can never show a price Stripe won't charge.

## How it works (plain words)
- **Paying** happens on Stripe's own checkout page. **Changing the card, switching monthly/yearly, cancelling and receipts**
  happen on Stripe's own billing page (the Customer Portal). Card details never touch TradeMetric.
- When something happens (trial started, paid, card declined, cancelled), Stripe tells the site through the **webhook**
  (`/api/stripe-webhook`). The site checks the message really came from Stripe, writes it down once (so a repeat does
  nothing), asks Stripe for the latest state of that subscription, and sets the account's plan.
- `profiles.plan` stays the one thing the rest of the site reads. Pro is on while the subscription is in its trial or
  paid up, through the end of a paid period after cancelling, and for **7 days after a failed payment** (a banner asks
  them to update their card). After that an hourly database job turns Pro off.
- **One free trial per account, ever.** Someone who already had one sees "Subscribe" and is charged on the day.
- Account → Subscription shows the plan, the trial end or next charge (amount and date straight from Stripe), the card's
  last 4 digits, **Manage billing** and **Cancel plan**. Cancelling is two clicks from Account: Cancel plan, then Stripe's
  confirm button. An account with a running plan has to cancel it before it can delete the account.

## Files
| File | What it does |
|---|---|
| `api/stripe-webhook.js` | The one billing server function: the webhook, plus `/api/billing/status`, `/checkout`, `/portal`, `/cron` |
| `api/_billing.js` | All the billing logic. `BILLING` at the top: trial length, grace period, reminder timing |
| `supabase/billing.sql` | The `subscriptions`, `billing_customers` and `stripe_events` tables and the "who gets Pro" rules |
| `supabase/billing_cron.sql` | The hourly check: grace periods that ran out, and the "trial ends in 2 days" email |
| `js/plan.js` | The upgrade screen, the plan card, the failed-payment banner, coming back from checkout |
| `scripts/test-billing.mjs` | Tests with a pretend Stripe and its own clock: `node scripts/test-billing.mjs` |

To make room for the billing function (the hosting plan allows 12), the problem-report route moved into `api/push.js`.
Its address, `/api/report`, is unchanged.

## Vercel environment variables
Settings → Environment Variables. Set each one separately for **Preview** (test values) and later **Production**.

| Name | Preview | Production | Where to find it in Stripe |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | test key (`sk_test_...`) | test key while testing, live key (`sk_live_...`) on go-live day | Developers → API keys → Secret key |
| `STRIPE_WEBHOOK_SECRET` | from the test webhook | from the matching webhook (test, then live) | Developers → Webhooks → your endpoint → Signing secret (`whsec_...`) |
| `STRIPE_PRICE_MONTHLY` | test monthly price id | monthly price id of the same mode | Product catalog → TradeMetric Pro → the monthly price (`price_...`) |
| `STRIPE_PRICE_YEARLY` | test yearly price id | yearly price id of the same mode | same product → the yearly price |
| `TM_BETA_PRO` | `off` (only on Preview, to test paying) | leave as it is (beta on) | — |
| `STRIPE_TEST_CLOCKS` | `1` (optional, for clock tests) | don't set | — |

Already set from earlier work, also needed: `SUPABASE_SECRET_KEY` (Preview too, for testing), `CRON_SECRET`,
`RESEND_API_KEY`, `EMAIL_LINK_SECRET`.

A preview refuses a live key on its own (billing just switches off), so a mix-up can't charge anyone from a preview.
All four Stripe values must come from the same mode (all test or all live). Redeploy after changing any of them.

## Stripe dashboard steps (test mode first)
1. **Product and prices.** Product catalog → Add product "TradeMetric Pro". Add two recurring prices in USD:
   monthly ($5) and yearly ($30 or $40, your call; the site shows whatever this price says). Don't add a trial on the
   price; the site adds the 7-day trial itself.
2. **Customer Portal.** Settings → Billing → Customer portal:
   - Allow: update payment methods, view invoice history, cancel subscriptions.
   - Cancellation: **at the end of the billing period** (not immediately).
   - Subscriptions: allow switching plans, and add both prices (monthly and yearly) of the product.
   - Business info: link your terms and privacy pages.
3. **Webhook.** Developers → Webhooks → Add endpoint:
   - Preview testing: `https://<your payments preview address>/api/stripe-webhook`. If previews are protected by Vercel's
     login, add a "Protection Bypass for Automation" secret and put it on the end of that address.
   - Production (later): `https://www.trademetric.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`,
     `invoice.upcoming`.
   - Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Renewal reminders.** Settings → Billing → Subscriptions and emails → "Upcoming renewal events": **7 days** (this is
   what times the yearly renewal email).
5. **Failed payments.** Billing → Revenue recovery → Retries: retry over **at least 1 week**, then "If all retries fail:
   cancel the subscription". The site's own 7-day grace period decides when Pro turns off.
6. **Stripe's own customer emails** (Settings → Billing → Subscriptions and emails): turn OFF Stripe's trial-ending,
   renewal and failed-payment emails, and its receipts (Settings → Emails → "Successful payments"), so people don't get
   two of each. TradeMetric sends its own.
7. **Branding.** Settings → Branding: logo and colors, so checkout looks like TradeMetric.

## Supabase steps
1. SQL Editor → run `supabase/billing.sql` (after `plans.sql` and `emails.sql`). Safe to run again.
2. Once payments are live on main: run `supabase/billing_cron.sql` (the hourly check). For testing on the preview,
   the same check can be run by hand: `GET /api/billing/cron` with the CRON_SECRET (`?dry=1` shows without sending).

## Testing (test mode)
- Automated, no keys: `node scripts/test-billing.mjs` covers every case below with a pretend Stripe (60 checks).
- Real Stripe test mode on the preview, with the keys added and `TM_BETA_PRO=off` on Preview:
  - [ ] Start a trial monthly, and on another account yearly (card `4242 4242 4242 4242`): Pro turns on at once
  - [ ] Test clock past the trial (Billing → Subscriptions → the customer → "Run simulation" / test clock): charged, still Pro, receipt email
  - [ ] Cancel during the trial: Pro until trial end, then off, no charge
  - [ ] Cancel after paying: Pro until the period ends
  - [ ] Card `4000 0000 0000 0341` (attaches, then declines): at trial end the banner shows, payment-failed email, Pro off after 7 days
  - [ ] Switch monthly to yearly in the portal
  - [ ] Developers → Events → an event → "Resend": nothing doubles
  - [ ] Second trial on the same account: the button says "Subscribe" and checkout shows no trial

  For the clock tests, also set `STRIPE_TEST_CLOCKS=1` on **Preview** before the account's first checkout: each new
  test customer then gets its own Stripe test clock (Billing → Test clocks), and "Advance time" there moves that
  customer past the trial, a renewal or a decline. Test mode only; ignored with live keys.

## Switching to live (you do this; I haven't)
1. Run the whole test list above on the preview in test mode and make sure every box is ticked.
2. Merge `payments` into main (after `pro-gating` and `emails`). Run `supabase/billing.sql` (again is fine) and
   `supabase/billing_cron.sql`.
3. In Stripe, switch to **live mode** and repeat dashboard steps 1–7 there (live has its own products, prices, portal
   settings, webhook and branding). The live webhook points at `https://www.trademetric.app/api/stripe-webhook`.
4. In Vercel **Production** only: set `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (the live webhook's),
   `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` (live price ids). Keep Preview on test values. Redeploy.
5. In Supabase, remove the test rows so test subscriptions can't keep anyone on Pro:
   `delete from subscriptions where not livemode; delete from billing_customers where not livemode; select public.billing_refresh();`
6. Make sure `EMAIL_LIVE=1` is set in Production (otherwise billing emails only go to your own inbox).
7. Make sure the refunds and cancellation wording is on the terms/privacy page.
8. Do one real purchase with your own card, check the receipt, then refund and cancel it in Stripe.
9. Only then, when you choose to: turn the beta switch off (`TM_BETA_PRO=off` in Production).

## Not decided yet
- **Beta users' deal.** Every account from the beta is marked (`beta_users`). Nothing special is built for them yet;
  waiting on the owner's decision.
- **Refunds and cancellation wording** for the terms/privacy page: drafted, waiting for the owner's OK (not on the site yet).
- **The PostHog `price-test` flag** no longer changes prices once Stripe is connected (the prices come from Stripe).
  Running that test later needs a second pair of Stripe prices.
