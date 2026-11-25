// Push notifications, one endpoint (kept to a single file so the site stays under the plan's limit on
// server functions). vercel.json maps the friendly addresses onto it:
//   GET  /api/push/key          the public key a browser needs to subscribe
//   GET  /api/push/devices      this account's devices
//   POST /api/push/subscribe    turn notifications on for this device (signed-in)
//   POST /api/push/unsubscribe  remove a device (this one, or any of the account's by id)
//   POST /api/push/test         send a test notification to every device on the account
//   GET  /api/plan              is the beta on, and does this person have Pro (the code is in api/_plan.js)
//   GET  /api/push/cron         the scheduled check (injuries, trade deadlines, lineup fixes). Needs the CRON_SECRET.
//   POST /api/report            problem reports from the page (moved here from its own file to make room for billing)
//
// Signed-in routes act as the user (their own sign-in token, checked by Supabase), so the database's
// row-level security is what guarantees people only ever see and change their own devices.

import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sharedOn, rest, statusTrack, reportPut } from './_shared.js';
import { injuries, notes, ESPN_ST } from './live.js';
import { weekInfo, alertsFor } from './_alerts.js';
import { withSentry } from './_sentry.js';
import { planRoute, viewerOf } from './_plan.js';
import { pushOn, vapidPublicKey, canPush, sendToDevices, RULES, norm, isQuiet, userRosters, injuryEvents, injuryPayload, summaryPayload, planSends } from './_push.js';

const SUPA = (process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co').replace(/\/+$/, '');
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';   // public by design (same one the page uses)
const SUB_COLS = 'id,endpoint,p256dh,auth,label,tz,created_at,last_used_at';

/* ---- acting as the signed-in user ---- */
const tokenOf = req => { const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); return m ? m[1].trim() : ''; };
async function userOf(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: PUB, authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch { return null; }
}
/* one database call with the user's own token. Returns { ok, status, data }. Never throws. */
async function asUser(token, path, { method = 'GET', body, prefer } = {}) {
  try {
    const headers = { apikey: PUB, authorization: 'Bearer ' + token, 'content-type': 'application/json' };
    if (prefer) headers.prefer = prefer;
    const r = await fetch(`${SUPA}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}
const bodyOf = req => { const b = req.body; if (b && typeof b === 'object') return b; try { return JSON.parse(b || '{}'); } catch { return {}; } };
const publicDevice = d => ({ id: d.id, label: d.label || 'Device', created_at: d.created_at, last_used_at: d.last_used_at });
const NOT_SET_UP = { error: 'not_set_up', message: 'Notifications aren\'t switched on for this site yet.' };

/* Problem reports: each visitor's browser sends a short technical note when something on the site fails to load or
   breaks (see diagSend in js/app.js), so problems on other people's computers can be seen, not guessed at.
   Saved to the client_reports table (supabase/reports.sql), which only the site owner's account can read.
   Holds no league contents, emails or passwords. */
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
async function problemReport(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== 'object' || JSON.stringify(b).length > 20000) return res.status(400).end();
  const row = {
    sid: clip(b.sid, 16),
    uid: /^[0-9a-f-]{36}$/i.test(b.uid || '') ? b.uid : null,          // sent by the page, so a hint, not proof
    username: clip(b.user, 40),
    snap: b.snap && typeof b.snap === 'object' ? b.snap : {},
    notes: Array.isArray(b.notes) ? b.notes.slice(0, 40).map(x => ({ k: clip(x && x.k, 40), m: clip(x && x.m, 300), t: +(x && x.t) || 0 })) : [],
    country: clip(req.headers['x-vercel-ip-country'], 4),
  };
  if (sharedOn()) await reportPut(row);
  return res.status(204).end();
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const act = String((req.query && req.query.do) || '');
  try {
    if (act === 'cron') return await cron(req, res);
    if (act === 'plan') return await planRoute(req, res);
    if (act === 'report') return await problemReport(req, res);
    if (act === 'key') return pushOn() ? res.status(200).json({ key: vapidPublicKey() }) : res.status(503).json(NOT_SET_UP);

    const token = tokenOf(req), user = await userOf(token);
    if (!user) return res.status(401).json({ error: 'signed_out', message: 'Sign in to manage notifications.' });

    if (act === 'devices') {
      const r = await asUser(token, `push_subscriptions?select=id,label,created_at,last_used_at&order=last_used_at.desc`);
      if (!r.ok) return res.status(r.status === 404 ? 503 : 502).json(r.status === 404 ? NOT_SET_UP : { error: 'db' });
      return res.status(200).json({ devices: (r.data || []).map(publicDevice) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
    const b = bodyOf(req);

    if (act === 'subscribe') {
      if (!pushOn()) return res.status(503).json(NOT_SET_UP);
      if (!(await viewerOf(req)).pro) return res.status(403).json({ error: 'pro_required', message: 'Notifications are part of TradeMetric Pro.' });
      const s = b.subscription || {}, k = s.keys || {};
      if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !k.p256dh || !k.auth) return res.status(400).json({ error: 'bad_subscription' });
      const r = await asUser(token, 'rpc/push_claim', { method: 'POST', body: { p_endpoint: s.endpoint, p_p256dh: String(k.p256dh), p_auth: String(k.auth), p_label: String(b.label || '').slice(0, 60), p_tz: String(b.tz || '').slice(0, 60) } });
      if (!r.ok) return res.status(r.status === 404 ? 503 : 400).json(r.status === 404 ? NOT_SET_UP : { error: 'db' });
      return res.status(200).json({ ok: true, id: r.data });
    }
    if (act === 'unsubscribe') {
      const f = b.id ? `id=eq.${encodeURIComponent(String(b.id))}` : b.endpoint ? `endpoint=eq.${encodeURIComponent(String(b.endpoint))}` : '';
      if (!f) return res.status(400).json({ error: 'which' });
      const r = await asUser(token, `push_subscriptions?${f}`, { method: 'DELETE', prefer: 'return=minimal' });   // row-level security: only ever the user's own
      return res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true } : { error: 'db' });
    }
    if (act === 'test') {
      if (!pushOn()) return res.status(503).json(NOT_SET_UP);
      if (!(await viewerOf(req)).pro) return res.status(403).json({ error: 'pro_required', message: 'Notifications are part of TradeMetric Pro.' });
      const r = await asUser(token, `push_subscriptions?select=${SUB_COLS}`);
      if (!r.ok) return res.status(502).json({ error: 'db' });
      const subs = r.data || [];
      if (!subs.length) return res.status(200).json({ ok: true, sent: 0, devices: 0 });
      const out = await sendToDevices(subs, { title: 'TradeMetric notifications are on', body: 'This is a test. Alerts about your players will show up like this.', tag: 'test', url: '/#account-notifications' }, { ttl: 600 });
      if (out.gone.length) await asUser(token, `push_subscriptions?id=in.(${out.gone.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' });
      return res.status(200).json({ ok: true, sent: out.sent, devices: subs.length, removed: out.gone.length });
    }
    return res.status(404).json({ error: 'unknown' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
}

/* ================= the scheduled injury check =================
   Runs every 15 minutes or so with nobody on the site. It reads the injury feeds, records what changed (the same
   status_log the News tab reads), then sends each confirmed change to the people who have that player on a saved
   roster and have the Injuries switch on. Every rule (confirmation, no repeats, quiet hours, the hourly limit)
   lives in api/_push.js. Add ?dry=1 to see what it would send without sending anything. */
function secretOk(req) {
  const want = process.env.CRON_SECRET || '';
  if (want.length < 16) return false;
  const got = tokenOf(req) || String(req.headers['x-cron-secret'] || '');
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

let PLAYERS = null;
async function playerNames(req) {
  if (PLAYERS) return PLAYERS;
  let d = null;
  try { d = JSON.parse(await readFile(new URL('../data/nfl.json', import.meta.url), 'utf8')); } catch {}
  if (!d) { try { const r = await fetch(`https://${req.headers.host}/data/nfl.json`); if (r.ok) d = await r.json(); } catch {} }
  if (!d || !Array.isArray(d.players)) return null;
  const m = {};
  for (const p of d.players) m[p[0]] = { n: p[1], t: p[3] };
  for (const k of d.k || []) m[k[0]] = { n: k[1], t: k[2] };
  return PLAYERS = m;
}

const inList = ids => `in.(${ids.map(x => encodeURIComponent(`"${String(x).replace(/["\\]/g, '')}"`)).join(',')})`;
const STATE_COLS = ['acct', 'notif', 'leagues', 'teams', 'me', 'real', 'league', 'leagueKey', 'extraPlayers', 'noLeague'].map(k => `${k}:state->${k}`).join(',');

async function cron(req, res) {
  if (!secretOk(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!pushOn() || !sharedOn()) return res.status(503).json({ error: 'not_set_up', push: pushOn(), store: sharedOn() });
  const dry = !!(req.query && req.query.dry), now = Date.now(), stats = { users: 0, devices: 0, events: 0, sent: 0, summaries: 0, quiet: 0, held: 0, removed: 0 };

  // 1. read both injury feeds and record what changed, exactly as /api/live does when someone has the site open
  const [inj, note] = await Promise.all([injuries().catch(() => null), notes().catch(() => null)]);
  const espnList = note ? note.map(x => [x.n, x.t, ESPN_ST(x.st), x.type || '']) : null;
  await Promise.all([inj ? statusTrack('sleeper', inj) : null, espnList ? statusTrack('espn', espnList) : null]);
  const mapOf = (list, min) => { if (!list || list.length < min) return null; const m = {}; for (const [n, , st] of list) if (n && st) m[norm(n)] = st; return m; };
  const cur = { sleeper: mapOf(inj, 300), espn: mapOf(espnList, 40) };

  // 2. everyone with at least one device
  const subs = await rest(`push_subscriptions?select=user_id,${SUB_COLS}&order=last_used_at.desc&limit=5000`, { ms: 8000 });
  if (!Array.isArray(subs)) return res.status(502).json({ error: 'db' });
  const byUser = {};
  for (const s of subs) (byUser[s.user_id] = byUser[s.user_id] || []).push(s);
  const uids = Object.keys(byUser);
  stats.users = uids.length; stats.devices = subs.length;
  if (!uids.length) return res.status(200).json({ ok: true, ...stats });

  // 3. the recent changes, and what has already been sent
  const since = new Date(now - RULES.maxAgeH * 3600e3).toISOString();
  const [logRows, players] = await Promise.all([
    rest(`status_log?at=gte.${encodeURIComponent(since)}&select=src,name,team,was,st,body,at&order=at.asc&limit=3000`, { ms: 8000 }),
    playerNames(req),
  ]);
  if (!Array.isArray(logRows) || !players) return res.status(502).json({ error: 'data' });
  const log = logRows.map(r => ({ ...r, at: Date.parse(r.at) }));
  const anyInj = log.length > 0;
  // trade deadlines and lineup fixes (api/_alerts.js): this week's games, read once for everyone
  const W = await weekInfo(now);
  stats.deadline = 0; stats.lineup = 0;

  const preview = [];
  for (let i = 0; i < uids.length; i += 40) {
    const chunk = uids.slice(i, i + 40);
    const [states, sentRows, plans, oldRows] = await Promise.all([
      rest(`user_state?user_id=${inList(chunk)}&select=user_id,${STATE_COLS}`, { ms: 8000 }),
      rest(`push_sent?user_id=${inList(chunk)}&sent_at=gte.${encodeURIComponent(new Date(now - 26 * 3600e3).toISOString())}&select=user_id,key,kind,sent_at&limit=5000`, { ms: 8000 }),
      rest(`profiles?id=${inList(chunk)}&select=id,plan`, { ms: 8000 }),
      // deadline and lineup notices: what was already sent in the last 8 days (their stages and weeks last longer than a day)
      W ? rest(`push_sent?user_id=${inList(chunk)}&kind=in.(dl,lineup)&sent_at=gte.${encodeURIComponent(new Date(now - 8 * 864e5).toISOString())}&select=user_id,key&limit=5000`, { ms: 8000 }) : [],
    ]);
    if (!Array.isArray(states) || !Array.isArray(sentRows)) continue;      // can't check for repeats: send nothing
    const planOf = Object.fromEntries((Array.isArray(plans) ? plans : []).map(p => [p.id, p.plan]));
    for (const st of states) {
      const uid = st.user_id, devices = byUser[uid];
      if (!canPush(planOf[uid])) continue;
      const offKinds = (st.acct && st.acct.push && st.acct.push.off) || [];
      const mineSent = sentRows.filter(r => r.user_id === uid), had = new Set(mineSent.map(r => r.key));
      if (Array.isArray(oldRows)) oldRows.forEach(r => { if (r.user_id === uid) had.add(r.key); });
      const { roster, src } = userRosters(st, players);
      const events = anyInj && !offKinds.includes('inj') ? injuryEvents({ roster, src, log, cur, now, games: W && W.games }).filter(e => !had.has(e.key)) : [];   // the Injuries switch
      if (isQuiet(devices[0].tz, now)) { stats.quiet += events.length; continue; }               // everything waits until 8am
      // deadline notices and lineup fixes go out as their own notifications (one per league at most)
      const extraJobs = W ? (await alertsFor(st, W, devices[0].tz, offKinds, had)).filter(a => a.keys.some(k => !had.has(k))) : [];
      if (!events.length && !extraJobs.length) continue;
      stats.events += events.length;
      const lastHour = mineSent.filter(r => r.kind !== 'test' && now - Date.parse(r.sent_at) < 3600e3).length;
      const { solo, rest: extra, hold } = planSends(events, lastHour + extraJobs.length);
      stats.held += hold.length;
      const jobs = extraJobs.map(a => ({ keys: a.keys.filter(k => !had.has(k)).map(key => ({ key })), kind: a.kind, payload: a.payload }));
      if (lastHour > RULES.perHour + 1) jobs.length = 0;                                              // over the hourly limit: wait for the next check
      jobs.push(...solo.map(e => ({ keys: [e], kind: 'inj', payload: injuryPayload(e) })));
      if (extra.length) jobs.push({ keys: extra, kind: extra.length > 1 ? 'summary' : 'inj', payload: extra.length > 1 ? summaryPayload(extra) : injuryPayload(extra[0]) });
      for (const job of jobs) {
        if (dry) { preview.push({ user: uid.slice(0, 8), ...job.payload }); continue; }
        // write down that it's being sent BEFORE sending: if two checks ever overlap, only the one whose
        // record lands sends it, so the same event can't go out twice
        const rows = job.keys.map(e => ({ user_id: uid, key: e.key, kind: job.kind }));
        const landed = await rest('push_sent?on_conflict=user_id,key', { method: 'POST', body: rows, prefer: 'resolution=ignore-duplicates,return=representation' });
        if (!Array.isArray(landed) || landed.length !== rows.length) continue;
        const out = await sendToDevices(devices, job.payload);
        stats.sent += out.sent ? 1 : 0; if (job.kind === 'summary') stats.summaries++; if (out.sent && job.kind === 'dl') stats.deadline++; if (out.sent && job.kind === 'lineup') stats.lineup++;
        if (out.gone.length) { stats.removed += out.gone.length; await rest(`push_subscriptions?id=${inList(out.gone)}`, { method: 'DELETE', prefer: 'return=minimal' }); }
        // nothing got through (a temporary problem at the push service): forget it so the next check tries again
        if (!out.sent && out.gone.length < devices.length) await rest(`push_sent?user_id=eq.${uid}&key=${inList(rows.map(r => r.key))}`, { method: 'DELETE', prefer: 'return=minimal' });
      }
    }
  }
  return res.status(200).json({ ok: true, ...stats, ...(dry ? { dry: true, preview } : {}) });
}

export default withSentry(handler, 'push');
