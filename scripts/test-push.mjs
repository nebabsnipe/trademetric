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
console.log(`\n${n} checks passed`);
