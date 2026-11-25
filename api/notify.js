// Phone/desktop notifications, sent on a schedule (a GitHub Action opens this address every 30 minutes).
// For every account with alerts turned on it checks each saved league, straight from Sleeper or ESPN:
//   - trade deadline: about a week out, about 3 days out, and a final one in the last 24 hours
//   - lineup fixes, within 3 hours of a kickoff: an empty starting slot, a starter who is out / on IR / suspended /
//     on bye, or a bench player projected at least 5 points more (and about double) than the starter he'd replace.
//     Same rules as the lineup alerts on the site.
// Every notice is sent once (push_sent). Nothing is sent between 10 pm and 8 am in the person's own time zone.
// Safe to open by anyone: it runs at most once every 20 minutes and only ever sends people their own alerts.
// Private ESPN leagues get deadline notices only (their login codes never leave the person's browser).

import { kvGet, kvPut, sbRest } from './_shared.js';
import { pushOn, subsFor, sendTo } from './_push.js';

export const config = { maxDuration: 60 };

const H = 36e5, D = 864e5, LU_GAP = 5, LU_X = 1.8, SOON = 3 * H;
const TEAM = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' }, fix = t => TEAM[t] || t;
const ESPN_TEAM = { 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU' };
const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
const ESPN_SLOT = { 0: 'QB', 2: 'RB', 3: 'RB/WR', 4: 'WR', 5: 'WR/TE', 6: 'TE', 7: 'superflex', 16: 'D/ST', 17: 'K', 23: 'FLEX' };
const SLP_EL = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'], FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['RB', 'WR'] };
const SLP_LAB = { SUPER_FLEX: 'superflex', REC_FLEX: 'WR/TE', WRRB_FLEX: 'RB/WR', DEF: 'D/ST' };
const SLP_BAD = { Out: 'is out', IR: 'is on injured reserve', PUP: 'is on the PUP list', Sus: 'is suspended' };
const ESPN_BAD = { OUT: 'is out', INJURY_RESERVE: 'is on injured reserve', SUSPENSION: 'is suspended' };
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

async function j(url, headers = {}) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (TradeMetric alerts)', ...headers } });
  if (!r.ok) throw new Error(url.split('?')[0] + ' ' + r.status);
  return r.json();
}

/* ---------- this week's games: kickoff time per team (a team with no game is on bye) ---------- */
function gamesOf(board) {
  const out = {};
  for (const ev of (board && board.events) || []) {
    const c = ev.competitions && ev.competitions[0], st = (ev.status && ev.status.type && ev.status.type.state) || 'pre';
    for (const x of (c && c.competitors) || []) out[fix(x.team && x.team.abbreviation)] = { start: Date.parse(ev.date), state: st };
  }
  return out;
}

/* ---------- time in the person's own zone ---------- */
const tzOk = tz => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };
const hourIn = (ms, tz) => +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(ms);
const dayIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(ms);
const whenIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);
const timeIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms);
export const quiet = (ms, tz) => { const h = hourIn(ms, tz); return h >= 22 || h < 8; };

/* ---------- trade deadline notices ---------- */
export function deadlineNotice(lg, at, now, tz) {
  const left = at - now;
  if (!(left > 0) || left > 7 * D) return null;
  const st = left <= D ? 'final' : left <= 3 * D ? 'd3' : 'wk';
  const when = lg.dlWeek ? `${dayIn(at, tz)}, after the last Week ${lg.dlWeek} game` : whenIn(at, tz);
  const k = `dl:${lg.key}:${Math.round(at / 6e4)}:${st}`;
  if (st === 'final') {
    const today = dayIn(at, tz) === dayIn(now, tz);
    return { k, title: `Last day to trade: ${lg.name}`, body: `The trade deadline is ${lg.dlWeek ? (today ? 'tonight, after the last game' : 'after the last game ' + dayIn(at, tz)) : (today ? 'today at ' : dayIn(at, tz) + ' at ') + timeIn(at, tz)}. Tap to build a trade before it closes.`, url: '/#trade', urgent: true, tag: 'dl-' + lg.key };
  }
  const days = Math.round(left / D);
  return { k, title: st === 'd3' ? `Trade deadline is ${dayIn(at, tz)}` : `Trade deadline in ${days} days`, body: `${lg.name}: deadline ${when}. Line up the deals you want now.`, url: '/#trade', tag: 'dl-' + lg.key };
}

/* ---------- lineup checks (same rules as the site's lineup alerts) ----------
   lineup: { app, slots: [{label, el:[positions], p: player|null}], bench: [player] }
   player: { id, n, pos, team, bad: 'is out'|..., pj: projected points } */
export function lineupIssues(lineup, games, now, week) {
  const out = [], used = new Set(), app = lineup.app;
  const started = p => { const g = games[p.team]; return !!(g && (g.state !== 'pre' || g.start <= now)); };
  const bye = p => !!p.team && !games[p.team];
  const soon = p => { const g = games[p.team]; return !!(g && g.state === 'pre' && g.start > now && g.start - now <= SOON); };
  const ok = p => !!p.team && !bye(p) && !p.bad && !started(p);
  const best = (x, skip) => lineup.bench.filter(b => x.el.includes(b.pos) && ok(b) && !used.has(b.id) && b.id !== skip).sort((a, b) => b.pj - a.pj)[0];
  const pick = x => { const pos = x.el.map(p => p === 'DEF' ? 'defense' : p === 'K' ? 'kicker' : p); return (pos[0] === 'RB' ? 'an ' : 'a ') + (pos.length > 1 ? pos.slice(0, -1).join(', ') + ' or ' + pos.slice(-1) : pos[0]); };
  lineup.slots.forEach((x, i) => {
    if (!x.p) { const b = best(x); if (b) used.add(b.id);
      out.push({ k: `${week}:${i}:empty`, msg: b ? `Your ${x.label} is empty. Start ${b.n} in ${app}.` : `Your ${x.label} is empty. Pick up ${pick(x)} in ${app}.` }); return; }
    const p = x.p; if (started(p)) return;
    const why = bye(p) ? 'is on bye' : p.bad || (!p.team ? 'is not on an NFL team' : null);
    if (why) { const b = best(x, p.id); if (b) used.add(b.id);
      out.push({ k: `${week}:${i}:${bye(p) ? 'bye' : 'out'}:${p.id}`, msg: `${p.n} ${why}. ${b ? `Start ${b.n} in ${app}.` : `Pick up ${pick(x)} in ${app}.`}` }); return; }
    if (!soon(p)) return;   // projections move all week: only call a bench swap close to his kickoff
    const b = best(x, p.id); if (!b) return;
    if (b.pj >= p.pj + LU_GAP && b.pj >= p.pj * LU_X) { used.add(b.id);
      out.push({ k: `${week}:${i}:bench:${p.id}:${b.id}`, msg: `Start ${b.n} over ${p.n} at ${x.label} in ${app} (${f1(b.pj)} vs ${f1(p.pj)} projected).` }); }
  });
  return out;
}

/* ---------- reading leagues from the platforms (cached for the length of one run) ---------- */
function makeReader(season, week) {
  const memo = new Map(), once = (k, fn) => { if (!memo.has(k)) memo.set(k, fn().catch(() => null)); return memo.get(k); };
  const slpPlayers = () => once('slp:players', () => j('https://api.sleeper.app/v1/players/nfl'));
  const slpProj = () => once('slp:proj', async () => {
    const pos = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => 'position[]=' + p).join('&');
    const rows = await j(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${pos}`), m = {};
    for (const x of Array.isArray(rows) ? rows : []) if (x && x.player_id) m[x.player_id] = x.stats || {};
    return m;
  });
  return {
    async sleeper(id) {
      const [lg, rosters] = await Promise.all([once('slp:lg:' + id, () => j(`https://api.sleeper.app/v1/league/${id}`)), once('slp:ro:' + id, () => j(`https://api.sleeper.app/v1/league/${id}/rosters`))]);
      return { lg, rosters };
    },
    slpPlayers, slpProj,
    espn: id => once('espn:' + id, () => j(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${id}?view=mRoster&view=mSettings&view=mTeam&scoringPeriodId=${week}`)),
  };
}

export function sleeperLineup(lg, roster, P, proj) {
  const ss = lg.scoring_settings || {}, score = s => { let t = 0; for (const k in s) if (ss[k]) t += ss[k] * (+s[k] || 0); return t; };
  const pl = id => { const x = P && P[id]; if (!x) return null; const pos = x.position;
    const st = x.injury_status || (x.status === 'Injured Reserve' ? 'IR' : '');
    return { id, n: pos === 'DEF' ? `${x.team || id} D/ST` : x.full_name || `${x.first_name} ${x.last_name}`, pos, team: fix(x.team || (pos === 'DEF' ? id : '')), bad: SLP_BAD[st] || null, pj: proj && proj[id] ? score(proj[id]) : 0 }; };
  const labels = (lg.roster_positions || []).filter(x => !['BN', 'IR', 'TAXI'].includes(x)), S = roster.starters || [];
  const slots = labels.map((lab, i) => ({ label: SLP_LAB[lab] || lab, el: SLP_EL[lab] || [lab], p: S[i] && S[i] !== '0' ? pl(S[i]) : null }));
  const skip = new Set([...S, ...(roster.reserve || []), ...(roster.taxi || [])]);
  return { app: 'Sleeper', slots, bench: (roster.players || []).filter(id => !skip.has(id)).map(pl).filter(Boolean) };
}

export function espnLineup(d, team, week) {
  const counts = (d.settings && d.settings.rosterSettings && d.settings.rosterSettings.lineupSlotCounts) || {};
  const pl = e => { const x = e.playerPoolEntry && e.playerPoolEntry.player; if (!x) return null; const pos = ESPN_POS[x.defaultPositionId]; if (!pos) return null;
    const st = (x.stats || []).find(s => s.statSourceId === 1 && s.scoringPeriodId === week);
    return { id: String(x.id), n: x.fullName, pos, team: ESPN_TEAM[x.proTeamId] || '', bad: ESPN_BAD[x.injuryStatus] || null, pj: st ? +st.appliedTotal || 0 : 0,
      el: (x.eligibleSlots || []).map(Number) }; };
  const E = ((team.roster && team.roster.entries) || []).map(e => ({ slot: e.lineupSlotId, p: pl(e) })).filter(x => x.p);
  const slots = [];
  Object.keys(ESPN_SLOT).map(Number).forEach(sid => { const n = +counts[sid] || 0, here = E.filter(x => x.slot === sid);
    for (let i = 0; i < n; i++) slots.push({ label: ESPN_SLOT[sid], sid, p: here[i] ? here[i].p : null }); });
  const bench = E.filter(x => x.slot === 20).map(x => x.p);
  // which positions can fill each slot, from ESPN's own eligibility lists
  slots.forEach(s => { s.el = [...new Set([...bench, ...E.map(x => x.p)].filter(p => p.el.includes(s.sid)).map(p => p.pos))]; if (!s.el.length) s.el = [s.label]; });
  return { app: 'ESPN', slots, bench };
}

/* every saved league in an account, with what the server needs to look it up */
function leaguesOf(S) {
  const L = S.leagues && S.leagues.length ? S.leagues : [{ key: S.leagueKey, name: S.league && S.league.name }], out = [];
  for (const e of L) {
    const cur = e.key === S.leagueKey, snap = cur ? S : e.snap; if (!snap) continue;
    const src = snap.real && snap.real.src, rid = src && src.rid ? Object.keys(src.rid).find(r => src.rid[r] === snap.me) : null;
    out.push({ key: e.key, name: (cur && S.league && S.league.name) || e.name || (snap.league && snap.league.name) || 'League', type: src && src.type, id: src && src.league, priv: !!(src && src.priv), rid, tdl: snap.league && snap.league.tdl });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!pushOn()) return res.status(200).json({ ok: false, why: 'push keys not set' });
  const now = Date.now();
  // one run at a time, at most every 20 minutes
  const lock = await kvGet('push:run');
  if (!lock) return res.status(200).json({ ok: false, why: 'store unavailable' });
  if (lock.value && now - (lock.value.at || 0) < 20 * 60e3) return res.status(200).json({ ok: true, skipped: 'ran recently' });
  if (!(await kvPut('push:run', { at: now }, lock.updated_at === null ? null : lock.updated_at))) return res.status(200).json({ ok: true, skipped: 'another run' });

  const subs = await subsFor();
  if (!subs.length) return res.status(200).json({ ok: true, users: 0 });
  const users = [...new Set(subs.map(s => s.user_id))];
  const [states, sentRows, nfl] = await Promise.all([
    sbRest(`user_state?select=user_id,state&user_id=in.(${users.join(',')})`, { ms: 8000 }),
    sbRest(`push_sent?select=user_id,k&user_id=in.(${users.join(',')})&at=gte.${new Date(now - 21 * D).toISOString()}`, { ms: 6000 }),
    j('https://api.sleeper.app/v1/state/nfl').catch(() => null),
  ]);
  if (!Array.isArray(states) || !nfl) return res.status(200).json({ ok: false, why: 'could not read accounts or the NFL week' });
  const season = +nfl.season, week = +nfl.week;
  const board = await j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`).catch(() => null);
  const games = gamesOf(board), starts = Object.values(games).map(g => g.start).filter(Boolean);
  const weekEnd = starts.length ? Math.max(...starts) + 3.5 * H : null;   // the last game of the week ends
  const lineupTime = Object.values(games).some(g => g.state === 'pre' && g.start > now && g.start - now <= SOON);
  const sent = new Set((Array.isArray(sentRows) ? sentRows : []).map(r => r.user_id + '|' + r.k)), rd = makeReader(season, week);
  let nSent = 0; const newSent = [];

  for (const row of states) {
    const S = row.state || {}, uid = row.user_id, N = S.notif || {}, pref = N.push || {};
    const tz = tzOk(N.tz) ? N.tz : 'America/New_York';
    if (quiet(now, tz)) continue;
    const msgs = [];
    for (const lg of leaguesOf(S)) {
      if ((N.off || []).includes(lg.key)) continue;
      try {
        let tdl = lg.tdl, data = null;
        if (lg.type === 'sleeper' && lg.id) { data = await rd.sleeper(lg.id); const w = +(data.lg && data.lg.settings && data.lg.settings.trade_deadline) || 0; tdl = w >= 1 && w <= 18 ? { wk: w } : null; }
        if (lg.type === 'espn' && lg.id && !lg.priv) { data = await rd.espn(lg.id); const t = +(data && data.settings && data.settings.tradeSettings && data.settings.tradeSettings.deadlineDate) || 0; tdl = t > 0 ? { at: t } : null; }
        if (pref.dl !== false && tdl) {
          const at = tdl.at || (tdl.wk && weekEnd ? weekEnd + 7 * D * (tdl.wk - week) : null);
          const m = at && deadlineNotice({ ...lg, dlWeek: tdl.wk || null }, at, now, tz);
          if (m && !sent.has(uid + '|' + m.k)) msgs.push(m);
        }
        if (pref.lu === false || !lineupTime || !lg.rid || !data) continue;
        let lineup = null;
        if (lg.type === 'sleeper') { const r = (data.rosters || []).find(x => String(x.roster_id) === String(lg.rid)); const [P, proj] = await Promise.all([rd.slpPlayers(), rd.slpProj()]); if (r && P) lineup = sleeperLineup(data.lg, r, P, proj); }
        else if (lg.type === 'espn') { const t = (data.teams || []).find(x => String(x.id) === String(lg.rid)); if (t) lineup = espnLineup(data, t, week); }
        if (!lineup) continue;
        const iss = lineupIssues(lineup, games, now, week).map(x => ({ ...x, k: `lu:${lg.key}:${x.k}` })).filter(x => !sent.has(uid + '|' + x.k));
        if (iss.length) msgs.push({ k: iss.map(x => x.k), title: `Lineup fix: ${lg.name}`, body: iss[0].msg + (iss.length > 1 ? ` Plus ${iss.length - 1} more.` : ''), url: '/#team', urgent: true, tag: 'lu-' + lg.key });
      } catch (e) { /* one league failing never stops the others */ }
    }
    if (!msgs.length) continue;
    const devs = subs.filter(s => s.user_id === uid);
    for (const m of msgs) {
      let ok = false; for (const s of devs) if (await sendTo(s, { title: m.title, body: m.body, url: m.url, tag: m.tag, urgent: m.urgent })) ok = true;
      if (ok) { nSent++; (Array.isArray(m.k) ? m.k : [m.k]).forEach(k => newSent.push({ user_id: uid, k })); }
    }
  }
  if (newSent.length) await sbRest('push_sent?on_conflict=user_id,k', { method: 'POST', body: newSent, prefer: 'resolution=ignore-duplicates,return=minimal', ms: 6000 });
  return res.status(200).json({ ok: true, users: users.length, sent: nSent, lineupTime });
}
