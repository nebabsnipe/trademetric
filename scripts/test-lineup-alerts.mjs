// Lineup alert rules, checked against made-up rosters.   node scripts/test-lineup-alerts.mjs
import '../js/lineup-alerts.js';
const LA = globalThis.LineupAlerts, { evaluate, planPush, CFG } = LA;

let fails = 0, n = 0;
const ok = (cond, name, extra) => { n++; if (cond) console.log('  ok  ', name); else { fails++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };
const P = (name, pos, proj, x = {}) => ({ name, pos, proj, status: '', bye: false, started: false, ...x });

/* one starter vs one bench player at a slot, gap = bench - starter */
function one(gap, pos = 'WR', label = pos, sx = {}, bx = {}) {
  return evaluate({ week: 12, slots: [{ label, p: 's' }], bench: ['b'], info: { s: P('Starter', pos, 10, sx), b: P('Bench', pos, 10 + gap, bx) } });
}
const lvl = r => r.length ? r[0].level : 'none';

console.log(`Thresholds: Consider from ${CFG.CONSIDER}, Start over ${CFG.START}`);
console.log('Gaps');
ok(lvl(one(0.6)) === 'none', 'gap 0.6 -> nothing');
ok(lvl(one(0.7)) === 'consider', 'gap 0.7 -> Consider');
ok(lvl(one(2.3)) === 'consider', 'gap 2.3 -> Consider');
ok(lvl(one(2.4)) === 'start', 'gap 2.4 -> Start');
ok(one(0.7)[0].title === 'Consider starting Bench over Starter (0.7 more projected)', 'Consider wording', one(0.7)[0].title);
ok(one(2.4)[0].title === 'Start Bench over Starter', 'Start wording', one(2.4)[0].title);

console.log('Must-change slots (always Start)');
let r = evaluate({ week: 12, slots: [{ label: 'RB', p: null }], bench: ['b'], info: { b: P('Bench RB', 'RB', 3) } });
ok(lvl(r) === 'start' && r[0].kind === 'empty' && r[0].title === 'You have an empty RB slot', 'empty slot -> Start', r[0]);
ok(lvl(one(-5, 'WR', 'WR', { status: 'O' })) === 'start', 'starter Out -> Start even when bench projects less');
ok(lvl(one(-5, 'WR', 'WR', { status: 'IR' })) === 'start', 'starter on IR -> Start');
ok(lvl(one(-5, 'WR', 'WR', { bye: true })) === 'start', 'starter on bye -> Start');
r = one(0, 'WR', 'WR', { status: 'O' }, { status: 'Q' });
ok(lvl(r) === 'start' && r[0].bench === null && r[0].title === 'Replace Starter', 'starter Out, only bench option Questionable -> Start, nobody suggested', r[0]);

console.log('Games already started');
ok(lvl(one(6, 'WR', 'WR', { started: true })) === 'none', 'starter game started -> nothing');
ok(lvl(one(6, 'WR', 'WR', {}, { started: true })) === 'none', 'bench game started -> nothing');
ok(lvl(one(6, 'WR', 'WR', { started: true, status: 'O' })) === 'none', 'starter Out but game started -> nothing');

console.log('Kicker and defense');
ok(lvl(one(4, 'K')) === 'consider', 'K gap of 4 -> Consider (never Start)');
ok(lvl(one(4, 'DST')) === 'consider', 'DST gap of 4 -> Consider (never Start)');
ok(lvl(one(-2, 'K', 'K', { status: 'O' })) === 'start', 'K Out -> Start');
r = evaluate({ week: 12, slots: [{ label: 'DST', p: null }], bench: [], info: {} });
ok(lvl(r) === 'start' && r[0].title === 'You have an empty defense slot', 'empty DST -> Start', r[0]);

console.log('Questionable bench players');
ok(lvl(one(6, 'WR', 'WR', {}, { status: 'Q' })) === 'none', 'Questionable bench player never suggested');
ok(lvl(one(6, 'WR', 'WR', {}, { status: 'D' })) === 'none', 'Doubtful bench player never suggested');
ok(lvl(one(6, 'WR', 'WR', { status: 'Q' })) === 'start', 'Questionable starter compared on projection');

console.log('One bench player best for two slots');
r = evaluate({ week: 12, slots: [{ label: 'WR', p: 'w1' }, { label: 'FLEX', p: 'r1' }], bench: ['star', 'b2'],
  info: { w1: P('WR One', 'WR', 9), r1: P('RB One', 'RB', 7), star: P('Star WR', 'WR', 14), b2: P('Backup WR', 'WR', 10) } });
const benches = r.map(a => a.bench);
ok(new Set(benches).size === benches.length, 'never the same bench player twice', benches);
ok(r.find(a => a.slot === 'FLEX').bench === 'star' && r.find(a => a.slot === 'FLEX').level === 'start', 'star goes where the gap is biggest (FLEX, 7 more)', r);
ok(r.find(a => a.slot === 'WR').bench === 'b2' && r.find(a => a.slot === 'WR').level === 'consider', 'other slot gets next-best (WR, 1.0 more -> Consider)', r);

console.log('FLEX eligibility');
r = evaluate({ week: 12, slots: [{ label: 'FLEX', p: 's' }], bench: ['te', 'qb'], info: { s: P('Flex RB', 'RB', 6), te: P('Bench TE', 'TE', 10), qb: P('Bench QB', 'QB', 20) } });
ok(r.length === 1 && r[0].bench === 'te' && r[0].level === 'start', 'FLEX takes a TE, never a QB', r);
r = evaluate({ week: 12, slots: [{ label: 'FLEX', el: ['WR', 'TE'], p: 's' }], bench: ['rb'], info: { s: P('Flex WR', 'WR', 6), rb: P('Bench RB', 'RB', 12) } });
ok(r.length === 0, 'WR/TE flex (ESPN slot) never takes an RB', r);
r = evaluate({ week: 12, slots: [{ label: 'RB', p: 's' }], bench: ['wr'], info: { s: P('RB', 'RB', 4), wr: P('Bench WR', 'WR', 15) } });
ok(r.length === 0, 'RB slot never takes a WR', r);

console.log('Push timing (time zone America/Chicago)');
const tz = 'America/Chicago', at = (s) => Date.parse(s);
const kick = at('2026-11-29T18:00:00Z');                    // Sunday noon Central
const startA = one(3)[0], cons = one(1)[0];
const plan = (now, extra = {}) => planPush({ now: at(now), tz, league: { id: 'L1', name: 'Dynasty Bros' }, alerts: [startA, cons], kickoff: { s: kick, b: kick }, sent: [], ...extra });
ok(!plan('2026-11-28T20:00:00Z').send, 'day before the game: wait', plan('2026-11-28T20:00:00Z'));
ok(!plan('2026-11-29T13:30:00Z').send, '7:30am game day: wait for 8am');
ok(plan('2026-11-29T14:05:00Z').send, '8:05am game day: send');
ok(!plan('2026-11-29T16:45:00Z').send, '75 min before kickoff: too late (not urgent)');
const p1 = plan('2026-11-29T14:05:00Z');
ok(p1.body === 'Start Bench over Starter in Dynasty Bros' && p1.url === '/#team?league=L1', 'one change: names it, opens My Team for that league', p1);
ok(p1.swapKeys.length === 1, 'Consider lines are never pushed', p1.swapKeys);
const three = [startA, { ...startA, swapKey: 'x2', starter: 's' }, { ...startA, swapKey: 'x3', starter: 's' }];
ok(planPush({ now: at('2026-11-29T14:05:00Z'), tz, league: { id: 'L1', name: 'Dynasty Bros' }, alerts: three, kickoff: { s: kick }, sent: [] }).body === '3 lineup changes to make in Dynasty Bros', 'bundles: "3 lineup changes to make in …"');
ok(!plan('2026-11-29T14:05:00Z', { sent: [{ swapKey: startA.swapKey, at: at('2026-11-29T14:00:00Z') }] }).send, 'same swap never pushed twice');
const other = { ...startA, swapKey: 'w12:other>b', starter: 's' };
ok(!planPush({ now: at('2026-11-29T15:00:00Z'), tz, league: { id: 'L1' }, alerts: [other], kickoff: { s: kick }, sent: [{ swapKey: 'old', at: at('2026-11-29T14:05:00Z') }] }).send, 'one lineup push per league per day');
const outA = one(-3, 'WR', 'WR', { status: 'O' })[0];
const late = planPush({ now: at('2026-11-29T17:15:00Z'), tz, league: { id: 'L1', name: 'X' }, alerts: [outA], kickoff: { s: kick }, sent: [{ swapKey: 'old', at: at('2026-11-29T14:05:00Z') }] });
ok(late.send && late.urgent, 'starter ruled Out inside 90 min: send right away', late);
const night = at('2026-11-27T01:15:00Z');                   // Thursday 7:15pm Central kickoff
ok(!planPush({ now: at('2026-11-27T05:30:00Z'), tz, league: { id: 'L1' }, alerts: [startA], kickoff: { s: night }, sent: [] }).send, 'after the game: nothing');
ok(planPush({ now: at('2026-11-26T14:00:00Z'), tz, league: { id: 'L1' }, alerts: [startA], kickoff: { s: night }, sent: [] }).send, 'Thursday night game: morning of game day');
ok(LA.sendLineupPush('u', p1).stub === true, 'push send is the marked stub until push is on main');

console.log(`\n${n - fails} of ${n} passed`);
process.exit(fails ? 1 : 0);
