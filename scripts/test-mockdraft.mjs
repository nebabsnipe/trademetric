// Mock draft checks. Runs the real /api/draft code against an in-memory store (no network, no database).
//   node scripts/test-mockdraft.mjs            200 simulated CPU drafts + rule checks + API checks
//   node scripts/test-mockdraft.mjs dump 3     prints three full 12-team drafts, pick by pick
import { readFileSync } from 'node:fs';
import handler, { _t, _engine as E } from '../api/draft.js';

const rd = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
_t.data = { nfl: rd('nfl.json'), market: rd('market.json'), hist: (() => { try { return rd('tmhist.json'); } catch { return {}; } })() };
let clock = Date.parse('2027-03-01T18:00:00Z'); _t.now = () => clock;
_t.auth = tok => ({ id: tok, name: 'User ' + tok.slice(-2), pro: true });
const fresh = () => { _t.mem = { rooms: new Map(), picks: new Map(), queues: new Map(), results: [] }; };
export async function call(tok, body) {
  let out = null; const res = { setHeader() { }, status(c) { return { json(o) { out = { http: c, ...o }; } }; } };
  await handler({ method: 'POST', headers: { authorization: 'Bearer ' + tok }, body }, res); return out;
}
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };

async function cpuDraft(settings) {
  const set = E.cleanSettings(settings, 'solo'), P = await E.poolFor(set), used = new Set();
  const room = { id: 'x', mode: 'solo', settings: { ...set, speed: 'instant' }, status: 'live', cur: 0, seats: Array.from({ length: set.teams }, (_, i) => ({ k: 'c', name: 'T' + (i + 1), strat: E.STRATS[Math.floor(Math.random() * E.STRATS.length)] })) };
  const picks = []; E.setClock(room, clock); await E.advance(room, picks, P, async () => [], clock);
  return { room, picks, P, set };
}

if (process.argv[2] === 'dump') {
  const N = +process.argv[3] || 3, NAME = { bal: 'Balanced', rb: 'RB early', wr: 'WR early', te: 'Early TE', qb: 'Early QB', lateqb: 'Late QB' };
  for (let d = 0; d < N; d++) {
    const { room, picks, P, set } = await cpuDraft({ teams: 12, scoring: 'half' }), n = set.teams;
    console.log(`\n===== Draft ${d + 1}: 12 teams, Half PPR, ${E.rounds(set)} rounds =====`);
    console.log('Strategies: ' + room.seats.map((s, i) => `T${i + 1} ${NAME[s.strat]}`).join(' | '));
    for (let r = 0; r < E.rounds(set); r++) {
      console.log(`Round ${r + 1}`);
      console.log(picks.slice(r * n, r * n + n).map(p => { const o = P.by[p.player_id], d = p.pick_no + 1 - o.adp; return `  ${String(r + 1)}.${String(p.pick_no % n + 1).padStart(2, '0')} T${String(p.seat + 1).padEnd(2)} ${o.n.padEnd(24)} ${o.pos.padEnd(3)} ADP ${String(o.adp).padStart(3)} (${d >= 0 ? '+' : ''}${d})`; }).join('\n'));
    }
    const g = E.gradeRoom(room, picks, P);
    console.log('Grades: ' + g.map(x => `T${x.seat + 1} ${x.grade}`).join(' | '));
  }
  process.exit(0);
}

/* ---- 200 CPU drafts ---- */
console.log('200 simulated CPU drafts');
const SETS = [{ teams: 12, scoring: 'half' }, { teams: 10, scoring: 'ppr' }, { teams: 12, scoring: 'half', roster: { ...E.DEF_ROSTER, SF: 1 } }, { teams: 8, scoring: 'std' }, { teams: 14, scoring: 'ppr' }, { teams: 20 }, { teams: 5, scoring: 'ppr', clock: 45 },
  { teams: 12, scoring: 'half', roster: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, SF: 0, K: 0, DST: 0, BN: 5 } }];
const at = new Map(); let nDrafts = 0;
for (let d = 0; d < 200; d++) {
  const s = SETS[d % SETS.length], { room, picks, P, set } = await cpuDraft(s), n = set.teams, RN = E.rounds(set), R = set.roster;
  ok(picks.length === n * RN, `draft ${d}: ${picks.length} picks, wanted ${n * RN}`);
  ok(new Set(picks.map(p => p.player_id)).size === picks.length, `draft ${d}: duplicate pick`);
  ok(room.status === 'done', `draft ${d}: not finished`);
  for (let t = 0; t < n; t++) {
    const ids = picks.filter(p => p.seat === t).map(p => p.player_id), c = E.countsOf(ids, P), f = E.fit(c, R);
    ok(ids.length === RN, `draft ${d} team ${t}: ${ids.length} players`);
    ok(f.bench <= R.BN, `draft ${d} team ${t}: roster does not fit ${JSON.stringify(c)}`);
    ok(f.openN === 0, `draft ${d} team ${t}: empty starting slot ${JSON.stringify(f.open)} ${JSON.stringify(c)}`);
    ok(c.K <= R.K && c.DST <= R.DST, `draft ${d} team ${t}: extra K/DST`);
    ok(c.QB <= Math.max(2, R.QB + R.SF + (R.SF ? 1 : 0)) && c.TE <= Math.max(2, R.TE), `draft ${d} team ${t}: too many QB/TE ${JSON.stringify(c)}`);
  }
  picks.forEach(p => { const o = P.by[p.player_id]; if ((o.pos === 'K' || o.pos === 'DST') && Math.floor(p.pick_no / n) + 1 <= RN - 3) ok(false, `draft ${d}: ${o.pos} in round ${Math.floor(p.pick_no / n) + 1}`); });
  if (d % SETS.length === 0) { nDrafts++; picks.forEach(p => { const o = P.by[p.player_id]; if (o.adp <= 50) { const a = at.get(o.adp) || []; a.push(p.pick_no + 1); at.set(o.adp, a); } }); }
}
let dev = 0, worst = 0; for (const [adp, a] of at) { const m = a.reduce((x, y) => x + y, 0) / a.length, d = Math.abs(m - adp); dev += d; worst = Math.max(worst, d); ok(a.length === nDrafts, `ADP ${adp} went undrafted in some drafts`); }
console.log(`  top-50 players: average pick is ${(dev / at.size).toFixed(2)} spots from ADP on average, worst ${worst.toFixed(1)} (${nDrafts} 12-team drafts)`);
ok(dev / at.size < 3.5, 'top 50 drift too far from ADP'); ok(worst < 9, 'one top-50 player drifts too far from ADP');

/* ---- the API: solo ---- */
console.log('API: solo draft'); fresh();
let r = await call('user-a1', { action: 'create', mode: 'solo', settings: { teams: 12, slot: 4, clock: 60, speed: 'fast' } });
ok(r.ok && r.you === 3 && r.picks.length === 3 && r.pool.length > 200, 'solo create runs CPU picks up to the user');
const room = r.room.id, taken = () => new Set(r.picks.map(p => p[0])), next = () => r.pool.find(p => !taken().has(p[0]) && p[2] !== 'K' && p[2] !== 'DST')[0];
const pool0 = r.pool; r.pool = pool0;
let x = await call('user-a1', { action: 'pick', room, player: r.picks[0][0] }); ok(x.code === 'taken', 'drafted player is refused');
x = await call('user-zz', { action: 'pick', room, player: next() }); ok(x.code === 'not_member', 'outsider is refused');
x = await call('user-a1', { action: 'pick', room, player: next() }); ok(x.ok && x.picks.length === 20 && x.made.length === 16, 'pick, then CPU picks to the next turn'); r = { ...x, pool: pool0 };
x = await call('user-a1', { action: 'undo', room }); ok(x.ok && x.picks.length === 3, 'undo rewinds to the user pick'); r = { ...x, pool: pool0 };
x = await call('user-a1', { action: 'queue', room, ids: [pool0[30][0], pool0[31][0]] }); ok(x.ok && x.queue.length === 2, 'queue saved');
clock += 61e3; x = await call('user-a1', { action: 'tick', room }); ok(x.ok && x.picks[3][1] === 'queue' && x.picks[3][0] === pool0[30][0], 'timeout takes the top of the queue'); r = { ...x, pool: pool0 };
clock += 200e3; x = await call('user-a1', { action: 'tick', room }); ok(x.room.status === 'live' && x.room.seats[3].auto === false && x.picks.length === 27, 'a solo draft never runs off without you: each timeout is one autopick'); r = { ...x, pool: pool0 };
x = await call('user-a1', { action: 'pause', room }); ok(x.room.status === 'paused', 'pause'); x = await call('user-a1', { action: 'pick', room, player: next() }); ok(x.code === 'paused', 'no picks while paused');
x = await call('user-a1', { action: 'resume', room }); ok(x.room.status === 'live', 'resume'); r = { ...x, pool: pool0 };
let guard = 0; while (r.room.status === 'live' && guard++ < 40) { const tk = taken(); x = null; for (const c of pool0) { if (tk.has(c[0])) continue; x = await call('user-a1', { action: 'pick', room, player: c[0] }); if (x.ok || x.code !== 'roster') break; } if (!x || !x.ok) { ok(false, 'pick failed: ' + (x && x.msg)); break; } r = { ...x, pool: pool0 }; }
ok(r.room.status === 'done' && r.room.results && r.room.results.length === 12 && r.room.results[3].grade, 'draft finishes with a grade for every team');
ok(r.room.seats.every((s, i) => i === 3 || s.strat), 'CPU strategies are shown only once the draft is over');
x = await call('user-a1', { action: 'home' }); ok(x.results.length === 1 && x.results[0].grade, 'result saved to history');

/* ---- solo with no tables: the draft travels with the request ---- */
{ // changing draft spot before the first pick
  let y = await call('user-s1', { action: 'create', mode: 'solo', settings: { teams: 10, slot: 0, clock: 60, speed: 'fast' } }); const id = y.room.id, was = y.you, to = was === 7 ? 2 : 7;
  ok(y.ok && y.picks.length === was, 'random spot: CPU picks up to the user');
  let z = await call('user-s1', { action: 'slot', room: id, slot: to + 1 }); ok(z.ok && z.you === to && z.picks.length === to && z.room.cur === to && z.room.seats.filter(q => q.k === 'h').length === 1, 'changing spot restarts the draft from the new spot');
  z = await call('user-s1', { action: 'slot', room: id, slot: 99 }); ok(!z.ok, 'a spot outside the room is refused');
  const p = y.pool.find(q => !new Set((z.picks || []).map(k => k[0])).has(q[0])); z = await call('user-s1', { action: 'state', room: id });
  const free = y.pool.find(q => !z.picks.some(k => k[0] === q[0]) && q[2] !== 'K' && q[2] !== 'DST')[0];
  z = await call('user-s1', { action: 'pick', room: id, player: free }); ok(z.ok, 'pick from the new spot');
  z = await call('user-s1', { action: 'slot', room: id, slot: 1 }); ok(!z.ok && z.code === 'late', 'no changing spot after your first pick');
}
console.log('API: solo without the database'); _t.mem = null;
r = await call('user-b1', { action: 'create', mode: 'solo', settings: { teams: 10, slot: 1, clock: 0 } });
ok(r.ok && r.carry && r.picks.length === 0, 'create returns the draft to carry');
x = await call('user-b1', { action: 'pick', room: r.room.id, player: r.pool[0][0], carry: r.carry }); ok(x.ok && x.picks.length === 19 && x.carry.picks.length === 19, 'pick advances the carried draft');
x = await call('user-b2', { action: 'pick', room: r.room.id, player: r.pool[40][0], carry: x.carry }); ok(!x.ok, 'someone else cannot use a carried draft');
x = await call('user-b1', { action: 'create', mode: 'friends' }); ok(x.code === 'store_off', 'friends rooms say they are not switched on');

/* ---- friends ---- */
console.log('API: friends room'); fresh();
r = await call('host-01', { action: 'create', mode: 'friends', settings: { teams: 8, clock: 30, speed: 'instant' } }); const code = r.room.code, fr = r.room.id;
ok(r.ok && r.room.status === 'lobby' && code.length === 6 && r.you === 0, 'host creates a lobby');
x = await call('pal-02', { action: 'join', code: code.toLowerCase() }); ok(x.ok && x.you === 1, 'friend joins by code');
x = await call('pal-03', { action: 'join', code }); ok(x.ok && x.you === 2, 'second friend joins');
x = await call('pal-02', { action: 'start', room: fr }); ok(x.code === 'host', 'only the host starts');
x = await call('pal-02', { action: 'rename', room: fr, name: '<b>Team Pal</b>' }); ok(x.ok && !/[<>]/.test(x.room.seats[1].name), 'rename strips markup');
x = await call('host-01', { action: 'kick', room: fr, seat: 2 }); ok(x.ok && x.room.seats[2].k === 'o', 'host removes someone');
x = await call('pal-03', { action: 'state', room: fr }); ok(x.code === 'not_member', 'removed person is out');
x = await call('host-01', { action: 'order', room: fr, order: [1, 0, 2, 3, 4, 5, 6, 7] }); ok(x.ok && x.you === 1, 'host sets the order');
x = await call('host-01', { action: 'start', room: fr }); ok(x.ok && x.room.status === 'live' && x.room.seats.every(s => s.k !== 'o') && x.room.cur === 0, 'start fills empty seats with CPU teams and keeps the set order');
const fp = x.pool, P1 = fp[0][0];
const [a, b] = await Promise.all([call('pal-02', { action: 'pick', room: fr, player: P1 }), call('host-01', { action: 'pick', room: fr, player: P1 })]);
ok(a.ok && b.code === 'turn', 'only the seat on the clock can pick');
x = await call('host-01', { action: 'pick', room: fr, player: P1 }); ok(x.code === 'taken' && /already been drafted/.test(x.msg), 'second click on the same player gets a clear message');
x = await call('host-01', { action: 'pick', room: fr, player: fp[1][0] }); ok(x.ok && x.picks.length >= 14, 'instant CPU picks run to the next person');
const ticks = await Promise.all(Array.from({ length: 10 }, () => call('pal-02', { action: 'tick', room: fr }))); ok(new Set(ticks.map(t => t.picks.length)).size === 1, 'ten ticks at once make no extra picks');
{ const me = y => y.room.seats[y.you]; let y = await call('pal-02', { action: 'state', room: fr }); const n0 = y.picks.length;
  clock += 31e3; y = await call('pal-02', { action: 'tick', room: fr }); ok(y.picks.length > n0 && y.picks[n0][1] === 'auto' && !me(y).auto, 'a timeout autopicks for that person');
  let g2 = 0; while (!me(y).auto && g2++ < 8) { clock += 31e3; y = await call('pal-02', { action: 'tick', room: fr }); }
  ok(me(y).auto === true && g2 >= 2, 'two missed picks in a row puts the seat on autopick');
  y = await call('pal-02', { action: 'back', room: fr }); ok(me(y).auto === false, '"I am back" ends autopick'); }
x = await call('pal-02', { action: 'chat', room: fr, text: 'nice <script>pick</script>' }); ok(x.ok && !/[<>]/.test(x.chat[0].t), 'chat is plain text');
x = await call('pal-02', { action: 'react', room: fr, pick: 0, emoji: '🔥' }); ok(x.ok && x.reacts[0]['🔥'] === 1, 'emoji reaction');
x = await call('pal-02', { action: 'pause', room: fr }); ok(x.code === 'host', 'only the host pauses');
x = await call('host-01', { action: 'pause', room: fr }); ok(x.room.status === 'paused', 'host pauses'); clock += 5 * 60e3 + 1000;
x = await call('host-01', { action: 'tick', room: fr }); ok(x.room.status === 'live', 'a pause ends by itself after 5 minutes');
x = await call('host-01', { action: 'leave', room: fr }); x = await call('pal-02', { action: 'state', room: fr }); ok(x.room.host === x.you, 'host leaving hands the room to the next person');
x = await call('pal-02', { action: 'leave', room: fr }); x = await call('pal-02', { action: 'result', room: fr }); ok(x.ok && x.room.status === 'done' && x.room.results, 'everyone leaving finishes the draft on autopick');
x = await call('host-01', { action: 'home' }); ok(x.results.length === 1, 'and it is saved for each member');

/* ---- online lobbies ---- */
console.log('API: online lobbies'); fresh();
r = await call('on-01', { action: 'lobbies' }); ok(r.ok && r.lobbies.length === 3 && r.lobbies.every(l => l.filled === 0 && !l.startsAt), 'three open lobbies, no countdown yet');
x = await call('on-01', { action: 'quick' }); const pub = x.room.id; ok(x.ok && x.room.mode === 'public' && x.room.startsAt === clock + 180e3, 'quick join starts the 3 minute countdown');
x = await call('on-02', { action: 'quick' }); ok(x.room.id === pub, 'quick join picks the lobby starting soonest');
{ // choosing a spot in the lobby
  const open = x.room.seats.map((q, k) => q.k === 'o' ? k : -1).filter(k => k >= 0), other = x.room.seats.findIndex((q, k) => q.k === 'h' && k !== x.you);
  let y = await call('on-02', { action: 'seat', room: pub, seat: other }); ok(!y.ok && y.code === 'taken', 'a taken spot is refused');
  y = await call('on-02', { action: 'seat', room: pub, seat: open[0] }); ok(y.ok && y.you === open[0] && y.room.seats.filter(q => q.k === 'h').length === 2, 'moving to an open spot');
  y = await call('on-zz', { action: 'seat', room: pub, seat: open[1] }); ok(!y.ok, 'outsiders cannot take a spot');
  globalThis.__spot = open[0];
}
x = await call('on-02', { action: 'rename', room: pub, name: 'Custom' }); ok(!x.ok, 'no custom names in public rooms');
x = await call('on-01', { action: 'chat', room: pub, text: 'hi' }); ok(!x.ok, 'no chat in public rooms');
clock += 181e3; x = await call('on-01', { action: 'tick', room: pub }); ok(x.room.status === 'live' && x.room.seats.filter(s => s.k === 'c').length === x.room.settings.teams - 2, 'countdown ends: draft starts with CPU teams in the empty seats');
{ const y = await call('on-02', { action: 'state', room: pub }); ok(y.you === globalThis.__spot, 'the spot chosen in the lobby is kept when the draft starts'); }
r = await call('on-03', { action: 'lobbies' }); ok(r.lobbies.length === 3 && r.lobbies.every(l => l.room !== pub), 'a new lobby opens for that preset');
x = await call('on-02', { action: 'leave', room: pub }); x = await call('on-01', { action: 'state', room: pub }); ok(x.room.seats.some(s => s.left && s.auto), 'leaving early puts the seat on autopick');

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed'); process.exit(fails ? 1 : 0);
