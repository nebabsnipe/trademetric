// Email: the one helper every TradeMetric email goes through. Helper for api/email.js, not an endpoint.
// Sent with Resend. TradeMetric sends very few emails (the full list is in api/_email_templates.js); if in
// doubt, it doesn't send.
//
// Every send passes all of these, in this order, or it isn't sent:
//   1. the kind of email is one we send, and it's switched on (the recap email is built but off)
//   2. the address hasn't hard-bounced or marked us as spam (email_block)
//   3. the person hasn't switched that kind off (email_prefs; account emails have no switch)
//   4. its limit: one per group per person in a set time (big moments one a day, the weekly recap one a week,
//      injuries one a day ...). A second one in that time is dropped, for good
//   5. it has never been sent before: (user, type, key) is written to email_sent BEFORE sending, and the
//      database refuses a second copy, so two checks running at once can't both send it
//   6. the safety switch: unless EMAIL_LIVE is 1 (and this is the real site, never a preview), the email goes
//      to the owner's own address only, with the person it was meant for shown in the subject
//
// Needs in Vercel (see docs/emails.md): RESEND_API_KEY, EMAIL_LINK_SECRET, SUPABASE_SECRET_KEY.
// Optional: EMAIL_LIVE, EMAIL_FROM_ACCOUNT, EMAIL_FROM_UPDATES, EMAIL_REPLY_TO, EMAIL_TEST_TO, EMAIL_POSTAL.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { rest as dbRest, sharedOn } from './_shared.js';
import { render, LABEL } from './_email_templates.js';

const SITE = 'https://www.trademetric.app';
const OWNER_ID = '1cf5c595-1619-4ffc-bb69-b042382443f3';        // the site owner's account: where test-mode emails go
/* Who each kind of email comes from. Account emails (welcome, league stopped updating) come from support@ and
   replies go to support@. Big moments come from updates@ and replies also go to support@, so nobody who replies
   is ignored. Override with EMAIL_FROM_ACCOUNT, EMAIL_FROM_UPDATES, EMAIL_REPLY_TO. The name shown is always
   TradeMetric. The reply inbox has to exist before EMAIL_LIVE is switched on (docs/emails.md). */
const FROM = { account: 'support@trademetric.app', updates: 'updates@trademetric.app' };
const REPLY = 'support@trademetric.app';

/* Every kind of email.
   group: emails that share a limit. At most one email per group per person within capH hours. If two in the
          same group are due together, the higher rank goes and the other is dropped (championship beats clinch).
   sw:    the switches in Account -> Email that control it. No switches = an account email, always sent.
          The weekly recap has four (matchup, standout games, #1 at his position, highlights): each one is a
          section of that one email, and the email only goes when at least one switched-on section has something.
   on:false = built, but not sent yet. */
export const TYPES = {
  welcome:    {},
  sync_broke: {},
  // billing (sent by api/_billing.js from what Stripe reports): account emails, always sent, no unsubscribe
  trial_ending:   {},
  receipt:        {},
  payment_failed: {},
  renewal:        {},
  cancelled:      {},
  champ:      { group: 'big', capH: 24, rank: 4, sw: ['champ'] },
  clinch:     { group: 'big', capH: 24, rank: 3, sw: ['clinch'] },
  recap:      { group: 'big', capH: 24, rank: 2, sw: ['recap'], on: false },   // switch on when the season recap feature is live
  draft:      { group: 'big', capH: 24, rank: 1, sw: ['draft'] },
  weekly:     { group: 'weekly', capH: 96, sw: ['matchup', 'perf', 'top', 'clips'] },
  injury:     { group: 'injury', capH: 20, sw: ['inj'] },
  deadline:   { group: 'deadline', capH: 20, sw: ['deadline'] },
  moves:      { group: 'moves', capH: 6 * 24, sw: ['moves'] },
};
/* Every switch, and whether it starts on. Injuries start off (they can come often); everything else starts on. */
export const SWITCHES = ['matchup', 'perf', 'top', 'clips', 'inj', 'deadline', 'clinch', 'champ', 'recap', 'moves', 'draft'];
export const SWITCH_DEFAULT = { inj: false };
export const switchOn = (prefs, k) => (prefs && typeof prefs[k] === 'boolean' ? prefs[k] : SWITCH_DEFAULT[k] !== false);
export const hasSwitch = type => !!(TYPES[type] && TYPES[type].sw);
const groupTypes = g => Object.keys(TYPES).filter(t => TYPES[t].group === g);

/* Outside services, in one object so the tests can swap them for stand-ins. */
export const io = {
  rest: dbRest,
  storeOn: sharedOn,
  now: () => Date.now(),
  /* one email to Resend. Returns { ok, id, status, error }. Never throws. */
  async post(msg, idemKey) {
    const key = process.env.RESEND_API_KEY || '';
    if (!key) return { ok: false, status: 0, error: 'no_key' };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: ctl.signal,
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': idemKey },
        body: JSON.stringify(msg) });
      const j = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, id: j.id || null, status: r.status } : { ok: false, status: r.status, error: String(j.message || j.name || 'send failed').slice(0, 200) };
    } catch (e) { return { ok: false, status: 0, error: String(e && e.message || e).slice(0, 200) }; } finally { clearTimeout(t); }
  },
};

/* ---- the safety switch ---- */
export const isLive = () => process.env.EMAIL_LIVE === '1' && process.env.VERCEL_ENV === 'production';   // previews are never live
export const emailReady = () => ({ key: !!process.env.RESEND_API_KEY, store: io.storeOn(), link: linkSecret().length >= 16, live: isLive() });
/* where the buttons and unsubscribe links point: the real site, or this preview copy while testing on one */
export function siteBase() {
  if (process.env.VERCEL_ENV === 'preview') { const h = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL; if (h) return 'https://' + h; }
  return SITE;
}

/* ---- unsubscribe links: signed, so they work without signing in and can't be made up ---- */
const linkSecret = () => process.env.EMAIL_LINK_SECRET || '';
const b64u = b => Buffer.from(b).toString('base64url');
const sign = s => createHmac('sha256', linkSecret()).update('tm-unsub:' + s).digest('base64url').slice(0, 32);
export function unsubToken(userId, type) {
  if (linkSecret().length < 16) return '';
  const body = b64u(`${userId}:${type}`);
  return body + '.' + sign(body);
}
export function readUnsubToken(tok) {
  if (linkSecret().length < 16) return null;
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [userId, type] = Buffer.from(body, 'base64url').toString().split(':');
  return /^[0-9a-f-]{36}$/i.test(userId || '') && hasSwitch(type) ? { userId, type } : null;
}
export const unsubUrl = (userId, type) => `${siteBase()}/api/email/unsub?t=${unsubToken(userId, type)}`;

/* ---- small database helpers ---- */
const uq = v => encodeURIComponent(String(v));
export async function prefsOf(userId) {
  const r = await io.rest(`email_prefs?user_id=eq.${uq(userId)}&select=${SWITCHES.join(',')}`);
  return Array.isArray(r) ? (r[0] || {}) : null;                // null = couldn't read: send nothing
}
export async function setPrefs(userId, flags) {
  const row = { user_id: userId };
  for (const k of SWITCHES) if (k in flags) row[k] = !!flags[k];
  return !!(await io.rest('email_prefs?on_conflict=user_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' }));
}
export async function isBlocked(email) {
  const r = await io.rest(`email_block?email=eq.${uq(String(email).toLowerCase())}&select=email`);
  return Array.isArray(r) ? r.length > 0 : null;
}
export async function blockAddress(email, reason) {
  email = String(email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return false;
  return !!(await io.rest('email_block?on_conflict=email', { method: 'POST', body: { email, reason }, prefer: 'resolution=ignore-duplicates,return=minimal' }));
}
let TEST_TO = null;
async function testAddress() {
  if (process.env.EMAIL_TEST_TO) return process.env.EMAIL_TEST_TO;
  if (TEST_TO) return TEST_TO;
  const r = await io.rest('rpc/email_accounts', { method: 'POST', body: { p_ids: [OWNER_ID] } });
  return (TEST_TO = Array.isArray(r) && r[0] && r[0].email ? r[0].email : null);
}

/* ---- sending ----
   user: { id, email, name }   type: one of TYPES   key: names the event (e.g. "espn:123:2026")   data: the facts
   opts.dry: go through every check but write and send nothing.
   Returns { status, ... }. status is one of:
     sent          it went out
     would_send    dry run: every check passed
     duplicate     already sent (or being sent) once: never again
     pref_off      the person switched this kind off
     capped        they already got one from this group recently: dropped
     empty         the weekly recap had nothing in its switched-on sections
     blocked       the address bounced or complained
     type_off      this kind of email isn't switched on yet
     not_ready     a key, the database or the link secret is missing: nothing sent
     failed        the email service refused it (the record is removed, so the next check can try again) */
export async function sendEmail(user, type, key, data = {}, opts = {}) {
  const T = TYPES[type], live = isLive(), dry = !!opts.dry;
  const out = status => ({ status, type, key, live });
  if (!T || !user || !user.id || !key) return out('bad_request');
  if (T.on === false && !opts.evenIfOff) return out('type_off');
  if (!user.email) return out('no_address');
  if (!io.storeOn()) return out('not_ready');                               // can't check for repeats: send nothing
  if (T.sw && linkSecret().length < 16) return out('not_ready');            // no unsubscribe link: send nothing

  const blocked = await isBlocked(user.email);
  if (blocked === null) return out('not_ready');
  if (blocked) return out('blocked');

  if (T.sw) {
    const prefs = await prefsOf(user.id);
    if (!prefs) return out('not_ready');
    const on = T.sw.filter(k => switchOn(prefs, k));
    if (!on.length) return out('pref_off');
    if (T.sw.length > 1) {                                                 // the weekly recap: only the switched-on sections
      data = { ...data, on: Object.fromEntries(T.sw.map(k => [k, on.includes(k)])) };
      if (!T.sw.some(k => data.on[k] && Array.isArray(data[k]) && data[k].length)) return out('empty');
    }
    // the group's limit: anything from this group sent (or on its way) in the last capH hours uses it up
    const since = new Date(io.now() - T.capH * 3600e3).toISOString();
    const recent = await io.rest(`email_sent?user_id=eq.${uq(user.id)}&live=eq.${live}&type=in.(${groupTypes(T.group).join(',')})&status=in.(sending,sent)&at=gte.${uq(since)}&select=type,key&limit=5`);
    if (!Array.isArray(recent)) return out('not_ready');
    if (recent.some(r => r.type === type && r.key === key)) return out('duplicate');
    if (recent.length) {
      if (!dry) await io.rest('email_sent?on_conflict=user_id,type,key,live', { method: 'POST', body: { user_id: user.id, type, key, live, status: 'capped' }, prefer: 'resolution=ignore-duplicates,return=minimal' });
      return out('capped');
    }
  }

  if (dry) {
    const had = await io.rest(`email_sent?user_id=eq.${uq(user.id)}&type=eq.${uq(type)}&key=eq.${uq(key)}&live=eq.${live}&select=id&limit=1`);
    if (!Array.isArray(had)) return out('not_ready');
    return out(had.length ? 'duplicate' : 'would_send');
  }

  // write it down first. If the row already exists the database returns nothing, and this is a repeat.
  const claim = await io.rest('email_sent?on_conflict=user_id,type,key,live', { method: 'POST', body: { user_id: user.id, type, key, live, status: 'sending' }, prefer: 'resolution=ignore-duplicates,return=representation' });
  if (!Array.isArray(claim)) return out('not_ready');
  if (!claim.length) return out('duplicate');
  const rowId = claim[0].id, undo = () => io.rest(`email_sent?id=eq.${rowId}`, { method: 'DELETE', prefer: 'return=minimal' });

  let to = user.email, subjectTag = '';
  if (!live) {                                                              // test mode: only ever the owner's own inbox
    to = await testAddress();
    if (!to) { await undo(); return out('not_ready'); }
    subjectTag = `[TEST, for ${user.email}] `;
  }
  const un = T.sw ? unsubUrl(user.id, type) : '';
  const m = render(type, data, { base: siteBase(), unsubUrl: un, postal: process.env.EMAIL_POSTAL || '' });
  const from = (T.sw ? process.env.EMAIL_FROM_UPDATES : process.env.EMAIL_FROM_ACCOUNT) || (T.sw ? FROM.updates : FROM.account);
  const msg = {
    from: /</.test(from) ? from : `TradeMetric <${from}>`,
    to: [to], subject: subjectTag + m.subject, html: m.html, text: m.text,
    tags: [{ name: 'type', value: type }, { name: 'mode', value: live ? 'live' : 'test' }],
  };
  msg.reply_to = process.env.EMAIL_REPLY_TO || REPLY;
  if (un) msg.headers = { 'List-Unsubscribe': `<${un}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };

  const idem = createHash('sha256').update([live ? 'live' : 'test', user.id, type, key, rowId].join('|')).digest('hex');
  const r = await io.post(msg, idem);
  if (!r.ok) {
    await undo();
    console.error(`[email] ${type} not sent (${r.error === 'no_key' ? 'no RESEND_API_KEY' : (r.status || 'network') + ' ' + (r.error || '')})`);
    return { ...out(r.error === 'no_key' ? 'not_ready' : 'failed'), error: r.error === 'no_key' ? 'no_key' : r.error };
  }
  await io.rest(`email_sent?id=eq.${rowId}`, { method: 'PATCH', body: { status: 'sent', resend_id: r.id }, prefer: 'return=minimal' });
  console.log(`[email] ${type} sent (${live ? 'live' : 'test mode'})`);
  return { ...out('sent'), id: r.id, to: live ? 'recipient' : 'owner (test mode)' };
}

/* Several emails from the same group due for one person at once: the biggest goes out (championship beats clinch beats recap
   beats the draft reminder) and the rest are dropped by the one-a-day limit.
   list: [{ type, key, data }]. Returns each one's result, biggest first. */
export async function sendBiggest(user, list, opts = {}) {
  const sorted = [...list].sort((a, b) => (TYPES[b.type].rank || 0) - (TYPES[a.type].rank || 0));   // only for one group at a time (the big moments)
  const results = [];
  let used = false;
  for (const c of sorted) {
    if (used && opts.dry) { results.push({ status: 'capped', type: c.type, key: c.key, live: isLive() }); continue; }   // a dry run writes nothing, so say what would happen
    const r = await sendEmail(user, c.type, c.key, c.data, opts);
    if (r.status === 'sent' || r.status === 'would_send') used = true;
    results.push(r);
  }
  return results;
}

export { LABEL };
