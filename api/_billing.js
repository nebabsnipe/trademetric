// Billing: TradeMetric Pro through Stripe. Helper for api/stripe-webhook.js (files in /api that start with "_"
// are helpers, not endpoints).
//
// How it fits together
//   - Paying and changing a card / plan / cancelling all happen on Stripe's own pages (Checkout and the Customer
//     Portal). Card details never touch this site or its database.
//   - Stripe tells us what happened through the webhook. Every event is written to stripe_events first, so the same
//     event arriving twice does nothing the second time. Then the subscription is re-read from Stripe (never trusted
//     from the event), saved to the subscriptions table, and profiles.plan is set from it by the database
//     (billing_apply_plan in supabase/billing.sql). profiles.plan stays the one thing the rest of the site reads.
//   - Pro is on while the subscription is trialing or active (a cancelled plan stays active until the end of what
//     was paid for), and for 7 days after a failed charge (the grace period). An hourly database job turns it off
//     when the grace period runs out.
//
// THE ONE CONFIG for prices: the two Stripe price ids in Vercel (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY). The
// amounts shown on the site are read from those prices in Stripe, so the site can never show a price Stripe won't
// charge. To change a price: make a new price in Stripe and put its id in Vercel. Trial and grace lengths: BILLING.
//
// Needs in Vercel: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY,
// SUPABASE_SECRET_KEY (and CRON_SECRET for the hourly check). Previews refuse a live key: test keys only.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { rest as dbRest, sharedOn } from './_shared.js';
import { sendEmail } from './_email.js';

export const BILLING = {
  trialDays: 7,              // free trial, card required up front
  graceDays: 7,              // Pro stays on this long after a failed charge, with a banner on the site
  trialReminderHours: 48,    // "your trial ends in 2 days" email (sent by the hourly check)
  renewalReminderDays: 7,    // yearly renewal reminder. Stripe decides when: set "Upcoming renewal events" to 7 days
  apiVersion: '2025-09-30.clover',
};

const PH_TOKEN = 'phc_BGgxBRAvtxPWREP6TqHWFPi2vrpUmshLSbRRh533oj4r';   // PostHog project key: public by design (same as js/telemetry.js)
const DAY = 864e5;

/* ---- outside services, in one object so scripts/test-billing.mjs can swap them for stand-ins ---- */
export const io = {
  rest: dbRest,
  storeOn: sharedOn,
  now: () => Date.now(),
  sendEmail,
  /* one Stripe API call. Returns { ok, status, data }. Never throws. */
  async stripe(method, path, params, idem) {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!key) return { ok: false, status: 0, data: { error: { message: 'no_key' } } };
    const q = new URLSearchParams(enc(params || {})).toString();
    let url = 'https://api.stripe.com/v1/' + path, body;
    if (method === 'GET' || method === 'DELETE') { if (q) url += '?' + q; } else body = q;
    const headers = { authorization: 'Bearer ' + key, 'stripe-version': BILLING.apiVersion, 'content-type': 'application/x-www-form-urlencoded' };
    if (idem) headers['idempotency-key'] = idem;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { method, headers, body, signal: ctl.signal });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data };
    } catch (e) { return { ok: false, status: 0, data: { error: { message: String(e && e.message || e) } } }; } finally { clearTimeout(t); }
  },
  /* an analytics event from the server (PostHog), on the person's account id like the page uses. Never throws. */
  async capture(userId, event, props = {}) {
    const env = process.env.VERCEL_ENV;
    if (!userId || (env !== 'production' && env !== 'preview')) return;
    try {
      await fetch('https://us.i.posthog.com/i/v0/e/', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: PH_TOKEN, event, distinct_id: userId, properties: { ...props, environment: env, source: 'server', billing_mode: keyMode() } }) });
    } catch {}
  },
};

/* Stripe's form encoding: { a: { b: 1 }, c: ['x'] } -> a[b]=1&c[0]=x */
function enc(obj, pre = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (x && typeof x === 'object' ? enc(x, `${key}[${i}]`, out) : out.push([`${key}[${i}]`, String(x)])));
    else if (typeof v === 'object') enc(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}
/* a Stripe call that must work (the webhook then answers 500 and Stripe tries again later) */
async function sx(method, path, params, idem) {
  const r = await io.stripe(method, path, params, idem);
  if (!r.ok) { const e = new Error(`stripe ${method} ${path.split('/')[0]} ${r.status} ${(r.data && r.data.error && r.data.error.message || '').slice(0, 160)}`); e.status = r.status; throw e; }
  return r.data;
}
/* a database call that must work */
async function db(path, opts) {
  const r = await io.rest(path, opts);
  if (r === null) throw new Error('database unavailable: ' + path.split('?')[0]);
  return r;
}
const uq = v => encodeURIComponent(String(v));
const iso = sec => (sec ? new Date(sec * 1000).toISOString() : null);

/* ---- which keys, and is everything set up ---- */
export function keyMode() {
  const k = process.env.STRIPE_SECRET_KEY || '';
  return /^(sk|rk)_test_/.test(k) ? 'test' : /^(sk|rk)_live_/.test(k) ? 'live' : null;
}
export const priceIds = () => ({ monthly: process.env.STRIPE_PRICE_MONTHLY || '', yearly: process.env.STRIPE_PRICE_YEARLY || '' });
export function billingState() {
  const mode = keyMode(), p = priceIds();
  const blocked = mode === 'live' && process.env.VERCEL_ENV !== 'production';   // previews and local copies: test keys only
  return { mode: blocked ? null : mode, blocked, ready: !!mode && !blocked && !!p.monthly && !!p.yearly && !!process.env.STRIPE_WEBHOOK_SECRET && io.storeOn() };
}

/* ---- the webhook signature (Stripe-Signature: t=...,v1=...) ---- */
export function verifySignature(raw, header, secret, nowMs = io.now(), toleranceSec = 300) {
  if (!secret || !header || raw == null) return false;
  let t = null; const sigs = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  }
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > toleranceSec) return false;            // old or replayed
  const want = createHmac('sha256', secret).update(Buffer.concat([Buffer.from(t + '.'), Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw))])).digest('hex');
  return sigs.some(s => s.length === want.length && timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

/* ---- prices, read from Stripe (kept 10 minutes) ---- */
let PRICE_CACHE = { at: 0, key: '', v: null };
export async function prices() {
  const ids = priceIds(), key = ids.monthly + '|' + ids.yearly + '|' + keyMode();
  if (PRICE_CACHE.v && PRICE_CACHE.key === key && io.now() - PRICE_CACHE.at < 10 * 60e3) return PRICE_CACHE.v;
  if (!ids.monthly || !ids.yearly || !billingState().mode) return null;
  const [m, y] = await Promise.all([io.stripe('GET', `prices/${uq(ids.monthly)}`), io.stripe('GET', `prices/${uq(ids.yearly)}`)]);
  const one = r => (r.ok && r.data && r.data.active && typeof r.data.unit_amount === 'number' && r.data.recurring
    ? { id: r.data.id, amount: r.data.unit_amount, currency: r.data.currency, interval: r.data.recurring.interval } : null);
  const v = { monthly: one(m), yearly: one(y) };
  if (!v.monthly || !v.yearly || v.monthly.interval !== 'month' || v.yearly.interval !== 'year') return null;   // misconfigured: show no prices
  PRICE_CACHE = { at: io.now(), key, v };
  return v;
}
function planOfPrice(price) {
  const ids = priceIds();
  if (!price) return null;
  if (price.id && price.id === ids.monthly) return 'monthly';
  if (price.id && price.id === ids.yearly) return 'yearly';
  const iv = price.recurring && price.recurring.interval;
  return iv === 'year' ? 'yearly' : iv === 'month' ? 'monthly' : null;
}

/* ---- the database side ---- */
export async function customerOf(userId, live) {
  const r = await db(`billing_customers?user_id=eq.${uq(userId)}&livemode=eq.${!!live}&select=*`);
  return r[0] || null;
}
async function customerByStripe(cus) {
  const r = await db(`billing_customers?stripe_customer_id=eq.${uq(cus)}&select=*`);
  return r[0] || null;
}
export async function subsOf(userId) {
  return db(`subscriptions?user_id=eq.${uq(userId)}&select=*&order=updated_at.desc`);
}
async function subRow(id) {
  const r = await db(`subscriptions?stripe_subscription_id=eq.${uq(id)}&select=*`);
  return r[0] || null;
}
const LIVE_STATES = ['trialing', 'active', 'past_due', 'unpaid'];
export const isLiveSub = s => !!s && LIVE_STATES.includes(s.status);

/* Has this account had a free trial, ever (in this mode)? Checked against our record and against Stripe. */
export async function trialUsed(userId, live) {
  const c = await customerOf(userId, live);
  if (c && c.trial_used_at) return true;
  const mine = await subsOf(userId);
  if (mine.some(s => s.livemode === !!live && s.trial_end)) return true;
  if (c) {
    const r = await sx('GET', 'subscriptions', { customer: c.stripe_customer_id, status: 'all', limit: 20 });
    if ((r.data || []).some(s => s.trial_start || s.trial_end)) return true;
  }
  return false;
}

/* Re-read one subscription from Stripe, save it, and set the account's plan from it.
   Returns { sub, row, prev, userId } or null when it isn't one of ours (made by hand in the dashboard, say). */
export async function syncSub(subId, { userHint } = {}) {
  const s = await sx('GET', `subscriptions/${uq(subId)}`, { expand: ['default_payment_method'] });
  const cus = typeof s.customer === 'string' ? s.customer : s.customer && s.customer.id;
  const known = cus ? await customerByStripe(cus) : null;
  const userId = (known && known.user_id) || (s.metadata && s.metadata.user_id) || userHint || null;   // our own record first
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) { console.warn('[billing] subscription with no TradeMetric account', s.id); return null; }
  const item = s.items && s.items.data && s.items.data[0], price = (item && item.price) || null;
  const prev = await subRow(s.id), now = io.now();
  const row = {
    stripe_subscription_id: s.id, user_id: userId, stripe_customer_id: cus, livemode: !!s.livemode, status: s.status,
    plan: planOfPrice(price), price_id: price && price.id || null,
    amount: price && typeof price.unit_amount === 'number' ? price.unit_amount : null, currency: price && price.currency || null,
    trial_end: iso(s.trial_end), current_period_end: iso((item && item.current_period_end) || s.current_period_end),
    cancel_at_period_end: !!s.cancel_at_period_end, cancel_at: iso(s.cancel_at), canceled_at: iso(s.canceled_at), ended_at: iso(s.ended_at),
    updated_at: new Date(now).toISOString(),
  };
  if (s.status === 'past_due' || s.status === 'unpaid') {
    if (!prev || !prev.payment_failed_at) { row.payment_failed_at = new Date(now).toISOString(); row.grace_until = new Date(now + BILLING.graceDays * DAY).toISOString(); }
  } else if (s.status === 'active' || s.status === 'trialing') { row.payment_failed_at = null; row.grace_until = null; }
  await db('subscriptions?on_conflict=stripe_subscription_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
  if (!known && cus) await db('billing_customers?on_conflict=stripe_customer_id', { method: 'POST', body: { user_id: userId, livemode: !!s.livemode, stripe_customer_id: cus }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  if (s.trial_end) await db(`billing_customers?user_id=eq.${uq(userId)}&livemode=eq.${!!s.livemode}&trial_used_at=is.null`, { method: 'PATCH', body: { trial_used_at: iso(s.trial_start || s.created) || new Date(now).toISOString() }, prefer: 'return=minimal' });
  await db('rpc/billing_apply_plan', { method: 'POST', body: { p_user: userId } });
  return { sub: s, row: { ...(prev || {}), ...row }, prev, userId };
}

/* A second subscription for an account that already has one, or a second free trial: cancel the new one right away
   (no charge has happened while it is trialing). Only possible if two checkouts were opened at the same time. */
async function guardDuplicate(r) {
  if (!r || r.sub.status !== 'trialing') return false;
  const others = (await subsOf(r.userId)).filter(s => s.stripe_subscription_id !== r.sub.id && s.livemode === !!r.sub.livemode);
  if (!others.some(s => isLiveSub(s) || s.trial_end)) return false;
  await sx('DELETE', `subscriptions/${uq(r.sub.id)}`, {}, `dup-cancel-${r.sub.id}`);
  await syncSub(r.sub.id);
  console.warn('[billing] cancelled a duplicate subscription / second trial', r.sub.id);
  return true;
}

/* ---- emails (the billing templates in api/_email_templates.js, sent through the one email helper) ---- */
const TZ = 'America/New_York';
export const fmtDay = isoStr => (isoStr ? new Date(isoStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TZ }) : '');
export const fmtDate = isoStr => (isoStr ? new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ }) : '');
const dollars = cents => (typeof cents === 'number' ? cents / 100 : null);
const last4Of = s => { const pm = s && s.default_payment_method; return pm && typeof pm === 'object' && pm.card ? pm.card.last4 : ''; };
async function accountOf(userId) {
  const r = await io.rest('rpc/email_accounts', { method: 'POST', body: { p_ids: [userId] } });
  return Array.isArray(r) && r[0] ? { id: userId, email: r[0].email, name: r[0].username || '' } : null;
}
/* sends one billing email. A refusal by the email service throws (so Stripe retries and it goes out later); an email
   that is already sent, or email not being set up on this copy of the site, does not. */
async function mail(userId, type, key, data) {
  const user = await accountOf(userId);
  if (!user) return { status: 'no_account' };
  const r = await io.sendEmail(user, type, key, data);
  if (r.status === 'failed') throw new Error(`email ${type} failed: ${r.error || ''}`);
  return r;
}

/* the next charge Stripe has lined up for a subscription: { amount (cents), currency } or null */
export async function nextCharge(subId) {
  const r = await io.stripe('POST', 'invoices/create_preview', { subscription: subId });
  return r.ok && r.data && typeof r.data.amount_due === 'number' ? { amount: r.data.amount_due, currency: r.data.currency } : null;
}

const invoiceSub = o => (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription) || o.subscription
  || (o.lines && o.lines.data && o.lines.data[0] && o.lines.data[0].parent && o.lines.data[0].parent.subscription_item_details && o.lines.data[0].parent.subscription_item_details.subscription) || null;
const idOf = x => (x && typeof x === 'object' ? x.id : x);

/* ---- one webhook event ---- */
export const HANDLED = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.trial_will_end', 'invoice.paid', 'invoice.payment_failed', 'invoice.upcoming'];

export async function handleEvent(ev) {
  const o = (ev.data && ev.data.object) || {};
  switch (ev.type) {
    case 'checkout.session.completed': {
      if (o.mode !== 'subscription' || !o.subscription) return { ignored: 'not a subscription checkout' };
      const r = await syncSub(idOf(o.subscription), { userHint: o.client_reference_id });
      if (r) await guardDuplicate(r);
      return { status: r && r.row.status };
    }
    case 'customer.subscription.created': {
      const r = await syncSub(o.id);
      if (!r) return { ignored: 'not ours' };
      if (await guardDuplicate(r)) return { status: 'duplicate_cancelled' };
      if (r.sub.status === 'trialing') await io.capture(r.userId, 'trial_started', { plan: r.row.plan, $set: { plan: 'pro' } });
      return { status: r.row.status };
    }
    case 'customer.subscription.updated': {
      const r = await syncSub(o.id);
      if (!r) return { ignored: 'not ours' };
      const pa = (ev.data && ev.data.previous_attributes) || {};
      const justScheduled = (('cancel_at_period_end' in pa) && !pa.cancel_at_period_end && o.cancel_at_period_end) || (('cancel_at' in pa) && !pa.cancel_at && o.cancel_at);
      const stillScheduled = r.sub.cancel_at_period_end || r.sub.cancel_at;   // re-read: they may have changed their mind since
      if (justScheduled && stillScheduled && isLiveSub(r.sub)) {
        const until = r.row.cancel_at || (r.sub.status === 'trialing' ? r.row.trial_end : r.row.current_period_end);
        await mail(r.userId, 'cancelled', `${r.sub.id}:cancel:${until}`, { until: fmtDate(until) });
        await io.capture(r.userId, 'subscription_cancelled', { plan: r.row.plan, during_trial: r.sub.status === 'trialing', ends: 'period_end' });
      }
      return { status: r.row.status, cancel: !!stillScheduled };
    }
    case 'customer.subscription.deleted': {
      const before = await subRow(o.id);
      const r = await syncSub(o.id);
      if (!r) return { ignored: 'not ours' };
      const reason = o.cancellation_details && o.cancellation_details.reason;
      const wasScheduled = before && (before.cancel_at_period_end || before.cancel_at);
      if (reason === 'cancellation_requested' && !wasScheduled) {    // cancelled on the spot (not at the end of the period)
        await mail(r.userId, 'cancelled', `${r.sub.id}:ended`, {});
        await io.capture(r.userId, 'subscription_cancelled', { plan: r.row.plan, during_trial: !!(before && before.status === 'trialing'), ends: 'now' });
      }
      await io.capture(r.userId, 'subscription_ended', { plan: r.row.plan, reason: reason || 'unknown', $set: { plan: 'free' } });
      return { status: r.row.status };
    }
    case 'customer.subscription.trial_will_end': {
      // Stripe sends this 3 days before. Pro and the record are refreshed here; the reminder email itself goes
      // 2 days before, from the hourly check (runCron), so it says the right thing even if the plan changed since.
      const r = await syncSub(o.id);
      return { status: r && r.row.status };
    }
    case 'invoice.paid': {
      const subId = idOf(invoiceSub(o));
      if (!subId) return { ignored: 'not a subscription invoice' };
      const r = await syncSub(subId);
      if (!r) return { ignored: 'not ours' };
      if (o.amount_paid > 0) {
        const paidAt = (o.status_transitions && o.status_transitions.paid_at) || ev.created;
        await mail(r.userId, 'receipt', `inv:${o.id}`, { amount: dollars(o.amount_paid), period: r.row.plan === 'yearly' ? 'year' : 'month', last4: last4Of(r.sub),
          date: fmtDate(iso(paidAt)), next: r.sub.cancel_at_period_end || r.sub.cancel_at ? '' : fmtDate(r.row.current_period_end) });
        if (!r.prev || !r.prev.first_paid_at) {
          await db(`subscriptions?stripe_subscription_id=eq.${uq(subId)}&first_paid_at=is.null`, { method: 'PATCH', body: { first_paid_at: iso(paidAt) }, prefer: 'return=minimal' });
          await io.capture(r.userId, 'subscription_started', { plan: r.row.plan, amount: dollars(o.amount_paid), currency: o.currency, $set: { plan: 'pro' } });
        }
      }
      return { status: r.row.status };
    }
    case 'invoice.payment_failed': {
      const subId = idOf(invoiceSub(o));
      if (!subId) return { ignored: 'not a subscription invoice' };
      const r = await syncSub(subId);
      if (!r) return { ignored: 'not ours' };
      const graceUntil = r.row.grace_until || new Date(io.now() + BILLING.graceDays * DAY).toISOString();
      await mail(r.userId, 'payment_failed', `fail:${o.id}`, { amount: dollars(o.amount_due), last4: last4Of(r.sub), until: fmtDate(graceUntil) });
      if ((o.attempt_count || 1) <= 1) await io.capture(r.userId, 'payment_failed', { plan: r.row.plan, amount: dollars(o.amount_due), during: r.prev && r.prev.status === 'trialing' ? 'trial_end' : 'renewal' });
      return { status: r.row.status, grace_until: graceUntil };
    }
    case 'invoice.upcoming': {
      // sent by Stripe ahead of every renewal (set "Upcoming renewal events" to 7 days). Only yearly plans get an email.
      const subId = idOf(invoiceSub(o));
      if (!subId) return { ignored: 'not a subscription invoice' };
      const r = await syncSub(subId);
      if (!r) return { ignored: 'not ours' };
      if (r.row.plan !== 'yearly' || r.sub.status !== 'active' || r.sub.cancel_at_period_end || r.sub.cancel_at) return { ignored: 'no reminder needed' };
      const when = iso(o.next_payment_attempt) || r.row.current_period_end;
      await mail(r.userId, 'renewal', `renew:${subId}:${r.row.current_period_end}`, { when: fmtDate(when), amount: dollars(o.amount_due), period: 'year', last4: last4Of(r.sub) });
      return { status: r.row.status, reminded: true };
    }
    default:
      return { ignored: 'event not used' };
  }
}

/* The webhook, from the raw request body to an answer. Returns { status, body }. */
export async function webhook(raw, sigHeader) {
  const st = billingState();
  if (!st.mode || !process.env.STRIPE_WEBHOOK_SECRET) return { status: 503, body: { error: 'not_set_up' } };
  if (!verifySignature(raw, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)) return { status: 400, body: { error: 'bad_signature' } };
  let ev; try { ev = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw)); } catch { return { status: 400, body: { error: 'bad_json' } }; }
  if (!ev || !ev.id || !ev.type) return { status: 400, body: { error: 'bad_event' } };
  if (!!ev.livemode !== (st.mode === 'live')) return { status: 200, body: { ignored: 'other mode' } };   // a test event on live keys, or the reverse
  if (!HANDLED.includes(ev.type)) return { status: 200, body: { ignored: ev.type } };
  if (!io.storeOn()) return { status: 503, body: { error: 'no_database' } };
  // claim the event first: a second delivery finds the row and stops here
  const claim = await io.rest('stripe_events?on_conflict=id', { method: 'POST', body: { id: ev.id, type: ev.type, livemode: !!ev.livemode }, prefer: 'resolution=ignore-duplicates,return=representation' });
  if (!Array.isArray(claim)) return { status: 503, body: { error: 'no_database' } };
  if (!claim.length) return { status: 200, body: { duplicate: true } };
  try {
    const out = await handleEvent(ev);
    return { status: 200, body: { ok: true, type: ev.type, ...out } };
  } catch (e) {
    await io.rest(`stripe_events?id=eq.${uq(ev.id)}`, { method: 'DELETE', prefer: 'return=minimal' });   // let Stripe's retry run it again
    console.error('[billing] event failed', ev.type, String(e && e.message || e));
    return { status: 500, body: { error: 'failed', type: ev.type }, error: e };
  }
}

/* ---- the hourly check: grace periods that ran out, and "your trial ends in 2 days" ---- */
export async function runCron({ dry = false } = {}) {
  const out = { refreshed: null, reminders: [] };
  out.refreshed = await io.rest('rpc/billing_refresh', { method: 'POST', body: {} });
  if (!billingState().mode) return { ...out, error: 'not_set_up' };
  const now = io.now(), soon = new Date(now + BILLING.trialReminderHours * 3600e3).toISOString(), live = billingState().mode === 'live';
  const rows = await io.rest(`subscriptions?status=eq.trialing&livemode=eq.${live}&cancel_at_period_end=eq.false&cancel_at=is.null&trial_end=gt.${uq(new Date(now).toISOString())}&trial_end=lte.${uq(soon)}&select=*`);
  if (!Array.isArray(rows)) return { ...out, error: 'no_database' };
  for (const row of rows) {
    try {
      const s = await sx('GET', `subscriptions/${uq(row.stripe_subscription_id)}`, { expand: ['default_payment_method'] });
      if (s.status !== 'trialing' || s.cancel_at_period_end || s.cancel_at) { out.reminders.push({ sub: row.stripe_subscription_id, status: 'skipped' }); continue; }
      const next = await nextCharge(s.id);
      if (!next) { out.reminders.push({ sub: s.id, status: 'no_amount' }); continue; }   // never guess the amount
      const data = { when: fmtDay(iso(s.trial_end)), amount: dollars(next.amount), period: row.plan === 'yearly' ? 'year' : 'month', last4: last4Of(s) };
      if (dry) { out.reminders.push({ sub: s.id, status: 'would_send', data }); continue; }
      const r = await mail(row.user_id, 'trial_ending', `trial:${s.id}:${iso(s.trial_end)}`, data);
      out.reminders.push({ sub: s.id, status: r.status });
    } catch (e) { out.reminders.push({ sub: row.stripe_subscription_id, status: 'error', error: String(e && e.message || e).slice(0, 160) }); out.failed = true; }
  }
  return out;
}

/* ---- what the Account page and the upgrade screen show ---- */
export async function statusFor(user) {
  const st = billingState(), live = st.mode === 'live';
  const out = { ready: st.ready, mode: st.mode, trialDays: BILLING.trialDays, graceDays: BILLING.graceDays, prices: null, trialEligible: null, sub: null };
  if (!st.mode) return out;
  out.prices = await prices();
  if (!user || !io.storeOn()) return out;
  const mine = (await subsOf(user.id)).filter(s => s.livemode === live);
  const cur = mine.find(isLiveSub) || mine[0] || null;
  out.trialEligible = !(await trialUsed(user.id, live));
  if (cur) {
    const sub = { id: cur.stripe_subscription_id, plan: cur.plan, status: cur.status, amount: cur.amount, currency: cur.currency, trial_end: cur.trial_end,
      current_period_end: cur.current_period_end, cancel_at_period_end: cur.cancel_at_period_end, cancel_at: cur.cancel_at, grace_until: cur.grace_until,
      ended_at: cur.ended_at, next: null, last4: '' };
    if (isLiveSub(cur)) {
      const [n, s] = await Promise.all([cur.cancel_at_period_end || cur.cancel_at ? null : nextCharge(cur.stripe_subscription_id),
        io.stripe('GET', `subscriptions/${uq(cur.stripe_subscription_id)}`, { expand: ['default_payment_method'] })]);
      if (n) sub.next = { amount: n.amount, currency: n.currency, date: cur.status === 'trialing' ? cur.trial_end : cur.current_period_end };
      if (s.ok) sub.last4 = last4Of(s.data);
    }
    out.sub = sub;
  }
  return out;
}

/* Open Stripe Checkout for this person. Returns { status, body }. */
export async function startCheckout(user, plan, base) {
  const st = billingState(), live = st.mode === 'live';
  if (!st.ready) return { status: 503, body: { error: 'not_set_up', message: 'Payments aren\'t switched on yet.' } };
  if (plan !== 'monthly' && plan !== 'yearly') return { status: 400, body: { error: 'plan' } };
  const price = priceIds()[plan], P = await prices();
  if (!P) return { status: 503, body: { error: 'prices', message: 'Couldn\'t load the prices. Try again in a moment.' } };
  const prof = await db(`profiles?id=eq.${uq(user.id)}&select=username`);
  if (!prof.length) return { status: 409, body: { error: 'username', message: 'Pick a username first (Account -> Profile).' } };
  const mine = (await subsOf(user.id)).filter(s => s.livemode === live);
  if (mine.some(isLiveSub)) return { status: 409, body: { error: 'already', message: 'You already have a plan. Use Manage billing to change it.' } };
  const trial = !(await trialUsed(user.id, live));
  let c = await customerOf(user.id, live);
  if (!c) {
    // testing only (test keys + STRIPE_TEST_CLOCKS=1): each new customer gets its own Stripe test clock, so the owner
    // can move time forward in the Stripe dashboard (trial ends, renewals, declines) on a real checkout
    let clock;
    if (!live && process.env.STRIPE_TEST_CLOCKS === '1') clock = (await sx('POST', 'test_helpers/test_clocks', { frozen_time: Math.floor(io.now() / 1000), name: `TradeMetric ${String(user.email || user.id).slice(0, 40)}` })).id;
    const cus = await sx('POST', 'customers', { email: user.email || undefined, metadata: { user_id: user.id }, test_clock: clock }, `cus-${user.id}-${live ? 'live' : 'test'}${clock ? '-' + clock : ''}`);
    await db('billing_customers?on_conflict=user_id,livemode', { method: 'POST', body: { user_id: user.id, livemode: live, stripe_customer_id: cus.id }, prefer: 'resolution=ignore-duplicates,return=minimal' });
    c = await customerOf(user.id, live);
  }
  const params = {
    mode: 'subscription', customer: c.stripe_customer_id, client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: 'always',                                   // card required up front, trial or not
    subscription_data: { metadata: { user_id: user.id }, ...(trial ? { trial_period_days: BILLING.trialDays, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}) },
    success_url: `${base}/?checkout=done&session_id={CHECKOUT_SESSION_ID}#account-plan`,
    cancel_url: `${base}/#upgrade-pro`,
    expires_at: Math.floor(io.now() / 60e3) * 60 + 31 * 60,                // 31 minutes (Stripe's minimum is 30); whole minutes so a double click matches
  };
  // the same person pressing the button twice within a minute gets the same checkout page
  const s = await sx('POST', 'checkout/sessions', params, `co-${user.id}-${plan}-${trial ? 't' : 'n'}-${Math.floor(io.now() / 60e3)}`);
  await io.capture(user.id, 'checkout_started', { plan, trial });
  return { status: 200, body: { url: s.url, trial } };
}

/* Back from Checkout: look the session up at Stripe (never trusting the page) so Pro turns on at once. */
export async function finishCheckout(user, sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId || '')) return { ok: false };
  const r = await io.stripe('GET', `checkout/sessions/${uq(sessionId)}`);
  if (!r.ok || !r.data || r.data.client_reference_id !== user.id || !r.data.subscription) return { ok: false };
  const s = await syncSub(idOf(r.data.subscription), { userHint: user.id });
  return { ok: !!s, status: s && s.row.status };
}

/* Stripe's Customer Portal for this person. flow 'cancel' opens straight on the cancel step. */
export async function openPortal(user, flow, base) {
  const st = billingState(), live = st.mode === 'live';
  if (!st.mode) return { status: 503, body: { error: 'not_set_up' } };
  const c = await customerOf(user.id, live);
  if (!c) return { status: 404, body: { error: 'no_customer', message: 'There\'s no billing on this account yet.' } };
  const params = { customer: c.stripe_customer_id, return_url: `${base}/#account-plan` };
  if (flow === 'cancel') {
    const cur = (await subsOf(user.id)).find(s => s.livemode === live && isLiveSub(s) && !s.cancel_at_period_end && !s.cancel_at);
    if (cur) params.flow_data = { type: 'subscription_cancel', subscription_cancel: { subscription: cur.stripe_subscription_id }, after_completion: { type: 'redirect', redirect: { return_url: `${base}/#account-plan` } } };
  }
  const r = await io.stripe('POST', 'billing_portal/sessions', params);
  if (!r.ok) return { status: 502, body: { error: 'portal', message: 'Couldn\'t open billing. Try again in a moment.' } };
  return { status: 200, body: { url: r.data.url } };
}
