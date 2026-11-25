// Billing tests with a pretend Stripe and a pretend database (no keys, no network, nothing charged).
//   node scripts/test-billing.mjs
// The pretend Stripe has its own clock, like Stripe's test clocks: start a trial, move the clock past the trial end,
// decline a card, cancel, switch plans. Every event goes through the real webhook code (signature check included),
// the same as Stripe's would. The database rules themselves (who gets Pro) are mirrored from supabase/billing.sql.
// Real Stripe test mode is the next step, once the keys are in Vercel (see docs/payments.md).

import { createHmac } from 'node:crypto';

process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-signing-secret';
process.env.STRIPE_PRICE_MONTHLY = 'price_month';
process.env.STRIPE_PRICE_YEARLY = 'price_year';
delete process.env.VERCEL_ENV;

const B = await import('../api/_billing.js');
const { io, webhook, startCheckout, finishCheckout, openPortal, statusFor, runCron, verifySignature } = B;

const DAY = 864e5;
let NOW = Date.UTC(2026, 11, 1, 15, 0, 0);
let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else { fails++; console.log('  FAIL:', what); } };

/* ---------------- pretend database ---------------- */
const T = { billing_customers: [], subscriptions: [], stripe_events: [], profiles: [] };
const ACCOUNTS = {};
function parse(path) {
  const [table, qs] = path.split('?');
  const q = new URLSearchParams(qs || ''), f = [];
  for (const [k, v] of q) if (!['select', 'order', 'on_conflict', 'limit'].includes(k)) f.push([k, v]);
  return { table, f, q };
}
const val = v => (v === 'true' ? true : v === 'false' ? false : v);
function match(row, f) {
  return f.every(([k, v]) => {
    const i = v.indexOf('.'), op = v.slice(0, i), x = decodeURIComponent(v.slice(i + 1)), c = row[k];
    if (op === 'eq') return c === val(x) || String(c) === x;
    if (op === 'is') return x === 'null' ? c == null : c === val(x);
    if (op === 'gt') return c != null && c > x;
    if (op === 'lte') return c != null && c <= x;
    if (op === 'in') return x.replace(/[()]/g, '').split(',').includes(c);
    throw new Error('op ' + op);
  });
}
function hasPro(uid) {
  const now = new Date(NOW).toISOString();
  return T.subscriptions.some(s => s.user_id === uid && (['trialing', 'active'].includes(s.status) || (['past_due', 'unpaid'].includes(s.status) && s.grace_until && s.grace_until > now)));
}
function applyPlan(uid) {
  const p = T.profiles.find(x => x.id === uid);
  if (!T.subscriptions.some(s => s.user_id === uid)) return p && p.plan;
  const plan = hasPro(uid) ? 'pro' : 'free';
  if (p) p.plan = plan;
  return plan;
}
io.rest = async (path, { method = 'GET', body, prefer = '' } = {}) => {
  if (DB_DOWN) return null;
  if (path.startsWith('rpc/')) {
    const fn = path.slice(4);
    if (fn === 'billing_apply_plan') return applyPlan(body.p_user);
    if (fn === 'billing_refresh') { let n = 0; for (const uid of new Set(T.subscriptions.map(s => s.user_id))) { const b = (T.profiles.find(x => x.id === uid) || {}).plan; if (applyPlan(uid) !== b) n++; } return n; }
    if (fn === 'email_accounts') return body.p_ids.map(id => ACCOUNTS[id]).filter(Boolean);
    throw new Error('rpc ' + fn);
  }
  const { table, f, q } = parse(path), rows = T[table];
  if (!rows) throw new Error('table ' + table);
  if (method === 'GET') {
    let out = rows.filter(r => match(r, f)).map(r => ({ ...r }));
    if (q.get('order') === 'updated_at.desc') out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return out;
  }
  if (method === 'POST') {
    const keys = (q.get('on_conflict') || '').split(',').filter(Boolean);
    const hit = keys.length ? rows.find(r => keys.every(k => r[k] === body[k])) : null;
    if (hit) { if (/merge-duplicates/.test(prefer)) Object.assign(hit, body); return /representation/.test(prefer) ? [] : true; }
    rows.push({ ...body });
    return /representation/.test(prefer) ? [{ ...body }] : true;
  }
  if (method === 'PATCH') { rows.filter(r => match(r, f)).forEach(r => Object.assign(r, body)); return true; }
  if (method === 'DELETE') { T[table] = rows.filter(r => !match(r, f)); return true; }
  throw new Error('method ' + method);
};
let DB_DOWN = false;
io.storeOn = () => true;
io.now = () => NOW;

/* ---------------- emails and analytics: recorded ---------------- */
const SENT = [], EVENTS = [];
io.sendEmail = async (user, type, key, data) => {
  if (SENT.some(e => e.user === user.id && e.type === type && e.key === key)) return { status: 'duplicate' };   // like email_sent
  SENT.push({ user: user.id, type, key, data });
  return { status: 'sent' };
};
io.capture = async (uid, event, props) => { EVENTS.push({ uid, event, props }); };

/* ---------------- pretend Stripe ---------------- */
const S = { prices: { price_month: { id: 'price_month', active: true, unit_amount: 500, currency: 'usd', recurring: { interval: 'month' } }, price_year: { id: 'price_year', active: true, unit_amount: 3000, currency: 'usd', recurring: { interval: 'year' } } },
  customers: {}, subs: {}, sessions: {}, invoices: {}, n: 0, cards: {} };
const sec = ms => Math.floor(ms / 1000);
const id = p => `${p}_${++S.n}`;
const addPeriod = (t, plan) => { const d = new Date(t * 1000); if (plan === 'price_year') d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1); return sec(d.getTime()); };
function subObj(s) { return { ...s, items: { data: [{ price: S.prices[s.price], current_period_end: s.period_end }] }, default_payment_method: { id: 'pm_1', card: { last4: S.cards[s.customer] === 'decline' ? '0341' : '4242' } } }; }
io.stripe = async (method, path, params = {}) => {
  const r = d => ({ ok: true, status: 200, data: d }), nf = { ok: false, status: 404, data: { error: { message: 'No such object' } } };
  let m;
  if (method === 'GET' && (m = /^prices\/(.+)$/.exec(path))) return S.prices[decodeURIComponent(m[1])] ? r(S.prices[decodeURIComponent(m[1])]) : nf;
  if (method === 'POST' && path === 'customers') { const c = { id: id('cus'), email: params.email, metadata: params.metadata }; S.customers[c.id] = c; return r(c); }
  if (method === 'GET' && path === 'subscriptions') return r({ data: Object.values(S.subs).filter(s => s.customer === params.customer).map(subObj) });
  if (method === 'GET' && (m = /^subscriptions\/(.+)$/.exec(path))) return S.subs[m[1]] ? r(subObj(S.subs[m[1]])) : nf;
  if (method === 'DELETE' && (m = /^subscriptions\/(.+)$/.exec(path))) { const s = S.subs[m[1]]; s.status = 'canceled'; s.ended_at = sec(NOW); s.canceled_at = sec(NOW); emit('customer.subscription.deleted', subObj({ ...s, cancellation_details: { reason: 'cancellation_requested' } })); return r(subObj(s)); }
  if (method === 'POST' && path === 'checkout/sessions') { const cs = { id: id('cs_test'), url: 'https://checkout.stripe.com/c/pay/x', ...params }; S.sessions[cs.id] = cs; return r(cs); }
  if (method === 'GET' && (m = /^checkout\/sessions\/(.+)$/.exec(path))) return S.sessions[m[1]] ? r(S.sessions[m[1]]) : nf;
  if (method === 'POST' && path === 'invoices/create_preview') { const s = S.subs[params.subscription]; return r({ amount_due: S.prices[s.price].unit_amount, currency: 'usd' }); }
  if (method === 'POST' && path === 'billing_portal/sessions') return r({ url: 'https://billing.stripe.com/p/session/x', ...params });
  return { ok: false, status: 400, data: { error: { message: 'pretend stripe: ' + method + ' ' + path } } };
};
const QUEUE = [];
function emit(type, object, previous_attributes) { QUEUE.push({ id: id('evt'), type, livemode: false, created: sec(NOW), data: { object, ...(previous_attributes ? { previous_attributes } : {}) } }); }
function sign(raw, t = sec(NOW), secret = process.env.STRIPE_WEBHOOK_SECRET) { return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`; }
async function deliver(ev) { const raw = JSON.stringify(ev); return webhook(Buffer.from(raw), sign(raw)); }
async function flush() { const out = []; while (QUEUE.length) { const ev = QUEUE.shift(); const r = await deliver(ev); out.push(r); if (r.status !== 200) console.log('  webhook', ev.type, r.status, r.body); } return out; }

function completeCheckout(csId) {
  const cs = S.sessions[csId], price = cs.line_items[0].price, sd = cs.subscription_data || {};
  const trial = sd.trial_period_days ? sec(NOW + sd.trial_period_days * DAY) : null;
  const s = { id: id('sub'), customer: cs.customer, price, status: trial ? 'trialing' : 'active', trial_start: trial ? sec(NOW) : null, trial_end: trial, created: sec(NOW),
    period_end: trial || addPeriod(sec(NOW), price), cancel_at_period_end: false, cancel_at: null, canceled_at: null, ended_at: null, livemode: false, metadata: sd.metadata || {} };
  S.subs[s.id] = s; cs.subscription = s.id; cs.status = 'complete';
  emit('checkout.session.completed', { id: cs.id, mode: 'subscription', subscription: s.id, client_reference_id: cs.client_reference_id, customer: cs.customer });
  emit('customer.subscription.created', subObj(s));
  if (!trial) { const inv = invoice(s, 'paid'); emit('invoice.paid', inv); }
  return s;
}
function invoice(s, outcome) {
  const inv = { id: id('in'), customer: s.customer, amount_due: S.prices[s.price].unit_amount, amount_paid: outcome === 'paid' ? S.prices[s.price].unit_amount : 0, currency: 'usd', attempt_count: 1,
    parent: { type: 'subscription_details', subscription_details: { subscription: s.id } }, status_transitions: { paid_at: outcome === 'paid' ? sec(NOW) : null } };
  S.invoices[inv.id] = inv; return inv;
}
/* move the clock: trials end, periods renew, scheduled cancellations happen */
function advance(ms) {
  const target = NOW + ms;
  for (;;) {
    const due = Object.values(S.subs).filter(s => ['trialing', 'active'].includes(s.status)).map(s => ({ s, at: s.period_end * 1000 })).filter(x => x.at <= target).sort((a, b) => a.at - b.at)[0];
    // renewal reminders (invoice.upcoming) 7 days before an active subscription renews
    for (const s of Object.values(S.subs)) if (s.status === 'active' && !s.upcomingSent && (s.period_end * 1000 - 7 * DAY) <= (due ? Math.min(due.at, target) : target)) {
      const was = NOW; NOW = Math.max(NOW, s.period_end * 1000 - 7 * DAY); s.upcomingSent = true;
      emit('invoice.upcoming', { customer: s.customer, amount_due: S.prices[s.price].unit_amount, currency: 'usd', next_payment_attempt: s.period_end, parent: { type: 'subscription_details', subscription_details: { subscription: s.id } } }); NOW = Math.max(NOW, was);
    }
    if (!due) break;
    const s = due.s; NOW = due.at;
    if (s.cancel_at_period_end) { s.status = 'canceled'; s.ended_at = sec(NOW); emit('customer.subscription.deleted', subObj({ ...s, cancellation_details: { reason: 'cancellation_requested' } })); continue; }
    const before = s.status;
    if (S.cards[s.customer] === 'decline') { s.status = 'past_due'; emit('invoice.payment_failed', invoice(s, 'failed')); emit('customer.subscription.updated', subObj(s), { status: before }); continue; }
    s.status = 'active'; s.period_end = addPeriod(s.period_end, s.price); s.upcomingSent = false;
    emit('invoice.paid', invoice(s, 'paid')); emit('customer.subscription.updated', subObj(s), { status: before });
  }
  NOW = target;
}
function portalCancel(s) { s.cancel_at_period_end = true; s.canceled_at = sec(NOW); emit('customer.subscription.updated', subObj(s), { cancel_at_period_end: false }); }
function portalSwitch(s, price) { const old = s.price; s.price = price; if (s.status === 'active') { s.period_end = addPeriod(sec(NOW), price); emit('invoice.paid', invoice(s, 'paid')); } emit('customer.subscription.updated', subObj(s), { items: { data: [{ price: S.prices[old] }] } }); }

/* ---------------- people ---------------- */
let N = 0;
function person(name) {
  const uid = `00000000-0000-4000-8000-${String(++N).padStart(12, '0')}`;
  T.profiles.push({ id: uid, username: name, plan: 'free' });
  ACCOUNTS[uid] = { id: uid, email: `${name}@example.com`, username: name };
  return { id: uid, email: `${name}@example.com` };
}
const planOf = u => T.profiles.find(p => p.id === u.id).plan;
const mails = (u, type) => SENT.filter(e => e.user === u.id && e.type === type);
const evs = (u, name) => EVENTS.filter(e => e.uid === u.id && e.event === name);
const BASE = 'https://preview.example';
async function subscribe(u, plan, card = 'ok') {
  const r = await startCheckout(u, plan, BASE);
  if (r.status !== 200) return { r };
  const cs = Object.values(S.sessions).at(-1);
  S.cards[cs.customer] = card;
  const s = completeCheckout(cs.id);
  const back = await finishCheckout(u, cs.id);     // the page coming back from Checkout
  await flush();
  return { r, cs, s, back };
}

/* ================= the tests ================= */
console.log('1. Start a trial, monthly and yearly: Pro turns on at once');
{
  const a = person('monthly_fan'), b = person('yearly_fan');
  const ra = await subscribe(a, 'monthly'), rb = await subscribe(b, 'yearly');
  ok(ra.r.status === 200 && ra.r.body.trial === true, 'monthly checkout opened with a trial');
  ok(ra.cs.subscription_data.trial_period_days === 7 && ra.cs.payment_method_collection === 'always', 'card required, 7-day trial');
  ok(ra.back.ok && ra.back.status === 'trialing', 'coming back from Checkout turns Pro on before the webhook arrives');
  ok(planOf(a) === 'pro' && planOf(b) === 'pro', 'both accounts are Pro');
  ok(T.subscriptions.find(s => s.user_id === b.id).plan === 'yearly', 'yearly recorded as yearly');
  ok(evs(a, 'checkout_started').length === 1 && evs(a, 'trial_started').length === 1, 'checkout_started and trial_started sent once');
  const st = await statusFor(a);
  ok(st.sub && st.sub.next && st.sub.next.amount === 500 && st.sub.next.date === T.subscriptions.find(s => s.user_id === a.id).trial_end, 'Account shows Stripe\'s first charge ($5) on the trial end date');
  ok(st.prices.monthly.amount === 500 && st.prices.yearly.amount === 3000, 'prices read from Stripe');

  console.log('2. Move the clock past the trial: charged, still Pro, receipt sent');
  advance(7 * DAY + 3600e3); await flush();
  ok(planOf(a) === 'pro' && planOf(b) === 'pro', 'still Pro after the trial');
  ok(mails(a, 'receipt').length === 1 && mails(a, 'receipt')[0].data.amount === 5, 'monthly receipt for $5');
  ok(mails(b, 'receipt').length === 1 && mails(b, 'receipt')[0].data.amount === 30 && mails(b, 'receipt')[0].data.period === 'year', 'yearly receipt for $30');
  ok(evs(a, 'subscription_started').length === 1, 'subscription_started sent once');

  console.log('   yearly renewal reminder 7 days before');
  advance(358 * DAY); await flush();
  ok(mails(b, 'renewal').length === 1 && mails(b, 'renewal')[0].data.amount === 30, 'yearly renewal reminder sent');
  ok(mails(a, 'renewal').length === 0, 'no renewal email for monthly');
  advance(10 * DAY); await flush();
  ok(mails(b, 'receipt').length === 2 && planOf(b) === 'pro', 'yearly renewed and receipted');
}

console.log('3. Cancel during the trial: Pro until trial end, then off, no charge');
{
  const c = person('trial_quitter');
  const { s } = await subscribe(c, 'monthly');
  const st0 = await statusFor(c);
  ok(st0.trialEligible === false, 'trial now used up');
  const p = await openPortal(c, 'cancel', BASE);
  ok(p.status === 200 && p.body.url, 'cancel opens Stripe\'s cancel step');
  portalCancel(s); await flush();
  ok(planOf(c) === 'pro', 'still Pro after cancelling during the trial');
  ok(mails(c, 'cancelled').length === 1 && mails(c, 'cancelled')[0].data.until, 'cancellation email says until when');
  ok(evs(c, 'subscription_cancelled').length === 1, 'subscription_cancelled sent');
  NOW += 6 * DAY; const cron = await runCron();
  ok(!mails(c, 'trial_ending').length && cron.reminders.length === 0, 'no "trial ending" email once cancelled (nothing will be charged)');
  advance(2 * DAY); await flush();
  ok(planOf(c) === 'free', 'Pro off after the trial end');
  ok(!mails(c, 'receipt').length && !Object.values(S.invoices).some(i => i.customer === s.customer && i.amount_paid > 0), 'never charged');
}

console.log('4. Trial reminder 2 days before');
{
  const d = person('reminder_case');
  const { s } = await subscribe(d, 'yearly');
  NOW += 4 * DAY; let cron = await runCron();
  ok(!mails(d, 'trial_ending').length, 'not yet at 4 days in');
  NOW += 1.2 * DAY; cron = await runCron();
  const m = mails(d, 'trial_ending');
  ok(m.length === 1 && m[0].data.amount === 30 && m[0].data.period === 'year' && m[0].data.last4 === '4242', 'reminder sent with Stripe\'s amount and card');
  await runCron(); NOW += 3600e3; await runCron();
  ok(mails(d, 'trial_ending').length === 1, 'reminder only once');
  advance(2 * DAY); await flush();
}

console.log('5. Cancel after paying: Pro until the period ends');
{
  const e = person('paid_quitter');
  const { s } = await subscribe(e, 'monthly');
  advance(8 * DAY); await flush();
  ok(planOf(e) === 'pro' && mails(e, 'receipt').length === 1, 'paid');
  portalCancel(s); await flush();
  ok(planOf(e) === 'pro', 'still Pro right after cancelling');
  const st = await statusFor(e);
  ok(st.sub.cancel_at_period_end && st.sub.next === null, 'Account shows cancelled, no next charge');
  advance(20 * DAY); await flush();
  ok(planOf(e) === 'pro', 'Pro through the paid month');
  advance(15 * DAY); await flush();
  ok(planOf(e) === 'free', 'Pro off after the period end');
  ok(mails(e, 'receipt').length === 1, 'no second charge');
}

console.log('6. Card declined at trial end: grace banner, email, Pro off after 7 days');
{
  const f = person('declined');
  await subscribe(f, 'monthly', 'decline');
  advance(7 * DAY + 60e3); await flush();
  const row = T.subscriptions.find(s => s.user_id === f.id);
  ok(row.status === 'past_due' && row.grace_until, 'past due with a grace period');
  ok(planOf(f) === 'pro', 'still Pro during the grace period');
  ok(mails(f, 'payment_failed').length === 1 && mails(f, 'payment_failed')[0].data.until, 'payment failed email with the deadline');
  ok(evs(f, 'payment_failed').length === 1, 'payment_failed analytics');
  ok(Math.abs(new Date(row.grace_until) - (NOW + 7 * DAY)) < 2 * 60e3, 'grace is 7 days');
  NOW += 6 * DAY; await runCron();
  ok(planOf(f) === 'pro', 'day 6: still Pro');
  NOW += 1 * DAY + 3600e3; await runCron();
  ok(planOf(f) === 'free', 'after 7 days the hourly check turns Pro off');
}

console.log('7. Switch monthly to yearly in the portal');
{
  const g = person('switcher');
  const { s } = await subscribe(g, 'monthly');
  advance(8 * DAY); await flush();
  portalSwitch(s, 'price_year'); await flush();
  const row = T.subscriptions.find(x => x.user_id === g.id);
  ok(row.plan === 'yearly' && row.amount === 3000 && planOf(g) === 'pro', 'now yearly, still Pro');
}

console.log('8. The same webhook twice: nothing doubles');
{
  const h = person('double');
  const r = await startCheckout(h, 'monthly', BASE);
  const cs = Object.values(S.sessions).at(-1); S.cards[cs.customer] = 'ok';
  completeCheckout(cs.id);
  const evts = QUEUE.splice(0);
  for (const ev of evts) { await deliver(ev); const again = await deliver(ev); ok(again.status === 200 && again.body.duplicate, 'second delivery of ' + ev.type + ' ignored'); }
  advance(7 * DAY + 60e3);
  const paid = QUEUE.find(x => x.type === 'invoice.paid');
  await flush(); await deliver(paid); await deliver(paid);
  ok(mails(h, 'receipt').length === 1, 'one receipt');
  ok(evs(h, 'trial_started').length === 1 && evs(h, 'subscription_started').length === 1, 'analytics once each');
  ok(T.subscriptions.filter(x => x.user_id === h.id).length === 1, 'one subscription row');
}

console.log('9. A second trial on the same account is refused');
{
  const k = person('second_try');
  const first = await subscribe(k, 'monthly');
  portalCancel(first.s); await flush(); advance(8 * DAY); await flush();
  ok(planOf(k) === 'free', 'first trial over');
  const r = await startCheckout(k, 'yearly', BASE);
  const cs = Object.values(S.sessions).at(-1);
  ok(r.status === 200 && r.body.trial === false && !cs.subscription_data.trial_period_days, 'second checkout has no trial (pays today)');
  // even if two checkouts were opened at once, the second trial is cancelled before it can count
  const k2 = person('racer');
  const r1 = await startCheckout(k2, 'monthly', BASE); const cs1 = Object.values(S.sessions).at(-1);
  NOW += 61e3;
  const r2 = await startCheckout(k2, 'yearly', BASE); const cs2 = Object.values(S.sessions).at(-1);
  S.cards[cs1.customer] = 'ok';
  ok(cs1.subscription_data.trial_period_days && cs2.subscription_data.trial_period_days, '(both opened with a trial before either finished)');
  completeCheckout(cs1.id); await flush();
  const s2 = completeCheckout(cs2.id); await flush();
  ok(S.subs[s2.id].status === 'canceled', 'the second one is cancelled straight away, no charge');
  ok(T.subscriptions.filter(x => x.user_id === k2.id && ['trialing', 'active'].includes(x.status)).length === 1 && planOf(k2) === 'pro', 'one plan left, still Pro');
  const r3 = await startCheckout(k2, 'monthly', BASE);
  ok(r3.status === 409 && r3.body.error === 'already', 'can\'t start another while one is running');
}

console.log('10. Safety checks');
{
  const raw = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', livemode: false, data: { object: {} } });
  ok((await webhook(Buffer.from(raw), sign(raw, sec(NOW), 'whsec_wrong'))).status === 400, 'wrong signature refused');
  ok((await webhook(Buffer.from(raw), sign(raw, sec(NOW) - 600))).status === 400, 'old (replayed) signature refused');
  ok((await webhook(Buffer.from(raw + ' '), sign(raw))).status === 400, 'changed body refused');
  const live = JSON.stringify({ id: 'evt_live', type: 'invoice.paid', livemode: true, data: { object: {} } });
  ok((await webhook(Buffer.from(live), sign(live))).body.ignored === 'other mode', 'live event ignored on test keys');
  ok(verifySignature('a', `t=${sec(NOW)},v1=00,v1=${createHmac('sha256', 's').update(`${sec(NOW)}.a`).digest('hex')}`, 's'), 'any matching v1 signature accepted (key rotation)');
  // a failure half-way lets Stripe retry the same event
  const m = person('retry'); const r = await startCheckout(m, 'monthly', BASE); const cs = Object.values(S.sessions).at(-1); S.cards[cs.customer] = 'ok';
  completeCheckout(cs.id); const evts = QUEUE.splice(0);
  const realStripe = io.stripe; io.stripe = async (mm, p, q) => (/^subscriptions\//.test(p) && mm === 'GET' ? { ok: false, status: 500, data: {} } : realStripe(mm, p, q));
  const bad = await deliver(evts[0]); io.stripe = realStripe;
  ok(bad.status === 500, 'Stripe hiccup -> 500 so Stripe retries');
  const good = await deliver(evts[0]);
  ok(good.status === 200 && !good.body.duplicate && planOf(m) === 'pro', 'the retry is processed (not treated as a duplicate)');
  process.env.VERCEL_ENV = 'preview'; process.env.STRIPE_SECRET_KEY = 'sk_live_' + 'x'.repeat(24);
  ok(B.billingState().blocked && !B.billingState().ready, 'a live key on a preview is refused');
  process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24); delete process.env.VERCEL_ENV;
  const nouser = { id: '00000000-0000-4000-8000-999999999999', email: 'x@example.com' };
  ok((await startCheckout(nouser, 'monthly', BASE)).body.error === 'username', 'needs a username first');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
