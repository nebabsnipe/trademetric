// Email, one endpoint (the hosting plan allows 12 server functions and this is number 12).
// vercel.json maps the friendly addresses onto it:
//   POST /api/email/welcome   the welcome email, asked for by the page right after someone's first sign-in
//   GET  /api/email/unsub     the page an unsubscribe link opens (no sign-in needed; the link is signed)
//   POST /api/email/unsub     flips the switch: that page's own request, and the mail app's one-click button
//   POST /api/email/hook      Resend tells us about a hard bounce or a spam complaint: stop emailing that address
//   GET  /api/email/cron      the daily check (broken leagues, clinches, titles, the August draft reminder).
//                             Needs the CRON_SECRET. Add ?dry=1 to see what it concludes without sending.
//   GET  /api/email/test      try things by hand: needs the CRON_SECRET, or on a preview the EMAIL_TEST_KEY
//
// Every send goes through sendEmail() in api/_email.js (switches, no repeats, one a day, the safety switch).
// This file answers in the web-standard style (Request in, Response out) so the bounce report's signature
// can be checked against the exact bytes Resend sent.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { leaguesOf } from './_alerts.js';
import { reportIssue } from './_sentry.js';
import { verdict, getJson } from './_league_check.js';
import { render, SAMPLE, TEMPLATES, LABEL } from './_email_templates.js';
import { io, TYPES, BIG, sendEmail, sendBiggest, emailReady, isLive, readUnsubToken, unsubUrl, setPrefs, prefsOf, blockAddress, siteBase } from './_email.js';

const SUPA = (process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co').replace(/\/+$/, '');
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';   // public by design (same one the page uses)
const OWNER_ID = '1cf5c595-1619-4ffc-bb69-b042382443f3';
const H = 3600e3, D = 24 * H;
const RULES = {
  welcomeDays: 14,        // only accounts this new get a welcome (so nobody who joined long ago gets one late)
  syncHours: 48,          // a league has to fail for this long, in a row, before the "stopped updating" email
  syncChecks: 3,          // ...and on at least this many separate checks
  confirmHours: 20,       // a clinch or title has to hold on two checks at least this far apart
  draftIdleDays: 30,      // the August reminder only goes to accounts unused for this long
  draftFromDay: 10,       // ...from August 10
};

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const bearer = req => { const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || ''); return m ? m[1].trim() : ''; };
const cronOk = req => { const want = process.env.CRON_SECRET || ''; return want.length >= 16 && safeEq(bearer(req) || req.headers.get('x-cron-secret') || '', want); };
const testOk = (req, q) => cronOk(req) || (process.env.VERCEL_ENV === 'preview' && (process.env.EMAIL_TEST_KEY || '').length >= 16 && safeEq(q.get('k') || '', process.env.EMAIL_TEST_KEY));
const uq = v => encodeURIComponent(String(v));

async function userOf(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: PUB, authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch { return null; }
}
async function accounts(ids) {
  const r = await io.rest('rpc/email_accounts', { method: 'POST', body: ids ? { p_ids: ids } : {}, ms: 8000 });
  return Array.isArray(r) ? r : null;
}

async function route(req) {
  const u = new URL(req.url, 'https://www.trademetric.app'), q = u.searchParams;
  const act = q.get('do') || (/\/api\/email\/([a-z]+)\/?$/.exec(u.pathname) || [])[1] || '';
  if (act === 'unsub') return unsub(req, q);
  if (act === 'hook') return req.method === 'POST' ? hook(req) : json(405, { error: 'method' });
  if (act === 'welcome') return req.method === 'POST' ? welcome(req) : json(405, { error: 'method' });
  if (act === 'cron') {
    if (!cronOk(req)) return json(401, { error: 'unauthorized' });
    const out = await runCron({ dry: q.get('dry') === '1' });
    if (out.sendFailed) await reportIssue('Email: a send failed in the daily check', { route: 'email', tags: { kind: 'email_failed' } });
    return json(out.error ? 503 : 200, out);
  }
  if (act === 'test') return testOk(req, q) ? test(q) : json(401, { error: 'unauthorized' });
  return json(404, { error: 'unknown' });
}

/* ================= welcome =================
   The page asks for it after a first sign-in. Who it goes to comes from the sign-in token (checked by Supabase),
   never from anything the page says. Old accounts are skipped and the send record makes it once-only. */
async function welcome(req) {
  const user = await userOf(bearer(req));
  if (!user || !user.email) return json(401, { error: 'signed_out' });
  if (!user.email_confirmed_at && !user.confirmed_at) return json(200, { status: 'unconfirmed' });
  if (io.now() - Date.parse(user.created_at) > RULES.welcomeDays * D) return json(200, { status: 'not_new' });
  const acc = await accounts([user.id]);
  const name = (acc && acc[0] && acc[0].username) || (user.user_metadata && user.user_metadata.username) || '';
  const r = await sendEmail({ id: user.id, email: user.email, name }, 'welcome', 'welcome', { name });
  if (r.status === 'failed') await reportIssue('Email: welcome failed to send', { route: 'email', tags: { kind: 'email_failed', email_type: 'welcome' }, extra: { error: r.error } });
  return json(200, { status: r.status });
}

/* ================= unsubscribe =================
   The link in every big-moment email. Signed, so it works signed out and can't be guessed. Opening it shows a
   small page that turns that kind of email off (one click, no form) and offers "turn off all" and "undo".
   Mail apps' own unsubscribe button posts straight here (the List-Unsubscribe headers). */
async function unsub(req, q) {
  const tok = readUnsubToken(q.get('t'));
  if (req.method === 'POST') {
    if (!tok) return json(400, { error: 'bad_link' });
    const all = q.get('all') === '1', on = q.get('on') === '1';
    const flags = Object.fromEntries((all ? BIG : [tok.type]).map(k => [k, on]));
    const ok = await setPrefs(tok.userId, flags);
    return json(ok ? 200 : 503, ok ? { ok: true, type: tok.type, label: LABEL[tok.type], all, on } : { error: 'try_again' });
  }
  if (req.method !== 'GET') return json(405, { error: 'method' });
  return new Response(unsubPage(tok), { status: tok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
function unsubPage(tok) {
  const label = tok ? LABEL[tok.type] : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark">
<title>Email settings · TradeMetric</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Kanit:ital,wght@1,800&display=swap">
<style>
:root{--bg:#F4F5F7;--card:#fff;--ink:#0B0C0E;--mut:#4A4F57;--line:#E2E4E8;--acc:#FF4F12;--acc-ink:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#050607;--card:#0F1113;--ink:#F2F3F5;--mut:#B4B9C1;--line:#22262A;--acc:#FF6A33;--acc-ink:#170700}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px 16px}
main{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.wm{display:block;background:#0B0C0E;padding:20px 28px;font:italic 800 22px/1 Kanit,"Arial Black",Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#fff;text-decoration:none}.wm span{color:#FF4F12}
.in{padding:28px}h1{margin:0 0 10px;font-size:22px;line-height:1.25;letter-spacing:-.01em}p{margin:0 0 14px;color:var(--mut)}
.acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
button,.btn{font:600 15px/1.2 inherit;font-family:inherit;padding:12px 18px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;text-decoration:none}
button.pri{background:var(--acc);border-color:var(--acc);color:var(--acc-ink)}button:disabled{opacity:.55;cursor:default}
button:focus-visible,.btn:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
@media (max-width:480px){.in{padding:22px}.acts>*{flex:1 1 100%;text-align:center}}
</style></head><body><main>
<a class="wm" href="${siteBase()}">TRADE<span>METRIC</span></a>
<div class="in">${tok ? `
<h1 id="h" aria-live="polite">One moment...</h1>
<p id="p">Turning off ${label} emails.</p>
<div class="acts" id="acts" hidden><button type="button" id="all">Turn off all of these emails</button><button type="button" id="undo">Turn ${label} emails back on</button></div>
<noscript><form method="post"><p>Press the button to stop ${label} emails.</p><button class="pri" type="submit">Unsubscribe</button></form></noscript>
<script>
(function(){var label=${JSON.stringify(label)},h=document.getElementById('h'),p=document.getElementById('p'),acts=document.getElementById('acts'),all=document.getElementById('all'),undo=document.getElementById('undo');
function send(extra,done){all.disabled=undo.disabled=true;fetch(location.pathname+location.search+extra,{method:'POST',headers:{'x-tm':'1'}}).then(function(r){return r.ok?r.json():Promise.reject()}).then(function(j){all.disabled=undo.disabled=false;done(j)}).catch(function(){all.disabled=undo.disabled=false;h.textContent='That didn\\'t work';p.textContent='Please try the link again in a minute. Nothing was changed.'})}
function off(){h.textContent='You\\'re unsubscribed';p.textContent='You won\\'t get '+label+' emails anymore. Account emails, like sign-in codes, are still sent.';acts.hidden=false;all.hidden=false;undo.hidden=false;undo.textContent='Turn '+label+' emails back on'}
all.onclick=function(){send('&all=1',function(){h.textContent='All of these emails are off';p.textContent='You won\\'t get playoff, championship, recap or draft season emails. Account emails, like sign-in codes, are still sent. You can turn any of them back on in your account.';all.hidden=true;undo.hidden=true})};
undo.onclick=function(){send('&on=1',function(){h.textContent='Back on';p.textContent='You\\'ll keep getting '+label+' emails.';all.hidden=true;undo.hidden=true})};
send('',off)})();
</script>` : `
<h1>This link didn't work</h1>
<p>The unsubscribe link is incomplete or out of date. You can change which emails you get in your account.</p>
<div class="acts"><a class="btn" href="${siteBase()}/#account-leagues">Open email settings</a></div>`}
</div></main></body></html>`;
}

/* ================= bounces and spam complaints (Resend webhook) =================
   Resend signs each report (Svix format): HMAC-SHA256 of "id.timestamp.body" with RESEND_WEBHOOK_SECRET.
   A hard bounce or a complaint puts the address on the block list, and sendEmail() never writes to it again. */
function hookSigned(req, raw) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || '';
  const id = req.headers.get('svix-id') || '', ts = req.headers.get('svix-timestamp') || '', sigs = req.headers.get('svix-signature') || '';
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(io.now() / 1000 - +ts) > 5 * 60) return false;                    // old or replayed
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return sigs.split(' ').some(s => { const [v, sig] = s.split(','); return v === 'v1' && sig && safeEq(sig, want); });
}
async function hook(req) {
  const raw = await req.text();
  if (!process.env.RESEND_WEBHOOK_SECRET) return json(503, { error: 'not_set_up' });
  if (!hookSigned(req, raw)) return json(401, { error: 'bad_signature' });
  let ev; try { ev = JSON.parse(raw); } catch { return json(400, { error: 'bad_json' }); }
  const d = ev.data || {}, type = ev.type || '';
  const hard = type === 'email.bounced' && !/transient|temporary|soft/i.test(String((d.bounce && d.bounce.type) || 'Permanent'));
  const reason = type === 'email.complained' ? 'complaint' : hard ? 'bounce' : '';
  if (!reason) return json(200, { ok: true, ignored: type });
  const tags = Array.isArray(d.tags) ? Object.fromEntries(d.tags.map(t => [t.name, t.value])) : (d.tags || {});
  if (tags.mode === 'test') return json(200, { ok: true, ignored: 'test send' });   // a test-mode email is addressed to the owner, not the person it was written for
  const to = (Array.isArray(d.to) ? d.to : [d.to]).filter(Boolean);
  let n = 0;
  for (const a of to) if (await blockAddress(String(a).replace(/^.*<([^>]+)>.*$/, '$1'), reason)) n++;
  console.log(`[email] ${reason}: ${n} address${n === 1 ? '' : 'es'} blocked`);
  return json(n === to.length ? 200 : 503, { ok: n === to.length, blocked: n });
}

/* ================= the daily check =================
   Reads every saved league from its own platform and decides, per account:
     - a league that can't be read for 48 hours in a row       -> "your league stopped updating" (once per breakage)
     - a playoff spot that is mathematically locked            -> clinch email
     - a finished championship game the league says they won   -> championship email
     - in August, an account unused for 30+ days               -> the draft season reminder (once a year)
   A clinch or a title is only sent once two checks, a day apart, both say so (email_watch). */
const seasonAt = now => { const d = new Date(now); return d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; };   // Jan and Feb still belong to last season
const inWindow = (now, season, from, to) => now >= Date.UTC(season, from[0] - 1, from[1]) && now <= Date.UTC(season + (to[2] || 0), to[0] - 1, to[1]);
const STATE_COLS = ['leagues', 'real', 'league', 'leagueKey', 'me', 'noLeague'].map(k => `${k}:state->${k}`).join(',');
const dayName = ms => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(ms);

async function runCron({ dry = false, only = null, get = getJson } = {}) {
  const now = io.now(), season = seasonAt(now), ready = emailReady();
  const stats = { ok: true, dry, live: isLive(), ready, season, accounts: 0, leagues: 0, sent: 0, results: [], conclusions: [] };
  if (!ready.store) return { ...stats, ok: false, error: 'not_set_up' };
  const [accs, states, watches] = await Promise.all([
    accounts(only),
    io.rest(`user_state?select=user_id,${STATE_COLS}&limit=5000${only ? `&user_id=in.(${only.map(uq).join(',')})` : ''}`, { ms: 8000 }),
    io.rest('email_watch?select=user_id,kind,key,since,seen&limit=10000', { ms: 8000 }),
  ]);
  if (!accs || !Array.isArray(states) || !Array.isArray(watches)) return { ...stats, ok: false, error: 'db' };
  const stateOf = Object.fromEntries(states.map(s => [s.user_id, s]));
  const W = new Map(watches.map(w => [`${w.user_id}|${w.kind}|${w.key}`, w]));
  const memo = new Map(), look = lg => { const k = `${lg.type}:${lg.id}:${lg.rid}`; if (!memo.has(k)) memo.set(k, verdict(lg, season, get)); return memo.get(k); };

  /* seen again: returns the watch as it now stands. gone: forget it. Neither writes anything on a dry run. */
  const seen = async (uid, kind, key, note) => {
    const k = `${uid}|${kind}|${key}`, w = W.get(k);
    if (w) { const nw = { ...w, seen: w.seen + 1 }; if (!dry) await io.rest(`email_watch?user_id=eq.${uid}&kind=eq.${kind}&key=eq.${uq(key)}`, { method: 'PATCH', body: { seen: nw.seen, last_at: new Date(now).toISOString(), note }, prefer: 'return=minimal' }); W.set(k, nw); return nw; }
    const nw = { user_id: uid, kind, key, since: new Date(now).toISOString(), seen: 1 };
    if (!dry) await io.rest('email_watch?on_conflict=user_id,kind,key', { method: 'POST', body: { ...nw, last_at: nw.since, note }, prefer: 'resolution=ignore-duplicates,return=minimal' });
    W.set(k, nw); return nw;
  };
  const gone = async (uid, kind, key) => { const k = `${uid}|${kind}|${key}`; if (!W.has(k)) return; W.delete(k); if (!dry) await io.rest(`email_watch?user_id=eq.${uid}&kind=eq.${kind}&key=eq.${uq(key)}`, { method: 'DELETE', prefer: 'return=minimal' }); };
  const note = (uid, r) => { stats.results.push({ user: uid.slice(0, 8), type: r.type, key: r.key, status: r.status }); if (r.status === 'sent') stats.sent++; if (r.status === 'failed') stats.sendFailed = true; };

  for (const a of accs) {
    if (!a.confirmed) continue;
    stats.accounts++;
    const user = { id: a.id, email: a.email, name: a.username || '' }, st = stateOf[a.id], big = [];
    const leagues = st && !st.noLeague ? leaguesOf(st).filter(l => l.key && l.id && (l.type === 'sleeper' || l.type === 'espn')) : [];
    for (const lg of leagues) {
      const say = c => stats.conclusions.push({ user: a.id.slice(0, 8), league: lg.name, ...c });
      if (lg.type === 'espn' && lg.priv) { say({ result: 'skipped', why: 'A private league: its login codes stay in the person\'s browser, so the server can\'t read it.' }); continue; }
      if (!lg.rid) { say({ result: 'skipped', why: 'Which team is theirs isn\'t saved for this league.' }); continue; }
      stats.leagues++;
      const v = await look(lg), eventKey = `${lg.key}:${season}`;
      if (!v.ok) {
        if (!v.gone) { say({ result: 'no answer', why: 'The league platform didn\'t answer this time. Not counted as broken.' }); continue; }
        const w = await seen(a.id, 'sync', lg.key, String(v.status)), hours = (now - Date.parse(w.since)) / H;
        const due = w.seen >= RULES.syncChecks && hours >= RULES.syncHours;
        say({ result: 'cannot be read', why: `The platform says this league isn't available (${v.status}). Failed ${w.seen} check${w.seen === 1 ? '' : 's'} in a row over ${Math.round(hours)} hours.`, email: due ? 'sync_broke' : 'not yet (needs 48 hours)' });
        if (due) note(a.id, await sendEmail(user, 'sync_broke', `${lg.key}:${w.since.slice(0, 10)}`, { league: lg.name, since: dayName(Date.parse(w.since)) }, { dry }));
        continue;
      }
      await gone(a.id, 'sync', lg.key);
      const data = { league: lg.name || v.league, team: v.team, wins: v.wins, losses: v.losses, ties: v.ties, season, final: !!v.final, score: v.score };
      for (const [kind, yes, win] of [['clinch', v.clinched, [[10, 1], [1, 10, 1]]], ['champ', v.champion, [[12, 1], [1, 31, 1]]]]) {
        if (!yes) { await gone(a.id, kind, eventKey); continue; }
        if (!inWindow(now, season, win[0], win[1])) continue;                    // long after the fact (a league imported months later): old news
        if (kind === 'clinch' && v.playoffsUnderway) continue;                   // the playoffs are already being played: a clinch email now would be old news
        const w = await seen(a.id, kind, eventKey, ''), hours = (now - Date.parse(w.since)) / H;
        if (w.seen >= 2 && hours >= RULES.confirmHours) big.push({ type: kind, key: eventKey, data });
      }
      say({ result: v.champion ? 'champion' : v.clinched ? 'clinched' : 'no clinch, no title', team: v.team, facts: v.facts,
        email: big.filter(b => b.key === eventKey).map(b => b.type).join(', ') || (v.champion || v.clinched ? 'waiting for a second check a day later' : 'none') });
    }
    // the August draft reminder: once a year, only to accounts that haven't been used in a month
    const d = new Date(now);
    if (d.getUTCMonth() === 7 && d.getUTCDate() >= RULES.draftFromDay) {
      const last = Math.max(Date.parse(a.last_sign_in_at || 0) || 0, Date.parse(a.state_at || 0) || 0, Date.parse(a.created_at || 0) || 0);
      if (now - last >= RULES.draftIdleDays * D) big.push({ type: 'draft', key: `draft:${d.getUTCFullYear()}`, data: { season: d.getUTCFullYear() } });
    }
    if (big.length) for (const r of await sendBiggest(user, big, { dry })) note(a.id, r);
  }
  return stats;
}

/* ================= trying things by hand =================
   /api/email/test?what=...   Everything here sends to the owner's own account, through the same sendEmail().
     status                         what's set up
     send&type=clinch&key=abc       one email (key names the event: the same key twice proves "never twice")
     biggest&types=clinch,champ     two due at once: the bigger one sends, the other is dropped
     check&league=espn:123          what the clinch / title check concludes for the owner's saved league, and why
     cron&dry=1                     the whole daily check, without sending or writing anything
     unsub&type=clinch              the owner's unsubscribe link for that kind
     click&type=clinch              makes the same signed-out request that clicking that link makes
     reset                          forget the owner's test-mode send records, so tests can be run again */
async function test(q) {
  const what = q.get('what') || 'status';
  if (what === 'status') return json(200, { ...emailReady(), env: process.env.VERCEL_ENV || 'local', hook: !!process.env.RESEND_WEBHOOK_SECRET, types: TYPES });
  if (what === 'render') { const t = q.get('type') || 'welcome'; if (!TEMPLATES.includes(t)) return json(400, { error: 'type' }); return new Response(render(t, SAMPLE[t], { base: siteBase(), unsubUrl: LABEL[t] ? unsubUrl(OWNER_ID, t) : '' }).html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
  const acc = await accounts([OWNER_ID]);
  if (!acc || !acc[0]) return json(503, { error: 'not_set_up', detail: 'Run supabase/emails.sql and check SUPABASE_SECRET_KEY.' });
  const owner = { id: OWNER_ID, email: acc[0].email, name: acc[0].username || '' };
  const sendOpts = { evenIfOff: q.get('force') === '1', dry: q.get('dry') === '1' };
  if (what === 'send') {
    const t = q.get('type') || '';
    if (!TYPES[t]) return json(400, { error: 'type', types: Object.keys(TYPES) });
    return json(200, await sendEmail(owner, t, q.get('key') || 'test', { ...SAMPLE[t], ...(t === 'welcome' ? { name: owner.name } : {}) }, sendOpts));
  }
  if (what === 'biggest') {
    const types = (q.get('types') || 'clinch,champ').split(',').filter(t => TYPES[t] && TYPES[t].big);
    return json(200, { results: await sendBiggest(owner, types.map(t => ({ type: t, key: q.get('key') || 'test', data: SAMPLE[t] })), sendOpts) });
  }
  if (what === 'prefs') return json(200, { prefs: await prefsOf(OWNER_ID) });
  if (what === 'unsub') { const t = q.get('type') || 'clinch'; return TYPES[t] && TYPES[t].big ? json(200, { url: unsubUrl(OWNER_ID, t) }) : json(400, { error: 'type' }); }
  if (what === 'click') {                                                    // exactly what clicking the link does: the same signed-out request the unsubscribe page makes
    const t = q.get('type') || 'clinch'; if (!TYPES[t] || !TYPES[t].big) return json(400, { error: 'type' });
    const u = new URL(unsubUrl(OWNER_ID, t)); if (q.get('all') === '1') u.searchParams.set('all', '1'); if (q.get('on') === '1') u.searchParams.set('on', '1');
    const r = await unsub(new Request(u, { method: 'POST' }), u.searchParams);
    return json(200, { clicked: u.pathname, answer: await r.json(), prefsNow: await prefsOf(OWNER_ID) });
  }
  if (what === 'reset') { await io.rest(`email_sent?user_id=eq.${OWNER_ID}&live=eq.false`, { method: 'DELETE', prefer: 'return=minimal' }); return json(200, { ok: true }); }
  if (what === 'cron') return json(200, await runCron({ dry: true, only: q.get('all') === '1' ? null : [OWNER_ID] }));
  if (what === 'check') {
    const st = await io.rest(`user_state?user_id=eq.${OWNER_ID}&select=${STATE_COLS}`, { ms: 8000 });
    const want = q.get('league') || '', mine = Array.isArray(st) && st[0] ? leaguesOf(st[0]) : [];
    const lg = mine.find(l => l.key === want) || mine.find(l => l.type && l.id);
    if (!lg) return json(404, { error: 'no_league', detail: 'That league isn\'t saved on the owner\'s account.' });
    const season = +q.get('season') || seasonAt(io.now()), v = await verdict({ ...lg, rid: q.get('rid') || lg.rid }, season, getJson);
    return json(200, { league: lg.key, name: lg.name, season, sends: 'nothing (check only)', ...v });
  }
  return json(400, { error: 'what' });
}

async function entry(req) {
  try { return await route(req); }
  catch (e) {
    await reportIssue('Email route crashed', { route: 'email', error: e }).catch(() => {});
    return json(500, { error: 'server' });
  }
}
export const GET = entry;
export const POST = entry;
