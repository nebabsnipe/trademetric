// Billing, one endpoint (the hosting plan allows 12 server functions; the problem-report route moved into
// api/push.js to make room for this one). vercel.json maps the friendly addresses onto it:
//   POST /api/stripe-webhook       Stripe tells us what happened (signature checked, each event acted on once)
//   GET  /api/billing/status       the signed-in person's plan, trial, next charge and the prices (all from Stripe)
//   POST /api/billing/checkout     { plan: 'monthly' | 'yearly' } -> Stripe Checkout's address
//   POST /api/billing/portal       { flow?: 'cancel' } -> Stripe's Customer Portal address
//   GET  /api/billing/cron         the hourly check (grace periods, trial reminders). Needs the CRON_SECRET.
//                                  ?dry=1 shows what it would send.
// The logic is in api/_billing.js. This file answers in the web-standard style (Request in, Response out) so the
// webhook signature is checked against the exact bytes Stripe sent.

import { timingSafeEqual } from 'node:crypto';
import { reportIssue } from './_sentry.js';
import { betaOn } from './_plan.js';
import { siteBase } from './_email.js';
import { webhook, statusFor, startCheckout, finishCheckout, openPortal, runCron, billingState } from './_billing.js';

const SUPA = (process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co').replace(/\/+$/, '');
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';   // public by design (same one the page uses)

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const bearer = req => { const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); return m ? m[1].trim() : ''; };
const cronOk = req => { const want = process.env.CRON_SECRET || ''; return want.length >= 16 && safeEq(bearer(req), want); };

/* who is asking: checked with Supabase from their own sign-in token, never from anything the page says */
async function userOf(req) {
  const token = bearer(req);
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: PUB, authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch { return null; }
}
async function bodyOf(req) { try { return await req.json(); } catch { return {}; } }

async function route(req) {
  const u = new URL(req.url, 'https://www.trademetric.app'), q = u.searchParams;
  const act = q.get('do') || (/\/api\/billing\/([a-z]+)\/?$/.exec(u.pathname) || [])[1] || '';

  if (!act) {                                                   // the webhook itself
    if (req.method !== 'POST') return json(405, { error: 'method' });
    const raw = Buffer.from(await req.arrayBuffer());
    const r = await webhook(raw, req.headers.get('stripe-signature'));
    if (r.status >= 500) await reportIssue(`Billing: webhook ${r.body.error}${r.body.type ? ' (' + r.body.type + ')' : ''}`, { route: 'stripe-webhook', error: r.error, tags: { kind: 'billing' } }).catch(() => {});
    return json(r.status, r.body);
  }

  if (act === 'cron') {
    if (!cronOk(req)) return json(401, { error: 'unauthorized' });
    const out = await runCron({ dry: q.get('dry') === '1' });
    if (out.failed) await reportIssue('Billing: the hourly check hit an error', { route: 'stripe-webhook', tags: { kind: 'billing' }, extra: out }).catch(() => {});
    return json(out.error ? 503 : 200, out);
  }

  const user = await userOf(req);
  const base = siteBase();
  if (act === 'status') {
    if (req.method !== 'GET') return json(405, { error: 'method' });
    let synced = null;
    if (user && q.get('session_id')) synced = await finishCheckout(user, q.get('session_id'));
    return json(200, { beta: betaOn(), signedIn: !!user, synced, ...(await statusFor(user)) });
  }
  if (!user) return json(401, { error: 'signed_out', message: 'Sign in first.' });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const b = await bodyOf(req);
  if (act === 'checkout') {
    // during the beta everyone already has Pro, so nobody is sent to pay (the owner tests on a preview with the beta off)
    if (betaOn()) return json(409, { error: 'beta', message: 'Pro is free for everyone during the beta.' });
    const r = await startCheckout(user, String(b.plan || ''), base);
    return json(r.status, r.body);
  }
  if (act === 'portal') {
    const r = await openPortal(user, b.flow === 'cancel' ? 'cancel' : '', base);
    return json(r.status, r.body);
  }
  return json(404, { error: 'unknown' });
}

async function entry(req) {
  try { return await route(req); }
  catch (e) {
    await reportIssue('Billing route crashed', { route: 'stripe-webhook', error: e, tags: { kind: 'billing', mode: billingState().mode || 'off' } }).catch(() => {});
    return json(500, { error: 'server', message: 'Something went wrong. Try again in a moment.' });
  }
}
export const GET = entry;
export const POST = entry;
