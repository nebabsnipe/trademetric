// Shared server-side store (Supabase), used by /api/live and /api/news so that injury status history, story
// recaps and the league news archive are built once on the server and sent to every visitor, on any device.
//
// Needs two things, both one-time (see README "Shared news store"):
//   1. supabase/shared.sql run in Supabase's SQL Editor
//   2. SUPABASE_SECRET_KEY set in Vercel (Supabase -> Settings -> API Keys -> Secret key)
// Without them every function here quietly does nothing and the site works the way it did before.
// Files in /api that start with "_" are helpers, not endpoints.

import { createHash } from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
export const sharedOn = () => !!KEY;
export const hash = s => createHash('sha1').update(String(s)).digest('hex');

let DOWN_UNTIL = 0, LAST = '';
export const sharedState = () => ({ on: !!KEY, err: LAST || undefined });

/* one REST call. Returns parsed JSON (or true for an empty reply), or null on any failure. Never throws. */
async function rest(path, { method = 'GET', body, prefer, ms = 2500 } = {}) {
  if (!KEY || Date.now() < DOWN_UNTIL) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    // new "sb_secret_" keys go on the apikey header only; the older service_role key is also a bearer token
    const headers = { apikey: KEY, 'content-type': 'application/json' };
    if (!KEY.startsWith('sb_')) headers.authorization = 'Bearer ' + KEY;
    if (prefer) headers.prefer = prefer;
    const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) {
      LAST = `${r.status} ${(await r.text().catch(() => '')).slice(0, 160)}`;
      // tables missing or key rejected: stop asking for five minutes so no request waits on it
      if (r.status === 401 || r.status === 403 || r.status === 404) DOWN_UNTIL = Date.now() + 5 * 60e3;
      return null;
    }
    LAST = '';
    const txt = await r.text();
    return txt ? JSON.parse(txt) : true;
  } catch (e) { LAST = String(e && e.message || e).slice(0, 160); return null; } finally { clearTimeout(t); }
}

/* raw table access for other server functions (push notifications) */
export const sbRest = (path, opt) => rest(path, opt);
export const sbAuthUser = async token => {
  if (!token) return null;
  // the publishable key is public (it's in the page too); the user's own sign-in token proves who they are
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';
  try { const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: pub, authorization: 'Bearer ' + token } }); return r.ok ? await r.json() : null; } catch { return null; }
};

/* ---- small key/value documents ---- */
export async function kvGet(key) {
  const r = await rest(`shared_kv?key=eq.${encodeURIComponent(key)}&select=value,updated_at`);
  return Array.isArray(r) ? (r[0] || { value: null, updated_at: null }) : null;   // null = store unavailable
}
/* Writes a document. With `ifAt` (the updated_at it was read with) the write only lands if nobody else wrote first;
   returns false when it lost that race, so two servers working at once can't both record the same change. */
export async function kvPut(key, value, ifAt) {
  const now = new Date().toISOString();
  if (ifAt === undefined) return !!(await rest('shared_kv?on_conflict=key', { method: 'POST', body: { key, value, updated_at: now }, prefer: 'resolution=merge-duplicates,return=minimal' }));
  if (ifAt === null) return !!(await rest('shared_kv', { method: 'POST', body: { key, value, updated_at: now }, prefer: 'return=minimal' }));   // fails if the row already exists
  const r = await rest(`shared_kv?key=eq.${encodeURIComponent(key)}&updated_at=eq.${encodeURIComponent(ifAt)}`, { method: 'PATCH', body: { value, updated_at: now }, prefer: 'return=representation' });
  return Array.isArray(r) && r.length > 0;
}

/* ---- injury status history ----
   Every time /api/live reads the injury feeds it compares them with the last copy saved here and records what
   changed. The page turns the last week of changes into "ruled out" / "upgraded" cards for the players on your
   rosters, so a brand-new device shows the same history as one that has been open all week. */
const HURT = new Set(['Q', 'D', 'O', 'IR', 'PUP', 'SUS']);
export async function statusTrack(src, list) {
  // list: [[name, team, status, bodyPart]], every player the feed covers (healthy ones with '')
  if (!KEY || !Array.isArray(list) || list.length < (src === 'espn' ? 40 : 300)) return;
  const cur = {};
  for (const [n, t, st, body] of list) if (n && HURT.has(st)) cur[n] = [st, body || '', t || ''];
  const prev = await kvGet('status:' + src);
  if (!prev) return;
  const was = prev.value && prev.value.m;
  if (was) {
    const nWas = Object.keys(was).length, nCur = Object.keys(cur).length;
    if (nWas > 20 && nCur < nWas * .6) return;                    // the feed came back half empty: not news
    const rows = [], at = new Date().toISOString();
    for (const n of new Set([...Object.keys(was), ...Object.keys(cur)])) {
      const a = was[n] ? was[n][0] : '', b = cur[n] ? cur[n][0] : '';
      if (a !== b) rows.push({ src, name: n, team: (cur[n] || was[n])[2] || '', was: a, st: b, body: (cur[n] || was[n])[1] || '', at });
    }
    if (!rows.length) return;
    if (rows.length > 150) { await kvPut('status:' + src, { m: cur }, prev.updated_at); return; }   // a feed reset, not 150 injuries
    if (!(await kvPut('status:' + src, { m: cur }, prev.updated_at))) return;
    await rest('status_log', { method: 'POST', body: rows, prefer: 'return=minimal' });
  } else await kvPut('status:' + src, { m: cur }, prev.updated_at);
}
/* the last `days` of changes, oldest first: [[src, name, team, was, st, body, atMs]] */
export async function statusLog(days = 8) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const r = await rest(`status_log?at=gte.${encodeURIComponent(since)}&select=src,name,team,was,st,body,at&order=at.asc&limit=3000`);
  return Array.isArray(r) ? r.map(x => [x.src, x.name, x.team || '', x.was || '', x.st || '', x.body || '', Date.parse(x.at)]) : null;
}

/* ---- story recaps: written once per story, then read by everyone ---- */
export async function recapsGet(keys) {
  if (!KEY || !keys.length) return {};
  const ids = keys.map(hash), r = await rest(`news_recaps?id=in.(${ids.join(',')})&select=id,recap`);
  const out = {};
  if (Array.isArray(r)) { const by = Object.fromEntries(r.map(x => [x.id, x.recap])); keys.forEach((k, i) => { if (by[ids[i]]) out[k] = by[ids[i]]; }); }
  return out;
}
export async function recapsPut(map) {
  const rows = Object.entries(map).map(([k, recap]) => ({ id: hash(k), recap, at: new Date().toISOString() }));
  if (KEY && rows.length) await rest('news_recaps?on_conflict=id', { method: 'POST', body: rows, prefer: 'resolution=ignore-duplicates,return=minimal' });
}

/* ---- league news archive: outlets only list their newest stories, so keep a week of them ---- */
export async function archiveMerge(key, fresh, { days = 7, max = 400, same } = {}) {
  if (!KEY) return fresh;
  const prev = await kvGet(key);
  if (!prev) return fresh;
  const cut = Date.now() - days * 864e5, seen = new Set(fresh.map(x => x.url)), out = [...fresh];
  for (const x of (prev.value && prev.value.items) || []) {
    if (!x || !x.url || seen.has(x.url) || !(Date.parse(x.at || 0) >= cut)) continue;
    if (same && out.some(o => same(o, x))) continue;
    seen.add(x.url); out.push(x);
  }
  out.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  const items = out.slice(0, max);
  const had = new Set(((prev.value && prev.value.items) || []).map(x => x.url));
  if (items.length !== had.size || items.some(x => !had.has(x.url))) await kvPut(key, { items });
  return items;
}

/* ---- problem reports from visitors' browsers (api/report.js) ---- */
export async function reportPut(row) { if (KEY) await rest('client_reports', { method: 'POST', body: row, prefer: 'return=minimal' }); }
