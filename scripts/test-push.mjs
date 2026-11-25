// Checks the rules for injury push notifications (api/_push.js). Run: node scripts/test-push.mjs
import assert from 'node:assert/strict';
import { userRosters, injuryEvents, injuryPayload, summaryPayload, planSends, isQuiet, RULES } from '../api/_push.js';

const players = { 'ja-marr-chase': { n: "Ja'Marr Chase", t: 'CIN' }, 'josh-allen': { n: 'Josh Allen', t: 'BUF' }, 'bijan-robinson': { n: 'Bijan Robinson', t: 'ATL' } };
const league = (key, type, ids, name) => ({ key, name, src: type, snap: { me: 't1', teams: [{ id: 't1', players: ids }, { id: 't2', players: ['bijan-robinson'] }], real: { src: { type } } } });
const now = Date.parse('2026-11-22T18:00:00Z'), min = 60e3;
const row = (src, name, team, was, st, agoMin, body = 'Hamstring') => ({ src, name, team, was, st, body, at: now - agoMin * min });
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('rosters: only my team, and the feed follows the league platform', () => {
  const a = userRosters({ leagues: [league('s:1', 'sleeper', ['ja-marr-chase'], 'Home League')] }, players);
  assert.equal(a.src, 'sleeper'); assert.deepEqual(Object.keys(a.roster), ['jamarr chase']);
  const b = userRosters({ leagues: [league('e:1', 'espn', ['josh-allen'], 'Work')] }, players);
  assert.equal(b.src, 'espn');
  const c = userRosters({ leagues: [league('e:1', 'espn', ['josh-allen'], 'Work'), league('s:1', 'sleeper', ['ja-marr-chase'], 'Home')] }, players);
  assert.equal(c.src, 'sleeper'); assert.equal(Object.keys(c.roster).length, 2);
});
t('a league set to "News tab only" sends nothing', () => {
  const a = userRosters({ notif: { off: ['s:1'] }, leagues: [league('s:1', 'sleeper', ['ja-marr-chase'], 'Home')] }, players);
  assert.equal(Object.keys(a.roster).length, 0);
});
const U = userRosters({ leagues: [league('s:1', 'sleeper', ['ja-marr-chase', 'josh-allen'], 'Home League')] }, players);
const ev = (log, cur) => injuryEvents({ ...U, log, cur, now });

t('one feed only, just seen: NOT sent yet (unconfirmed)', () => {
  assert.equal(ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 3)], { sleeper: { 'jamarr chase': 'O' }, espn: {} }).length, 0);
});
t('one feed only, still true 10+ minutes later: sent', () => {
  const e = ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 12)], { sleeper: { 'jamarr chase': 'O' }, espn: {} });
  assert.equal(e.length, 1); assert.equal(e[0].st, 'O');
});
t('both feeds agree he is hurt: sent right away', () => {
  assert.equal(ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 1)], { sleeper: { 'jamarr chase': 'O' }, espn: { 'jamarr chase': 'Q' } }).length, 1);
});
t('the feed corrected itself: never sent', () => {
  assert.equal(ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 30)], { sleeper: {}, espn: {} }).length, 0);
  assert.equal(ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 30)], { sleeper: { 'jamarr chase': 'Q' }, espn: {} }).length, 0);
});
t('the user\'s feed is down: nothing sent', () => {
  assert.equal(ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 30)], { sleeper: null, espn: { 'jamarr chase': 'O' } }).length, 0);
});
t('the other platform\'s report is ignored (one consistent source)', () => {
  assert.equal(ev([row('espn', "Ja'Marr Chase", 'CIN', '', 'O', 30)], { sleeper: {}, espn: { 'jamarr chase': 'O' } }).length, 0);
});
t('only the newest change per player; cleared or not-mine players are skipped', () => {
  const log = [row('sleeper', "Ja'Marr Chase", 'CIN', '', 'Q', 200), row('sleeper', "Ja'Marr Chase", 'CIN', 'Q', 'O', 30), row('sleeper', 'Josh Allen', 'BUF', 'Q', '', 30), row('sleeper', 'Bijan Robinson', 'ATL', '', 'O', 30)];
  const e = ev(log, { sleeper: { 'jamarr chase': 'O', 'bijan robinson': 'O' }, espn: {} });
  assert.equal(e.length, 1); assert.equal(e[0].st, 'O'); assert.equal(e[0].was, 'Q');
});
t('old news (12+ hours) and same-name players on another team are skipped', () => {
  assert.equal(ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 13 * 60)], { sleeper: { 'jamarr chase': 'O' }, espn: {} }).length, 0);
  assert.equal(ev([row('sleeper', 'Josh Allen', 'JAX', '', 'O', 30)], { sleeper: { 'josh allen': 'O' }, espn: {} }).length, 0);
});
t('same event keeps the same key (so it can never be sent twice)', () => {
  const log = [row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 30)], cur = { sleeper: { 'jamarr chase': 'O' }, espn: {} };
  assert.equal(ev(log, cur)[0].key, injuryEvents({ ...U, log, cur, now: now + 15 * min })[0].key);
});
t('wording', () => {
  const e = ev([row('sleeper', "Ja'Marr Chase", 'CIN', '', 'O', 30)], { sleeper: { 'jamarr chase': 'O' }, espn: {} })[0], p = injuryPayload(e);
  assert.equal(p.title, "Ja'Marr Chase is out"); assert.equal(p.body, 'CIN · hamstring. On your team in Home League.'); assert.equal(p.tag, 'inj-jamarr-chase'); assert.equal(p.url, '/#news');
  assert.equal(injuryPayload({ ...e, st: 'Q', was: 'O' }).title, "Ja'Marr Chase upgraded to questionable");
  assert.equal(injuryPayload({ ...e, st: 'IR' }).title, "Ja'Marr Chase placed on injured reserve");
  assert.match(summaryPayload([e, e, e]).title, /^3 more status changes/);
  assert.doesNotMatch(JSON.stringify([p, summaryPayload([e, e])]), /sleeper|espn/i);
});
t('rate limit: a handful per hour, extras in one summary, then hold', () => {
  const E = [1, 2, 3, 4, 5, 6, 7].map(i => ({ key: 'k' + i }));
  let p = planSends(E, 0); assert.equal(p.solo.length, RULES.perHour); assert.equal(p.rest.length, 3);
  p = planSends(E, 3); assert.equal(p.solo.length, 1); assert.equal(p.rest.length, 6);
  p = planSends(E, RULES.perHour + 1); assert.equal(p.solo.length + p.rest.length, 0); assert.equal(p.hold.length, 7);
});
t('quiet hours: 11pm to 8am in the user\'s time zone', () => {
  const at = s => Date.parse(s);
  assert.equal(isQuiet('America/New_York', at('2026-11-23T04:30:00Z')), true);    // 11:30pm
  assert.equal(isQuiet('America/New_York', at('2026-11-23T12:30:00Z')), true);    // 7:30am
  assert.equal(isQuiet('America/New_York', at('2026-11-23T13:05:00Z')), false);   // 8:05am
  assert.equal(isQuiet('America/Los_Angeles', at('2026-11-23T04:30:00Z')), false); // 8:30pm
  assert.equal(isQuiet('Not/AZone', at('2026-11-23T04:30:00Z')), true);           // unknown: treated as Eastern
});
/* ---- trade deadlines and lineup fixes (api/_alerts.js) ---- */
const { deadlineNotice, lineupIssues, lineupTiming, gameSchedule } = await import('../api/_alerts.js');
const H = 36e5, D = 864e5, L0 = { key: 'sleeper:1', name: 'Home League' };
t('deadline: a week out, 3 days out, final day, and nothing after it passes', () => {
  assert.match(deadlineNotice(L0, now + 6.2 * D, now, 'America/New_York').title, /Trade deadline in 6 days/);
  assert.match(deadlineNotice(L0, now + 2.5 * D, now, 'America/New_York').k, /:d3$/);
  const f = deadlineNotice(L0, now + 5 * H, now, 'America/New_York');
  assert.match(f.title, /^Last day to trade: Home League$/); assert.equal(f.url, '/#trade');
  assert.equal(deadlineNotice(L0, now + 9 * D, now, 'America/New_York'), null);
  assert.equal(deadlineNotice(L0, now - H, now, 'America/New_York'), null);
});
const G = { BUF: { start: now + 2 * H, state: 'pre' }, KC: { start: now + 2 * H, state: 'pre' }, LAR: { start: now + 2 * H, state: 'pre' }, DAL: { start: now - H, state: 'in' }, MIA: { start: now + 30 * H, state: 'pre' } };
const P = (id, pos, team, pj, bad) => ({ id, n: id, pos, team, pj, bad: bad || null });
const slot = (label, el, p) => ({ label, el, p });
t('lineup: empty slot, starter out, starter on bye', () => {
  const L = { app: 'Sleeper', slots: [slot('RB', ['RB'], P('A', 'RB', 'KC', 10, 'is out')), slot('TE', ['TE'], P('T', 'TE', 'NYJ', 6)), slot('FLEX', ['RB', 'WR', 'TE'], null)], bench: [P('B', 'RB', 'LAR', 9)] };
  const out = lineupIssues(L, G, now, 12).map(x => x.k);
  assert.deepEqual(out, ['12:0:out:A', '12:1:bye:T', '12:2:empty']);
});
t('lineup: bench swap only when 5+ more AND about double, and never once a game started', () => {
  const mk = (sp, bp, team = 'BUF') => ({ app: 'ESPN', slots: [slot('WR', ['WR'], P('S', 'WR', team, sp))], bench: [P('B', 'WR', 'KC', bp)] });
  assert.equal(lineupIssues(mk(4, 12), G, now, 12).length, 1);          // 8 more and 3x: yes
  assert.equal(lineupIssues(mk(10, 16), G, now, 12).length, 0);         // 6 more but not double: no
  assert.equal(lineupIssues(mk(4, 8), G, now, 12).length, 0);           // double but only 4 more: no
  assert.equal(lineupIssues(mk(4, 12, 'DAL'), G, now, 12).length, 0);   // his game already started: no
});

/* when lineup alerts go out (owner, 2026-11-25): Thursday games -> 6 pm the day before + 4 hours before;
   Sat/Sun/Mon games -> Friday 6 pm + 1 hour before; new problems in between go out right away */
const ET = 'America/New_York', Z = s => Date.parse(s);
const THU = Z('2026-11-27T01:15:00Z'), SUN = Z('2026-11-29T18:00:00Z'), MON = Z('2026-12-01T01:15:00Z');   // Thu 8:15pm, Sun 1pm, Mon 8:15pm ET
const GW = { DAL: { start: THU, state: 'pre' }, BUF: { start: SUN, state: 'pre' }, KC: { start: MON, state: 'pre' } };
const keyOf = (iss, at) => lineupTiming(iss, GW, Z(at), ET).map(x => x.when + ' ' + x.k);
t('timing: the heads-up times and reminder leads', () => {
  assert.equal(new Date(gameSchedule(THU, ET).eve).toISOString(), '2026-11-25T23:00:00.000Z');          // Wed 6pm ET
  assert.equal(gameSchedule(THU, ET).lead, 4 * H);
  assert.equal(new Date(gameSchedule(SUN, ET).eve).toISOString(), '2026-11-27T23:00:00.000Z');          // Fri 6pm ET
  assert.equal(new Date(gameSchedule(MON, ET).eve).toISOString(), '2026-11-27T23:00:00.000Z');          // Monday night: same Friday
  assert.equal(gameSchedule(SUN, ET).lead, H);
  assert.equal(new Date(gameSchedule(SUN, 'America/Los_Angeles').eve).toISOString(), '2026-11-28T02:00:00.000Z');   // Fri 6pm Pacific
});
t('timing: Thursday player out -> nothing before Wed 6pm, heads-up after, reminder 4 hours before', () => {
  const iss = [{ k: 'o', kind: 'out', kick: THU }];
  assert.deepEqual(keyOf(iss, '2026-11-25T22:30:00Z'), []);                                             // Wed 5:30pm
  assert.deepEqual(keyOf(iss, '2026-11-25T23:05:00Z'), ['eve o:wd2026-11-26']);                          // Wed 6:05pm
  assert.deepEqual(keyOf(iss, '2026-11-26T21:30:00Z'), ['pre o:p' + THU]);                               // Thu 4:30pm
});
t('timing: Sunday player ruled out on Saturday -> sent right away as a change; then the 1-hour reminder', () => {
  const iss = [{ k: 'o', kind: 'out', kick: SUN }];
  assert.deepEqual(keyOf(iss, '2026-11-27T20:00:00Z'), []);                                             // Fri 3pm: too early
  assert.deepEqual(keyOf(iss, '2026-11-28T17:00:00Z'), ['change o:wwknd']);                              // Sat noon
  assert.deepEqual(keyOf(iss, '2026-11-29T17:10:00Z'), ['pre o:p' + SUN]);                               // Sun 12:10pm
});
t('timing: bench swaps only at the heads-up and the reminder, not as changes', () => {
  const iss = [{ k: 'b', kind: 'bench', kick: SUN }];
  assert.deepEqual(keyOf(iss, '2026-11-27T23:10:00Z'), ['eve b:wwknd']);                                 // Fri 6:10pm
  assert.deepEqual(keyOf(iss, '2026-11-28T17:00:00Z'), []);                                              // Sat noon: projections moved, quiet
  assert.deepEqual(keyOf(iss, '2026-11-29T17:15:00Z'), ['pre b:p' + SUN]);                               // Sun 12:15pm
});
t('timing: an empty slot follows the next game: Thursday heads-up, then the weekend ones', () => {
  const iss = [{ k: 'e', kind: 'empty', kick: null }];
  assert.deepEqual(keyOf(iss, '2026-11-25T23:05:00Z'), ['eve e:wd2026-11-26']);
  const after = { ...GW, DAL: { start: THU, state: 'in' } };
  assert.deepEqual(lineupTiming(iss, after, Z('2026-11-27T23:05:00Z'), ET).map(x => x.k), ['e:wwknd']);
  assert.deepEqual(lineupTiming(iss, after, Z('2026-11-29T17:05:00Z'), ET).map(x => x.k), ['e:pwknd']);
});

console.log(`\n${n} checks passed`);
