# Accounts rework — sign-in and account area

**Status: live on www.trademetric.app (2026-11-09).** Supabase setup is done. Google and Discord sign-in are live; Apple is not set up. Account linking is live too.

## What changed
- **Sign-in page**: TradeMetric's own page with a brand panel. Google, Apple and Discord buttons; email/username + password; show-password toggle; live username check.
- **Email confirmation on the original page**: the email carries a code to type in. The link still works. If it's clicked in another tab, the original tab picks it up from storage. If it's clicked on another device, the original tab retries the sign-in every 15 s and signs in once the email is confirmed.
- **Password reset by code** on the same page.
- **Fixes**: signing up with an existing email now says so. Signing in unconfirmed sends a fresh code. 60 s resend cooldown. Plain-English errors.
- **Session length**: one season, until Feb 15 after the season (at least 60 days out). No "keep me signed in" box.
- **Names**: the username shows everywhere, never the email. Social sign-in users pick a username first, and can skip.
- **Account area** (`#account-profile`, `-leagues`, `-plan`, `-security`): header with username, plan and member-since. Profile: change username. Leagues: saved leagues and sync status. Subscription: placeholder with the Beta plan, a Pro "coming soon" card and Billing. Security: password, linked accounts, the season session, sign out everywhere and delete account.
- **Privacy policy** at /privacy (privacy.html, `cleanUrls` on in vercel.json), linked in the footer.

## Polish round 2 (commit c2757a4)
- **Brand panel**: headline, an example Trade Score card (labelled "Example"), six features (Trade Score, Season Sim, Rankings, Waivers, League Sync, AI Helper), a beta badge, and a "Create a free account" button on the sign-in screen only. At 820px and below it shrinks to the headline plus feature chips. At 480px and below the beta badge moves under the chips.
- **Code input**: `codeField()` / `paintOtp()` in js/app.js, styles `.otp*`. Six underlined slots over one real input, maxlength 6. Six digits auto-submit on the confirm screen. A wrong or short code clears the input, shakes, turns the slots red and shows the message (`codeFail()`).
- **Bug fixed**: the resend countdown no longer re-renders the whole card every second (it used to wipe a half-typed code).
- **Style**: 10px radius in the auth block, 44px inputs, 1px accent focus with a soft ring, social buttons with a plain mark.

## Provider logos + copy trim (commit 8c134d0)
- Google and Discord marks are inline SVGs in `SSO_LOGO`; `ssoMark(p)` renders them on the sign-in buttons and in Account → Security → Linked accounts. Apple still uses the letter "A" until Apple sign-in is set up — add its mark to `SSO_LOGO` then.

## Account linking (commit dbe8708)
- Email/password and Google sign-in with the same email are two separate Supabase users (Supabase does not auto-merge by email). Fix: a signed-in user explicitly connects a second provider.
- "Allow manual linking" is on in Supabase.
- Account → Security → **Linked accounts**: Connect / Disconnect per provider. Apple hidden behind "Coming soon".
- `linkOAuth(id)` stores the provider in `sessionStorage` (`tm-link`), then calls `SB.auth.linkIdentity()`. `initAccounts()` recognizes the return, routes to `#account-security` and toasts the result.
- `unlinkOAuth(id)` calls `SB.auth.unlinkIdentity()`; blocked if it's the user's only sign-in method.

## Supabase setup (done)
- SQL: schema.sql + accounts.sql + accounts_v2.sql run.
- Redirect URLs: trademetric.app, www.trademetric.app and the Vercel preview domains.
- Custom SMTP via Resend; sender noreply@trademetric.app.
- Branded Confirm signup and Reset password email templates.
- Discord and Google sign-in enabled (Google app is in production with basic scopes; don't upload a logo on Google's Branding page, it triggers verification).
- Apple: not set up (needs the $99/yr Apple Developer membership).

## Notifications tab (2026-11-25)
- The account area now has five tabs: Profile, Leagues, **Notifications**, Subscription, Security (`#account-notifications`).
- Banners, Push notifications and Email moved out of Leagues into the new tab (`accNotifications()` in js/app.js). Leagues keeps the league list and cloud save.
- The bell gear on the News tab, the push test notification and the "email settings" links in emails all point to `#account-notifications`. Old emails that link to `#account-leagues` still open the account, just on the Leagues tab.

## Open
- Apple sign-in and its logo.
- The code input assumes 6-digit codes. If Supabase's email code length changes, update `maxlength` and the slot count in `codeField()`.
- Paid plans (Stripe webhook sets `profiles.plan`, which users can't write themselves). Free vs Pro gating is built: see `docs/plans.md`.
- Rotate the Resend API key (it was once pasted into a chat).
