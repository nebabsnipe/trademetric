// Push notifications: the server-side helpers behind /api/push.
// Sends real notifications to phones and computers (through each browser's own push service, no third party),
// and decides which injury changes are worth one. Files in /api that start with "_" are helpers, not endpoints.
//
// Needs in Vercel (see docs/push-notifications.md): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// and for the scheduled injury check also SUPABASE_SECRET_KEY and CRON_SECRET.

import { sendNotification } from 'web-push';

const VAPID_PUB = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIV = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://www.trademetric.app';
export const pushOn = () => !!(VAPID_PUB && VAPID_PRIV);
export const vapidPublicKey = () => VAPID_PUB;

/* ---- the rules every notification follows (one place, so they're easy to change) ---- */
export const RULES = {
  quietFrom: 23, quietTo: 8,        // no injury or lineup pushes from 11pm to 8am in the user's time zone
  perHour: 4,                       // at most this many separate notifications per user per hour; extras become one summary
  confirmMin: 10,                   // a change seen by only one feed has to still be there this many minutes later
  maxAgeH: 12,                      // changes older than this are old news (long enough to cover a night of quiet hours)
  defaultTz: 'America/New_York',
};

/* Who gets push at all. During the beta everyone has Pro, so everyone does.
   When paid plans launch, this is the one line to change (for example: return plan === 'pro'). */
export function canPush(/* plan */) { return true; }

/* ---- sending ---- */
/* One notification to one device. Returns 'ok', 'gone' (the push service says this device is no longer
   subscribed: delete it) or 'fail' (a temporary problem: keep the device). Never throws. */
export async function sendOne(sub, payload, { ttl = 4 * 3600, urgency = 'high' } = {}) {
  if (!pushOn()) return 'fail';
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: ttl, urgency, topic: topicOf(payload.tag), timeout: 8000, vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUB, privateKey: VAPID_PRIV } });
    return 'ok';
  } catch (e) {
    const code = e && e.statusCode;
    return code === 404 || code === 410 ? 'gone' : 'fail';
  }
}
/* The push service's own "replace the undelivered one" key: letters, digits, - and _ only, 32 at most. */
function topicOf(tag) { const t = String(tag || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32); return t || undefined; }

/* The same notification to every device a user has. Returns { sent, gone: [device ids to delete] }. */
export async function sendToDevices(subs, payload, opts) {
  const res = await Promise.all(subs.map(s => sendOne(s, payload, opts)));
  return { sent: res.filter(r => r === 'ok').length, gone: subs.filter((s, i) => res[i] === 'gone').map(s => s.id) };
}

/* ---- injury changes: who should hear about what ---- */
export const norm = s => String(s || '').toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const PUSH_ST = new Set(['Q', 'D', 'O', 'IR']);
const SEV = { '': 0, Q: 1, D: 2, O: 3, SUS: 3, PUP: 4, IR: 4 };

/* 11pm to 8am where the user is. An unknown time zone is treated as US Eastern. */
export function isQuiet(tz, now = Date.now()) {
  let h;
  try { h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz || RULES.defaultTz }).format(now); }
  catch { h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: RULES.defaultTz }).format(now); }
  return h >= RULES.quietFrom || h < RULES.quietTo;
}

/* The players on the user's own team in every saved league: { normalized name: { name, team, leagues: [names] } }.
   Also which injury feed this user follows. The site's rule: one consistent source, the user's own platform
   (every league on ESPN -> ESPN's report, otherwise Sleeper's), exactly as statusSrc() does in js/app.js. */
export function userRosters(st, players) {
  const out = {}, types = [];
  const off = new Set((st.notif && st.notif.off) || []);
  const L = Array.isArray(st.leagues) && st.leagues.length ? st.leagues
    : (st.noLeague || !st.teams ? [] : [{ key: st.leagueKey, name: st.league && st.league.name, snap: st }]);
  for (const e of L) {
    const snap = e && e.snap;
    if (!snap || !Array.isArray(snap.teams) || e.src === 'Sample' || e.key === 'sample') continue;
    const type = snap.real && snap.real.src && snap.real.src.type;
    if (type) types.push(type);
    if (off.has(e.key)) continue;                       // "News tab only" leagues stay quiet
    const me = snap.teams.find(T => T && T.id === snap.me);
    if (!me || !Array.isArray(me.players)) continue;
    const extra = Object.fromEntries((snap.extraPlayers || []).map(x => [x.id, x]));
    for (const id of me.players) {
      const p = players[id] || (extra[id] && { n: extra[id].n, t: extra[id].t || '' });
      if (!p || !p.n) continue;
      const k = norm(p.n), o = out[k] = out[k] || { name: p.n, team: p.t || '', leagues: [] };
      const nm = e.name || (snap.league && snap.league.name) || 'your league';
      if (!o.leagues.includes(nm)) o.leagues.push(nm);
    }
  }
  return { roster: out, src: types.length && types.every(t => t === 'espn') ? 'espn' : 'sleeper' };
}

/* Which status changes are real, new and about this user's players.
   log:  rows from status_log (newest last): { src, name, team, was, st, body, at }
   cur:  what each feed says right now: { sleeper: { normName: status } | null, espn: {...} | null }
   Every change has to pass all of these before it can be sent:
     1. it comes from the user's own feed, and it's a change to Questionable, Doubtful, Out or IR
     2. it's the newest change for that player (an older "questionable" isn't sent after he's ruled out)
     3. the feed still says the same thing right now (so a blip that was corrected is dropped)
     4. it's confirmed: either the other feed also lists him as hurt, or it has stayed that way for 10+ minutes,
        which means two separate reads of the feed agree. Never a single unconfirmed data point.
     5. it's less than 12 hours old
   Cleared to play ("in", owner 2026-11-25): a player going from questionable / doubtful / out / IR back to no
   designation is sent too, but only in the run-up to his game (it kicks off within 3 days and hasn't started;
   games: { TEAM: { start, state } }), with the same checks: his feed says healthy now, and either the other feed
   agrees or it has held for 10+ minutes. */
const BACK_FROM = new Set(['Q', 'D', 'O', 'IR', 'PUP', 'SUS']);
export function injuryEvents({ roster, src, log, cur, now = Date.now(), games = null }) {
  const mine = cur[src];
  if (!mine) return [];                                 // the user's feed didn't load this time: say nothing
  const other = cur[src === 'espn' ? 'sleeper' : 'espn'];
  const latest = {};
  for (const r of log) { if (r.src !== src) continue; const k = norm(r.name); if (!roster[k]) continue; if (!latest[k] || r.at >= latest[k].at) latest[k] = r; }
  const out = [];
  for (const [k, r] of Object.entries(latest)) {
    const back = r.st === '' && BACK_FROM.has(r.was || '');
    if ((!PUSH_ST.has(r.st) && !back) || r.st === (r.was || '')) continue;
    const who = roster[k];
    if (who.team && r.team && who.team !== r.team && who.team !== 'FA') continue;   // same name, different player
    const age = now - r.at;
    if (age < 0 || age > RULES.maxAgeH * 3600e3) continue;
    if (back) {
      const g = games && games[r.team || who.team];
      if (!g || g.state !== 'pre' || g.start <= now || g.start - now > 3 * 864e5) continue;   // only before his game
      if (mine[k]) continue;                                                                    // his feed still lists him
      const agree = !!other && !other[k];
      if (!agree && age < RULES.confirmMin * 60e3) continue;
      out.push({ key: `inj:${k}:in:${Math.floor(r.at / (12 * 3600e3))}`, k, name: who.name, team: r.team || who.team, was: r.was || '', st: '', body: '', leagues: who.leagues, at: r.at, kick: g.start });
      continue;
    }
    if (mine[k] !== r.st) continue;
    const both = !!(other && other[k]);
    if (!both && age < RULES.confirmMin * 60e3) continue;
    out.push({ key: `inj:${k}:${r.st}:${Math.floor(r.at / (12 * 3600e3))}`, k, name: who.name, team: r.team || who.team, was: r.was || '', st: r.st, body: r.body || '', leagues: who.leagues, at: r.at });
  }
  return out.sort((a, b) => (SEV[b.st] || 0) - (SEV[a.st] || 0) || b.at - a.at);
}

const ST_WORD = { Q: 'questionable', D: 'doubtful', O: 'out', IR: 'on injured reserve' };
function injTitle(e) {
  if (e.st === '') return e.was === 'IR' || e.was === 'PUP' ? `${e.name} activated: he's in` : `${e.name} is in: cleared to play`;
  if (e.st === 'IR') return `${e.name} placed on injured reserve`;
  const up = e.was && (SEV[e.st] || 0) < (SEV[e.was] || 0);
  return up ? `${e.name} upgraded to ${ST_WORD[e.st]}` : `${e.name} is ${ST_WORD[e.st]}`;
}
const inLeagues = L => L.length === 1 ? L[0] : L.length === 2 ? `${L[0]} and ${L[1]}` : `${L.length} of your leagues`;

/* One notification per player change. The tag is per player, so a later change (questionable, then out)
   replaces the earlier notification on the phone instead of stacking under it. */
export function injuryPayload(e) {
  const bits = [e.team, e.body && !/^(undisclosed|na|n\/a)$/i.test(e.body) ? e.body.toLowerCase() : ''].filter(Boolean).join(' · ');
  if (e.st === '') return { title: injTitle(e), body: `${e.team ? e.team + '. ' : ''}No injury designation for ${new Date(e.kick).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })}'s game. Check your lineup in ${inLeagues(e.leagues)}.`, tag: 'inj-' + e.k.replace(/ /g, '-'), url: '/#team' };
  return { title: injTitle(e), body: `${bits ? bits + '. ' : ''}On your team in ${inLeagues(e.leagues)}.`, tag: 'inj-' + e.k.replace(/ /g, '-'), url: '/#news' };
}
export function summaryPayload(list) {
  const short = e => `${e.name} (${e.st === '' ? 'in' : e.st === 'IR' ? 'IR' : ST_WORD[e.st]})`;
  const shown = list.slice(0, 4).map(short).join(', ');
  return { title: `${list.length} more status changes on your teams`, body: shown + (list.length > 4 ? ` and ${list.length - 4} more` : '') + '.', tag: 'inj-summary', url: '/#news' };
}

/* The rate limit: with `sentLastHour` already out this hour, the first few go as their own notification and the
   rest are batched into one summary. Once the hour's notifications and its summary are both used, anything
   else waits for the next check (hold), so nothing is lost and nobody's phone buzzes all hour. */
export function planSends(events, sentLastHour) {
  if (sentLastHour > RULES.perHour) return { solo: [], rest: [], hold: events };
  const room = Math.max(0, RULES.perHour - sentLastHour);
  return { solo: events.slice(0, room), rest: events.slice(room), hold: [] };
}
