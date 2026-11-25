// Checks the email rules with every outside service replaced by a stand-in (no real email, database or league
// platform is touched).   node scripts/test-email.mjs
import { createHmac } from 'node:crypto';

process.env.EMAIL_LINK_SECRET = 'test-link-secret-0123456789';
process.env.CRON_SECRET = 'test-cron-secret-0123456789';
process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from('test-hook-secret').toString('base64');
process.env.RESEND_API_KEY = 're_test';
delete process.env.EMAIL_LIVE; delete process.env.VERCEL_ENV;

const { io, sendEmail, sendBiggest, unsubToken, readUnsubToken, isLive, TYPES } = await import('../api/_email.js');
const { render, TEMPLATES, SAMPLE } = await import('../api/_email_templates.js');
const { clinchMath, espnVerdict, sleeperVerdict } = await import('../api/_league_check.js');
const W8 = await import('../api/_weekly.js');
const { GET, POST } = await import('../api/email.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)})`);

/* ---- a stand-in database that understands the handful of requests the email code makes ---- */
const OWNER = '1cf5c595-1619-4ffc-bb69-b042382443f3', U2 = '22222222-2222-4222-8222-222222222222';
const UNIQUE = { email_sent: ['user_id', 'type', 'key', 'live'], email_prefs: ['user_id'], email_block: ['email'], email_watch: ['user_id', 'kind', 'key'] };
let db, clock, outbox, sendFails;
function reset() {
  db = { email_sent: [], email_prefs: [], email_block: [], email_watch: [], user_state: [],
    accounts: [{ id: OWNER, email: 'owner@example.com', confirmed: true, username: 'owner', created_at: '2026-11-02T00:00:00Z', last_sign_in_at: '2026-11-16T00:00:00Z', state_at: '2026-11-23T00:00:00Z' },
      { id: U2, email: 'friend@example.com', confirmed: true, username: 'friend', created_at: '2026-11-08T00:00:00Z', last_sign_in_at: '2026-11-14T00:00:00Z', state_at: '2026-11-22T00:00:00Z' }] };
  clock = Date.UTC(2026, 10, 25, 15); outbox = []; sendFails = false; seq = 1;
}
let seq = 1;
const match = (row, filters) => filters.every(([k, op, v]) => {
  const x = row[k];
  if (op === 'eq') return String(x) === v;
  if (op === 'in') return v.split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(x));
  if (op === 'gte') return String(x) >= v;
  return true;
});
io.storeOn = () => true;
io.now = () => clock;
io.rest = async (path, { method = 'GET', body, prefer = '' } = {}) => {
  const [name, qs = ''] = path.split('?'), P = new URLSearchParams(qs);
  if (name === 'rpc/email_accounts') return db.accounts.filter(a => !body.p_ids || body.p_ids.includes(a.id));
  const T = db[name]; if (!T) return null;
  const filters = [...P].filter(([k]) => !['select', 'limit', 'order', 'on_conflict'].includes(k)).map(([k, v]) => { const m = /^(eq|gte|in)\.(.*)$/.exec(v); return [k, m[1], m[1] === 'in' ? m[2].slice(1, -1) : m[2]]; });
  if (method === 'GET') return T.filter(r => match(r, filters)).map(r => ({ ...r }));
  if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body], landed = [];
    for (const r of rows) {
      const u = UNIQUE[name], had = u && T.find(x => u.every(k => String(x[k]) === String(r[k])));
      if (had) { if (/merge-duplicates/.test(prefer)) Object.assign(had, r); continue; }
      const row = { id: seq++, at: new Date(clock).toISOString(), ...(name === 'email_prefs' ? { clinch: true, champ: true, recap: true, draft: true } : {}), ...r }; T.push(row); landed.push({ ...row });
    }
    return /return=representation/.test(prefer) ? landed : true;
  }
  if (method === 'PATCH') { T.filter(r => match(r, filters)).forEach(r => Object.assign(r, body)); return true; }
  if (method === 'DELETE') { db[name] = T.filter(r => !match(r, filters)); return true; }
  return null;
};
io.post = async msg => { if (sendFails) return { ok: false, status: 500, error: 'service down' }; outbox.push(msg); return { ok: true, id: 'em_' + outbox.length, status: 200 }; };

const owner = { id: OWNER, email: 'owner@example.com', name: 'owner' }, friend = { id: U2, email: 'friend@example.com', name: 'friend' };
const st = async (...a) => (await sendEmail(...a)).status;

/* ---- 1. the safety switch ---- */
reset();
ok(!isLive(), 'not live by default');
process.env.EMAIL_LIVE = '1'; process.env.VERCEL_ENV = 'preview'; ok(!isLive(), 'a preview is never live, even with EMAIL_LIVE=1');
process.env.VERCEL_ENV = 'production'; ok(isLive(), 'live only on the real site with EMAIL_LIVE=1');
delete process.env.EMAIL_LIVE; delete process.env.VERCEL_ENV;
eq(await st(friend, 'welcome', 'welcome', { name: 'friend' }), 'sent', 'welcome sends');
eq(outbox[0].to, ['owner@example.com'], 'test mode: goes to the owner, not the person it was written for');
ok(outbox[0].subject.startsWith('[TEST, for friend@example.com] '), 'test mode: the intended person is in the subject');
ok(!outbox[0].headers, 'account email: no unsubscribe header');
ok(outbox[0].from === 'TradeMetric <support@trademetric.app>' && outbox[0].reply_to === 'support@trademetric.app', 'account email: from TradeMetric <support@>, replies go to support@');

/* ---- 2. never twice ---- */
eq(await st(friend, 'welcome', 'welcome', {}), 'duplicate', 'same email a second time is refused');
eq(outbox.length, 1, 'only one welcome went out');
const both = await Promise.all([sendEmail(owner, 'clinch', 'espn:1:2026', SAMPLE.clinch), sendEmail(owner, 'clinch', 'espn:1:2026', SAMPLE.clinch)]);
eq(both.map(r => r.status).sort(), ['duplicate', 'sent'], 'two checks at the same moment: one sends, one is refused');
ok(outbox[1].from === 'TradeMetric <updates@trademetric.app>' && outbox[1].reply_to === 'support@trademetric.app', 'big moment: from TradeMetric <updates@>, replies go to support@');
ok(outbox[1].headers['List-Unsubscribe'].includes('/api/email/unsub?t=') && outbox[1].headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'big moment: one-click unsubscribe headers');
ok(outbox[1].html.includes('/api/email/unsub?t=') && outbox[1].text.includes('/api/email/unsub?t='), 'big moment: unsubscribe link in the email and its text version');

/* ---- 3. one big moment a day ---- */
eq(await st(owner, 'champ', 'espn:1:2026', SAMPLE.champ), 'capped', 'a second big moment the same day is dropped');
clock += 25 * 3600e3;
eq(await st(owner, 'champ', 'espn:1:2026', SAMPLE.champ), 'duplicate', 'a dropped email stays dropped (not sent the next day)');
eq(await st(owner, 'champ', 'espn:2:2026', SAMPLE.champ), 'sent', 'a new big moment the next day sends');
eq(await st(owner, 'sync_broke', 'espn:1:2026-11-23', SAMPLE.sync_broke), 'sent', 'account emails are not limited by the daily cap');
reset();
const two = await sendBiggest(owner, [{ type: 'clinch', key: 'k', data: SAMPLE.clinch }, { type: 'champ', key: 'k', data: SAMPLE.champ }]);
eq(two.map(r => [r.type, r.status]), [['champ', 'sent'], ['clinch', 'capped']], 'two due at once: championship sends, clinch is dropped');
eq(outbox.length, 1, 'only one of the two went out');

/* ---- 4. switches ---- */
reset();
db.email_prefs.push({ user_id: OWNER, clinch: false, champ: true, recap: true, draft: true });
eq(await st(owner, 'clinch', 'k', SAMPLE.clinch), 'pref_off', 'a switched-off kind does not send');
eq(await st(owner, 'champ', 'k', SAMPLE.champ), 'sent', 'the other kinds still send');
eq(outbox.length, 1, 'nothing went out for the switched-off kind');
eq(await st(friend, 'recap', 'k', SAMPLE.recap), 'type_off', 'the recap email is built but switched off');

/* ---- 5. bounces, failures, missing setup ---- */
reset();
db.email_block.push({ email: 'friend@example.com', reason: 'bounce' });
eq(await st(friend, 'welcome', 'welcome', {}), 'blocked', 'a bounced address is never emailed');
sendFails = true;
eq(await st(owner, 'welcome', 'welcome', {}), 'failed', 'a refused send is reported as failed');
eq(db.email_sent.length, 0, 'a failed send leaves no record, so it can be tried again');
sendFails = false;
eq(await st(owner, 'welcome', 'welcome', {}), 'sent', '...and the retry sends');
process.env.EMAIL_LIVE = '1'; process.env.VERCEL_ENV = 'production';
eq(await st(friend, 'clinch', 'live1', SAMPLE.clinch), 'blocked', 'live: still blocked');
db.email_block = [];
eq(await st(friend, 'clinch', 'live1', SAMPLE.clinch), 'sent', 'live: sends');
eq(outbox.at(-1).to, ['friend@example.com'], 'live: goes to the real person');
ok(!outbox.at(-1).subject.includes('TEST'), 'live: no test tag in the subject');
eq(db.email_sent.at(-1).live, true, 'live sends are recorded apart from test sends');
delete process.env.EMAIL_LIVE; delete process.env.VERCEL_ENV;
const s = process.env.EMAIL_LINK_SECRET; delete process.env.EMAIL_LINK_SECRET;
eq(await st(owner, 'clinch', 'nolink', SAMPLE.clinch), 'not_ready', 'no link secret: big moments are not sent (no working unsubscribe)');
process.env.EMAIL_LINK_SECRET = s;

/* ---- 6. unsubscribe links ---- */
reset();
const tok = unsubToken(U2, 'clinch');
eq(readUnsubToken(tok), { userId: U2, type: 'clinch' }, 'a signed link reads back');
ok(!readUnsubToken(tok.slice(0, -2) + 'xx') && !readUnsubToken('abc.def') && !readUnsubToken(unsubToken(U2, 'welcome')), 'a changed or made-up link is refused');
const R = (path, init) => new Request('https://www.trademetric.app' + path, init);
let r = await GET(R('/api/email?do=unsub&t=' + tok));
ok(r.status === 200 && (await r.text()).includes('playoff clinch'), 'the unsubscribe page opens signed out');
eq(db.email_prefs.length, 0, 'opening the page alone changes nothing (mail scanners open links)');
r = await POST(R('/api/email?do=unsub&t=' + tok, { method: 'POST' }));
eq([r.status, db.email_prefs[0].clinch, db.email_prefs[0].champ], [200, false, true], 'the click turns that one kind off');
eq(await st(friend, 'clinch', 'after-unsub', SAMPLE.clinch), 'pref_off', '...and it no longer sends');
r = await POST(R('/api/email?do=unsub&all=1&t=' + tok, { method: 'POST' }));
eq(['clinch', 'champ', 'recap', 'draft'].map(k => db.email_prefs[0][k]), [false, false, false, false], '"turn off all" turns off all four');
r = await POST(R('/api/email?do=unsub&on=1&t=' + tok, { method: 'POST' }));
eq(db.email_prefs[0].clinch, true, '"turn back on" works');
r = await POST(R('/api/email/unsub?t=bad', { method: 'POST' }));
eq(r.status, 400, 'a bad link changes nothing');

/* ---- 7. bounce and complaint reports ---- */
reset();
const hookReq = (ev, { badSig, old } = {}) => {
  const raw = JSON.stringify(ev), id = 'msg_1', ts = String(Math.floor(clock / 1000) - (old ? 3600 : 0));
  const sig = createHmac('sha256', Buffer.from('test-hook-secret')).update(`${id}.${ts}.${raw}`).digest('base64');
  return R('/api/email?do=hook', { method: 'POST', body: raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + (badSig ? 'AAAA' : sig) } });
};
eq((await POST(hookReq({ type: 'email.bounced', data: { to: ['a@example.com'], bounce: { type: 'Permanent' } } }, { badSig: true }))).status, 401, 'an unsigned report is refused');
eq((await POST(hookReq({ type: 'email.bounced', data: { to: ['a@example.com'] } }, { old: true }))).status, 401, 'an old report is refused');
await POST(hookReq({ type: 'email.bounced', data: { to: ['A@Example.com'], bounce: { type: 'Permanent' } } }));
await POST(hookReq({ type: 'email.complained', data: { to: ['b@example.com'] } }));
await POST(hookReq({ type: 'email.bounced', data: { to: ['c@example.com'], bounce: { type: 'Transient' } } }));
await POST(hookReq({ type: 'email.delivered', data: { to: ['d@example.com'] } }));
await POST(hookReq({ type: 'email.bounced', data: { to: ['owner@example.com'], bounce: { type: 'Permanent' }, tags: { mode: 'test' } } }));
eq(db.email_block.map(b => [b.email, b.reason]), [['a@example.com', 'bounce'], ['b@example.com', 'complaint']], 'hard bounces and complaints are blocked; soft bounces, deliveries and test sends are not');

/* ---- 8. every template renders, in both versions ---- */
for (const t of TEMPLATES) {
  const m = render(t, SAMPLE[t], { unsubUrl: 'https://x/u' });
  ok(m.subject && m.html.includes('TRADE<span') && m.text.includes('TRADEMETRIC') && m.html.includes('prefers-color-scheme') && !/<img/i.test(m.html), `${t} renders with a text version and no images`);
  ok(!/undefined|NaN|\[object/.test(m.html + m.text + m.subject), `${t} has no blanks`);
}
ok(render('clinch', { league: '<b>x</b>', team: 'A&B' }, {}).html.includes('&lt;b&gt;x&lt;/b&gt;'), 'league names are escaped');
ok(!/sleeper|espn|yahoo|fantasypros/i.test(TEMPLATES.map(t => { const m = render(t, SAMPLE[t], {}); return m.html.replace(/<style[\s\S]*?<\/style>/, '') + m.text + m.subject; }).join(' ')), 'no email names another site');

/* ---- 9. the clinch math ---- */
const T = (id, w, l, left, div = 0) => ({ id, name: 'T' + id, w, l, t: 0, left, div });
// 10 teams, 4 spots, 2 games left. We are 10-2. Only two teams can reach 10 wins.
let lg = [T(1, 10, 2, 2), T(2, 9, 3, 2), T(3, 8, 4, 2), T(4, 7, 5, 2), T(5, 7, 5, 2), T(6, 6, 6, 2), T(7, 5, 7, 2), T(8, 4, 8, 2), T(9, 2, 10, 2), T(10, 2, 10, 2)];
eq(clinchMath(lg, 1, 4, 0).clinched, true, '10-2 with two teams able to catch up and four spots: clinched');
eq(clinchMath(lg, 4, 4, 0).clinched, false, '7-5 in fourth with games left: not clinched');
// a tie on record counts against you
lg = [T(1, 8, 4, 2), T(2, 8, 4, 2), T(3, 6, 6, 2), T(4, 6, 6, 2), T(5, 3, 9, 2), T(6, 1, 11, 2)];
eq(clinchMath(lg, 1, 3, 0).clinched, false, 'three teams could finish level or ahead for three spots: not clinched (ties count against you)');
eq(clinchMath(lg, 1, 4, 0).clinched, true, '...with four spots it is');
// divisions: another division's winner takes a spot even with a worse record
lg = [T(1, 9, 3, 2, 1), T(2, 8, 4, 2, 1), T(3, 8, 4, 2, 1), T(4, 3, 9, 2, 2), T(5, 2, 10, 2, 2), T(6, 2, 10, 2, 2)];
eq(clinchMath(lg, 1, 2, 2).clinched, false, 'two spots, two divisions: the other division winner takes one, two rivals can catch up: not clinched');
eq(clinchMath(lg, 1, 4, 2).clinched, true, '...four spots: clinched');
eq(clinchMath(lg, 99, 4, 2).clinched, false, 'unknown team: no');

/* ---- 10. reading an ESPN league ---- */
function espnLeague({ decided, regN = 3, spots = 2, bracket = [], ranks = {} }) {
  // 4 teams, round robin. decided: how many of the 3 weeks are final. Team 1 beats everyone, team 4 loses to everyone.
  const weeks = [[[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]]], schedule = [], rec = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] };
  weeks.forEach((ms, i) => ms.forEach(([h, a]) => { const done = i < decided; if (done) { rec[h][0]++; rec[a][1]++; }
    schedule.push({ matchupPeriodId: i + 1, playoffTierType: 'NONE', winner: done ? 'HOME' : 'UNDECIDED', home: { teamId: h, totalPoints: done ? 120 : 0 }, away: { teamId: a, totalPoints: done ? 100 : 0 } }); }));
  schedule.push(...bracket);
  return { seasonId: 2026, settings: { name: 'Test League', scheduleSettings: { matchupPeriodCount: regN, playoffTeamCount: spots } },
    teams: [1, 2, 3, 4].map(id => ({ id, name: 'Team ' + id, divisionId: 0, playoffSeed: id, rankCalculatedFinal: ranks[id] || 0, record: { overall: { wins: rec[id][0], losses: rec[id][1], ties: 0 } } })), schedule };
}
let v = espnVerdict(espnLeague({ decided: 1 }), 1);
eq([v.clinched, v.champion], [false, false], 'ESPN week 1 of 3: nothing clinched');
eq(espnVerdict(espnLeague({ decided: 2 }), 1).clinched, false, 'ESPN: 2-0 with one game left, two teams could still tie it for two spots: not clinched');
eq(espnVerdict(espnLeague({ decided: 2, spots: 3 }), 1).clinched, true, 'ESPN: ...with three spots: clinched');
eq(espnVerdict(espnLeague({ decided: 2, spots: 3 }), 2).clinched, false, 'ESPN: a 1-1 team is not clinched');
const semi = [{ matchupPeriodId: 4, playoffTierType: 'WINNERS_BRACKET', winner: 'UNDECIDED', home: { teamId: 1, totalPoints: 0 }, away: { teamId: 2, totalPoints: 0 } }];
v = espnVerdict(espnLeague({ decided: 3, bracket: semi }), 1);
eq([v.clinched, v.final, v.champion], [true, true, false], 'ESPN: season over, in the bracket: clinched, title game not finished');
eq(espnVerdict(espnLeague({ decided: 3, bracket: semi }), 3).clinched, false, 'ESPN: season over, not in the bracket: not clinched');
const fin = w => [{ matchupPeriodId: 4, playoffTierType: 'WINNERS_BRACKET', winner: w, home: { teamId: 1, totalPoints: 131.4 }, away: { teamId: 2, totalPoints: 127.9 } },
  { matchupPeriodId: 4, playoffTierType: 'LOSERS_CONSOLATION_LADDER', winner: w, home: { teamId: 3, totalPoints: 90 }, away: { teamId: 4, totalPoints: 80 } }];
v = espnVerdict(espnLeague({ decided: 3, bracket: fin('HOME'), ranks: { 1: 1, 2: 2 } }), 1);
eq([v.champion, v.score], [true, '131.4 to 127.9'], 'ESPN: title game final, league says they won, final rank 1: champion');
eq(espnVerdict(espnLeague({ decided: 3, bracket: fin('HOME'), ranks: { 1: 1, 2: 2 } }), 2).champion, false, 'ESPN: the loser of the title game is not champion');
eq(espnVerdict(espnLeague({ decided: 3, bracket: fin('UNDECIDED') }), 1).champion, false, 'ESPN: title game still being played: not champion');
eq(espnVerdict(espnLeague({ decided: 3, bracket: fin('HOME'), ranks: { 1: 2, 2: 1 } }), 1).champion, false, 'ESPN: the game and the final ranking disagree: nothing concluded');
const off = espnLeague({ decided: 2 }); off.teams[0].record.overall.wins = 1;
eq(espnVerdict(off, 1).clinched, false, 'ESPN: results and standings disagree: nothing concluded');

/* ---- 11. reading a Sleeper league ---- */
const SL = (status, meta) => ({ league_id: '9', name: 'Sleeper Test', season: '2026', status, metadata: meta || null, settings: { playoff_teams: 2, playoff_week_start: 4, divisions: 0 } });
const RO = recs => recs.map(([w, l], i) => ({ roster_id: i + 1, owner_id: 'u' + (i + 1), settings: { wins: w, losses: l, ties: 0 } }));
eq(sleeperVerdict(SL('in_season'), RO([[2, 0], [1, 1], [1, 1], [0, 2]]), [], [], 1).clinched, false, 'Sleeper: 2-0, two teams can tie it for two spots: not clinched');
eq(sleeperVerdict({ ...SL('in_season'), settings: { playoff_teams: 3, playoff_week_start: 4 } }, RO([[2, 0], [1, 1], [1, 1], [0, 2]]), [], [], 1).clinched, true, 'Sleeper: ...three spots: clinched');
const BR = w => [{ r: 1, m: 1, t1: 1, t2: 2, w: w || null, l: null, p: 1 }];
v = sleeperVerdict(SL('post_season'), RO([[3, 0], [2, 1], [1, 2], [0, 3]]), BR(), [], 1);
eq([v.clinched, v.champion], [true, false], 'Sleeper: season over, in the bracket, final not played');
eq(sleeperVerdict(SL('post_season'), RO([[3, 0], [2, 1], [1, 2], [0, 3]]), BR(1), [], 1).champion, false, 'Sleeper: bracket says winner but the league has not closed the season: nothing concluded');
eq(sleeperVerdict(SL('complete', { latest_league_winner_roster_id: '1' }), RO([[3, 0], [2, 1], [1, 2], [0, 3]]), BR(1), [], 1).champion, true, 'Sleeper: final won and the league names them champion');
eq(sleeperVerdict(SL('complete', { latest_league_winner_roster_id: '2' }), RO([[3, 0], [2, 1], [1, 2], [0, 3]]), BR(1), [], 1).champion, false, 'Sleeper: the league names someone else: nothing concluded');

/* ---- 12. the daily check, start to finish ---- */
reset();
const leagueState = (uid, key, type, id, rid) => ({ user_id: uid, leagueKey: key, me: 't1', noLeague: false, league: { name: 'Test League' }, real: { src: { type, league: id, rid: { [rid]: 't1' }, priv: false } }, leagues: [{ key, name: 'Test League', snap: { me: 't1', real: { src: { type, league: id, rid: { [rid]: 't1' }, priv: false } } } }] });
db.user_state.push(leagueState(OWNER, 'espn:77', 'espn', '77', 1), leagueState(U2, 'espn:404', 'espn', '404', 1));
let espnNow = espnLeague({ decided: 2, spots: 3 });
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  url = String(url);
  if (url.includes('/leagues/77')) return new Response(JSON.stringify(espnNow), { status: 200 });
  if (url.includes('/leagues/404')) return new Response('{}', { status: 404 });
  return new Response('{}', { status: 500 });
};
const cron = async (dry) => (await GET(R('/api/email?do=cron' + (dry ? '&dry=1' : ''), { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }))).json();
eq((await GET(R('/api/email?do=cron'))).status, 401, 'the daily check needs its password');
let c = await cron(true);
eq([c.sent, db.email_watch.length, outbox.length], [0, 0, 0], 'a dry run sends nothing and writes nothing');
ok(c.conclusions.some(x => x.result === 'clinched' && /second check/.test(x.email)), 'dry run explains: clinched, waiting for a second check');
c = await cron();
eq([outbox.length, db.email_watch.map(w => w.kind).sort()], [0, ['clinch', 'sync']], 'first sighting: nothing sent, both noted');
clock += 24 * 3600e3; c = await cron();
eq(outbox.map(m => m.subject), ['[TEST, for owner@example.com] You clinched a playoff spot in Test League'], 'a day later the clinch still holds: emailed once');
clock += 24 * 3600e3; c = await cron();
eq(outbox.length, 2, 'day three: the broken league has now failed 48 hours in a row');
ok(/We can't update Test League/.test(outbox[1].subject) && /friend@example.com/.test(outbox[1].subject), '...and its owner gets the "stopped updating" email');
clock += 24 * 3600e3; c = await cron(); clock += 24 * 3600e3; c = await cron();
eq(outbox.length, 2, 'further checks send nothing more (once per league per breakage, clinch once per season)');
// the league comes back, then breaks again: a new breakage
globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('/leagues/') ? espnNow : {}), { status: 200 });
await cron(); eq(db.email_watch.filter(w => w.kind === 'sync').length, 0, 'a league that reads again is no longer counted as broken');
// a clinch that stops being true before the second check is forgotten
reset(); db.user_state.push(leagueState(OWNER, 'espn:77', 'espn', '77', 1));
espnNow = espnLeague({ decided: 2, spots: 3 }); await cron(); eq(db.email_watch.length, 1, 'clinch noted'); espnNow = espnLeague({ decided: 1, spots: 3 }); clock += 24 * 3600e3; await cron();
eq([outbox.length, db.email_watch.length], [0, 0], 'a clinch that does not hold on the second check is never emailed');
// platform down is not "broken"
globalThis.fetch = async () => new Response('{}', { status: 503 });
clock += 24 * 3600e3; await cron(); eq(db.email_watch.length, 0, 'the platform being down does not count against a league');
// the August draft reminder
reset(); globalThis.fetch = async () => new Response('{}', { status: 503 });
clock = Date.UTC(2027, 7, 12, 15); db.accounts[1].state_at = '2027-08-05T00:00:00Z';
c = await cron();
eq(outbox.map(m => m.subject), ['[TEST, for owner@example.com] Draft season is here'], 'August: only the account unused for 30+ days gets the reminder');
clock += 24 * 3600e3; await cron(); eq(outbox.length, 1, '...once');
clock = Date.UTC(2027, 8, 12, 15); await cron(); eq(outbox.length, 1, 'not in September');
globalThis.fetch = realFetch;

/* ---- 13. the update emails: switches, sections and limits ---- */
reset();
const WK = SAMPLE.weekly;
eq(await st(owner, 'weekly', 'weekly:2026:12', WK), 'sent', 'weekly recap sends');
ok(outbox[0].from === 'TradeMetric <updates@trademetric.app>' && outbox[0].headers['List-Unsubscribe'], 'weekly recap: from updates@, with unsubscribe');
eq(await st(owner, 'weekly', 'weekly:2026:12', WK), 'duplicate', 'the same week is never sent twice');
eq(await st(owner, 'weekly', 'weekly:2026:13', WK), 'capped', 'a second weekly recap within four days is dropped');
eq(await st(owner, 'clinch', 'k', SAMPLE.clinch), 'sent', 'a weekly recap does not use up the big-moment limit');
eq(await st(owner, 'injury', 'inj:2026-11-25', SAMPLE.injury), 'pref_off', 'injuries are off until switched on');
db.email_prefs.push({ user_id: OWNER, inj: true });
eq(await st(owner, 'injury', 'inj:2026-11-25', SAMPLE.injury), 'sent', '...and send once switched on');
eq(await st(owner, 'injury', 'inj:2026-11-25b', SAMPLE.injury), 'capped', 'one injury email a day');
reset();
db.email_prefs.push({ user_id: OWNER, matchup: false, perf: true, top: false, clips: false });
const only = { ...WK, perf: [] };
eq(await st(owner, 'weekly', 'w1', only), 'empty', 'weekly recap with nothing in its switched-on sections is not sent');
eq(await st(owner, 'weekly', 'w2', WK), 'sent', 'weekly recap with a switched-on section sends');
ok(/STANDOUT GAMES/.test(outbox[0].text) && !/YOUR MATCHUP|#1 AT HIS|HIGHLIGHTS/.test(outbox[0].text), '...with only the switched-on section in it');
ok(/Your Week 12 recap/.test(outbox[0].subject), '...and a subject that does not give away a switched-off result');
Object.assign(db.email_prefs[0], { perf: false });
eq(await st(owner, 'weekly', 'w3', WK), 'pref_off', 'all four sections off: no weekly recap');
reset();
let tk = unsubToken(U2, 'weekly');
await POST(R('/api/email?do=unsub&t=' + tk, { method: 'POST' }));
eq(['matchup', 'perf', 'top', 'clips', 'clinch'].map(k => db.email_prefs[0][k]), [false, false, false, false, true], 'unsubscribing from the weekly recap turns off its four sections only');
await POST(R('/api/email?do=unsub&all=1&t=' + tk, { method: 'POST' }));
ok(['matchup', 'perf', 'top', 'clips', 'inj', 'deadline', 'clinch', 'champ', 'recap', 'moves', 'draft'].every(k => db.email_prefs[0][k] === false), '"turn off all" turns off all eleven');

/* ---- 13b. the one-time announcement ---- */
reset();
const annReq = (extra = '') => GET(R('/api/email?do=announce' + extra, { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } }));
eq((await GET(R('/api/email?do=announce'))).status, 401, 'announcement needs the password');
let ann = await (await annReq('&dry=1')).json();
eq([ann.accounts, ann.would_send, outbox.length], [1, 1, 0], 'not live, dry run: only the owner is considered and nothing is sent');
await annReq(); await annReq();
eq(outbox.length, 1, 'not live: one test copy to the owner, and running it again sends nothing more');
ok(/turn off all update emails/.test(outbox[0].text) && /api\/email\/unsub\?t=/.test(outbox[0].text) && outbox[0].from === 'TradeMetric <updates@trademetric.app>', 'the announcement has the one-click turn-off link and comes from updates@');
reset();
process.env.EMAIL_LIVE = '1'; process.env.VERCEL_ENV = 'production';
db.email_prefs.push({ user_id: U2, matchup: false, perf: false, top: false, clips: false, inj: false, deadline: false, clinch: false, champ: false, recap: false, moves: false, draft: false });
ann = await (await annReq()).json();
eq([ann.sent, ann.pref_off, outbox.map(m => m.to[0])], [1, 1, ['owner@example.com']], 'live: everyone gets it once, except someone who already turned everything off');
await annReq(); eq(outbox.length, 1, 'live: a second run sends nothing');
await POST(R('/api/email?do=unsub&t=' + unsubToken(OWNER, 'announce'), { method: 'POST' }));
ok(['matchup', 'perf', 'top', 'clips', 'inj', 'deadline', 'clinch', 'champ', 'recap', 'moves', 'draft'].every(k => db.email_prefs.find(r => r.user_id === OWNER)[k] === false), 'the announcement\'s turn-off link turns off all eleven switches');
delete process.env.EMAIL_LIVE; delete process.env.VERCEL_ENV;

/* ---- 14. reading a week: ESPN ---- */
const espnWk = (scores, kona) => async (url, headers) => {
  if (/kona_player_info/.test(url)) return kona(JSON.parse(headers['x-fantasy-filter']));
  const pl = (id, name, pos, slot, pts, proj) => ({ lineupSlotId: slot, playerPoolEntry: { player: { id, fullName: name, defaultPositionId: pos, proTeamId: 4, stats: [{ scoringPeriodId: 12, statSourceId: 0, statSplitTypeId: 1, appliedTotal: pts }, { scoringPeriodId: 12, statSourceId: 1, statSplitTypeId: 1, appliedTotal: proj }] } } });
  return { settings: { name: 'Test League', scheduleSettings: { matchupPeriods: { 12: [12] } } }, schedule: [{ matchupPeriodId: 12, winner: scores.winner, playoffTierType: 'NONE', home: { teamId: 1, totalPoints: 131.42 }, away: { teamId: 2, totalPoints: 118.2 } }],
    teams: [{ id: 1, name: 'Mine', record: { overall: { wins: 8, losses: 4 } }, roster: { entries: [pl(10, 'Star Receiver', 3, 4, 38.4, 17.2), pl(11, 'Okay Runner', 2, 2, 9.1, 12.0), pl(12, 'Bench Guy', 3, 20, 30.2, 8.0)] } }, { id: 2, name: 'Theirs' }] };
};
const sortedKona = f => ({ players: [{ player: { id: 10, stats: [{ scoringPeriodId: 12, statSourceId: 0, appliedTotal: 38.4 }] } }, { player: { id: 12, stats: [{ scoringPeriodId: 12, statSourceId: 0, appliedTotal: 30.2 }] } }, ...[29, 27, 25, 20].map((p, i) => ({ player: { id: 90 + i, stats: [{ scoringPeriodId: 12, statSourceId: 0, appliedTotal: p }] } }))] });
const wk12 = { season: 2026, week: 12, games: [] }, memoF = () => { const m = new Map(); return (k, fn) => { if (!m.has(k)) m.set(k, fn()); return m.get(k); }; };
let w = await W8.leagueWeek({ type: 'espn', id: '5', rid: 1, name: 'Test League' }, wk12, espnWk({ winner: 'HOME' }, sortedKona), memoF(), [{ title: 'Star Receiver 64-yard TD', url: 'https://x/v', who: ['star receiver'] }]);
eq([w.result.won, w.result.me, w.result.record], [true, 131.4, '8-4'], 'ESPN week: the result and record');
eq(w.perf.map(p => p.name), ['Star Receiver', 'Bench Guy'], 'ESPN week: standout games (38.4, and a bench player at 30.2)');
eq(w.tops.map(p => p.name), ['Star Receiver'], 'ESPN week: #1 WR when he tops the whole position');
eq(w.clips.map(c => c.player), ['Star Receiver'], 'ESPN week: his highlight clip');
w = await W8.leagueWeek({ type: 'espn', id: '5', rid: 1 }, wk12, espnWk({ winner: 'HOME' }, sortedKona), memoF(), [{ title: 'Okay Runner breaks a 40-yard run', url: 'https://x/a', who: [], t: ' okay runner breaks a 40 yard run ' }, { title: 'Another Runner scores', url: 'https://x/b', who: [], t: ' another runner scores ' }]);
eq(w.clips.map(c => c.player), ['Okay Runner'], 'ESPN week: a clip with his full name in the title counts; other players\' clips do not');
w = await W8.leagueWeek({ type: 'espn', id: '5', rid: 1 }, wk12, espnWk({ winner: 'HOME' }, () => ({ players: [20, 45, 30, 38.4, 10].map((p, i) => ({ player: { id: 80 + i, stats: [{ scoringPeriodId: 12, statSourceId: 0, appliedTotal: p }] } })) })), memoF(), []);
eq(w.tops.length, 0, 'ESPN week: scores that do not come back in order: no #1 claim');
w = await W8.leagueWeek({ type: 'espn', id: '5', rid: 1 }, wk12, espnWk({ winner: 'HOME' }, () => ({ players: [{ player: { id: 77, stats: [{ scoringPeriodId: 12, statSourceId: 0, appliedTotal: 41 }] } }, ...[38.4, 30.2, 29, 27].map((p, i) => ({ player: { id: 10 + i, stats: [{ scoringPeriodId: 12, statSourceId: 0, appliedTotal: p }] } }))] })), memoF(), []);
eq(w.tops.length, 0, 'ESPN week: someone else scored more: no #1 claim');
w = await W8.leagueWeek({ type: 'espn', id: '5', rid: 1 }, wk12, espnWk({ winner: 'UNDECIDED' }, sortedKona), memoF(), []);
eq(w.result, null, 'ESPN week: an unfinished matchup has no result');

/* ---- 15. reading a week: Sleeper ---- */
const slpGet = ({ ours = 30.5 } = {}) => async url => {
  if (/\/matchups\/12$/.test(url)) return [{ roster_id: 1, matchup_id: 3, points: 120.5, starters: ['p1'], players_points: { p1: 30.5, p2: 4 } }, { roster_id: 2, matchup_id: 3, points: 121, starters: [], players_points: {} }];
  if (/\/rosters$/.test(url)) return [{ roster_id: 1, owner_id: 'a', settings: { wins: 6, losses: 6 } }, { roster_id: 2, owner_id: 'b', settings: {} }];
  if (/\/users$/.test(url)) return [{ user_id: 'a', display_name: 'me' }, { user_id: 'b', metadata: { team_name: 'Rivals' } }];
  if (/players\/nfl$/.test(url)) return Object.fromEntries([['p1', { position: 'RB', full_name: 'Run Back', team: 'ATL' }], ['p2', { position: 'WR', full_name: 'Wide Out', team: 'KC' }], ...Array.from({ length: 150 }, (_, i) => ['x' + i, { position: 'RB', full_name: 'Other ' + i }])]);
  if (/\/stats\//.test(url)) return [{ player_id: 'p1', stats: { rush_yd: ours * 10 } }, ...Array.from({ length: 150 }, (_, i) => ({ player_id: 'x' + i, stats: { rush_yd: i } }))];
  if (/\/projections\//.test(url)) return [{ player_id: 'p1', stats: { rush_yd: 100 } }];
  if (/\/league\/9$/.test(url)) return { name: 'Lap', scoring_settings: { rush_yd: 0.1 }, settings: { playoff_week_start: 15 } };
  return null;
};
w = await W8.leagueWeek({ type: 'sleeper', id: '9', rid: 1 }, wk12, slpGet(), memoF(), []);
eq([w.result.won, w.result.oppName, w.result.record], [false, 'Rivals', '6-6'], 'Sleeper week: the result');
eq([w.perf.map(p => p.name), w.tops.map(p => p.name)], [['Run Back'], ['Run Back']], 'Sleeper week: 30.5 is a standout game and the #1 RB');
w = await W8.leagueWeek({ type: 'sleeper', id: '9', rid: 1 }, wk12, slpGet({ ours: 25 }), memoF(), []);
eq(w.tops.length, 0, 'Sleeper week: our scoring does not match the league\'s number: no #1 claim');

/* ---- 16. trade deadlines and player moves ---- */
const nowT = Date.UTC(2026, 10, 25, 15);
const stDl = { leagueKey: 'espn:1', league: { name: 'L1', tdl: { at: nowT + 2 * 864e5 } }, leagues: [{ key: 'espn:1', name: 'L1' }, { key: 'espn:2', name: 'L2', snap: { league: { tdl: { at: nowT + 6 * 864e5 } } } }] };
eq(W8.deadlinesOf(stDl, null, nowT).map(d => d.league), ['L1'], 'trade deadline: only the one within three days');
let kvS = {};
const kv = { get: async k => ({ value: kvS[k] || null }), put: async (k, v) => { kvS[k] = v; return true; } };
let slpP = { a: { position: 'RB', full_name: 'Tony Moves', team: 'TEN' }, ...Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['f' + i, { position: 'WR', full_name: 'Filler ' + i, team: 'NE' }])) };
const pget = async () => slpP;
eq(await W8.trackMoves(pget, kv, nowT, false), [], 'moves: the first check only records teams');
slpP.a.team = 'KC';
eq((await W8.trackMoves(pget, kv, nowT + 864e5, false)).length, 0, 'moves: a new team is not believed on one check');
eq((await W8.trackMoves(pget, kv, nowT + 2 * 864e5, false)).map(x => [x.name, x.from, x.to]), [['Tony Moves', 'TEN', 'KC']], 'moves: still there a day later: confirmed');
kvS = {}; slpP.a.team = 'TEN'; await W8.trackMoves(pget, kv, nowT, false); slpP.a.team = 'KC'; await W8.trackMoves(pget, kv, nowT + 864e5, false); slpP.a.team = 'TEN';
eq((await W8.trackMoves(pget, kv, nowT + 2 * 864e5, false)).length, 0, 'moves: a change that flips back is never sent');
ok(!W8.inMovesWindow(Date.UTC(2026, 10, 25)) && W8.inMovesWindow(Date.UTC(2027, 3, 10)), 'moves only in the offseason');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
