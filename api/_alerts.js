// Trade deadline and lineup alerts for push notifications. Helper for api/push.js (the scheduled check), not an
// endpoint. Reads each saved league straight from Sleeper or ESPN:
//   - trade deadline: about a week out, about 3 days out, and a final one in the last 24 hours
//   - lineup fixes: an empty starting slot, a starter who is out / on IR / suspended / on bye, or a bench player
//     projected at least 5 points more (and about double) than the starter he'd replace. When (owner, 2026-11-25):
//       Thursday games (and any other midweek game): 6 pm the day before, and 1.5 hours before kickoff
//       Saturday / Sunday / Monday games: Friday at 6 pm, and 1 hour before kickoff
//       and in between, any NEW problem (a starter ruled out, a slot left empty) is sent right away
//     The same rules as the lineup alerts on the site (lineupAlerts in js/app.js); projections are the league
//     platform's own, scored with that league's settings.
// Private ESPN leagues get deadline notices only (their login codes never leave the person's browser).

const H = 36e5, D = 864e5, LU_GAP = 5, LU_X = 1.8;
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
const dayIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(ms);
const whenIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);
const timeIn = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms);

/* ---------- trade deadline notices ---------- */
export function deadlineNotice(lg, at, now, tz) {
  const left = at - now;
  if (!(left > 0) || left > 7 * D) return null;
  const st = left <= D ? 'final' : left <= 3 * D ? 'd3' : 'wk';
  const when = lg.dlWeek ? `${dayIn(at, tz)}, after the last Week ${lg.dlWeek} game` : whenIn(at, tz);
  const k = `dl:${lg.key}:${Math.round(at / 6e4)}:${st}`;
  if (st === 'final') {
    const today = dayIn(at, tz) === dayIn(now, tz);
    return { k, title: `Last day to trade: ${lg.name}`, body: `The trade deadline is ${lg.dlWeek ? (today ? 'tonight, after the last game' : 'after the last game ' + dayIn(at, tz)) : (today ? 'today at ' : dayIn(at, tz) + ' at ') + timeIn(at, tz)}. Tap to build a trade before it closes.`, url: '/#trade', urgent: true, tag: ('dl-' + lg.key).replace(/[^A-Za-z0-9_-]/g, '-') };
  }
  const days = Math.round(left / D);
  return { k, title: st === 'd3' ? `Trade deadline is ${dayIn(at, tz)}` : `Trade deadline in ${days} days`, body: `${lg.name}: deadline ${when}. Line up the deals you want now.`, url: '/#trade', tag: ('dl-' + lg.key).replace(/[^A-Za-z0-9_-]/g, '-') };
}

/* ---------- lineup checks (same rules as the site's lineup alerts) ----------
   lineup: { app, slots: [{label, el:[positions], p: player|null}], bench: [player] }
   player: { id, n, pos, team, bad: 'is out'|..., pj: projected points } */
export function lineupIssues(lineup, games, now, week) {
  const out = [], used = new Set(), app = lineup.app;
  const started = p => { const g = games[p.team]; return !!(g && (g.state !== 'pre' || g.start <= now)); };
  const bye = p => !!p.team && !games[p.team];
  const ok = p => !!p.team && !bye(p) && !p.bad && !started(p);
  const best = (x, skip) => lineup.bench.filter(b => x.el.includes(b.pos) && ok(b) && !used.has(b.id) && b.id !== skip).sort((a, b) => b.pj - a.pj)[0];
  const pick = x => { const pos = x.el.map(p => p === 'DEF' ? 'defense' : p === 'K' ? 'kicker' : p); return (pos[0] === 'RB' ? 'an ' : 'a ') + (pos.length > 1 ? pos.slice(0, -1).join(', ') + ' or ' + pos.slice(-1) : pos[0]); };
  lineup.slots.forEach((x, i) => {
    if (!x.p) { const b = best(x); if (b) used.add(b.id);
      out.push({ k: `${week}:${i}:empty`, kind: 'empty', kick: null, msg: b ? `Your ${x.label} is empty. Start ${b.n} in ${app}.` : `Your ${x.label} is empty. Pick up ${pick(x)} in ${app}.` }); return; }
    const p = x.p; if (started(p)) return;
    const why = bye(p) ? 'is on bye' : p.bad || (!p.team ? 'is not on an NFL team' : null);
    if (why) { const b = best(x, p.id); if (b) used.add(b.id);
      out.push({ k: `${week}:${i}:${bye(p) ? 'bye' : 'out'}:${p.id}`, kind: bye(p) ? 'bye' : 'out', kick: games[p.team] ? games[p.team].start : null, msg: `${p.n} ${why}. ${b ? `Start ${b.n} in ${app}.` : `Pick up ${pick(x)} in ${app}.`}` }); return; }
    const b = best(x, p.id); if (!b) return;
    if (b.pj >= p.pj + LU_GAP && b.pj >= p.pj * LU_X) { used.add(b.id);
      out.push({ k: `${week}:${i}:bench:${p.id}:${b.id}`, kind: 'bench', kick: games[p.team].start, msg: `Start ${b.n} over ${p.n} at ${x.label} in ${app} (${f1(b.pj)} vs ${f1(p.pj)} projected).` }); }
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


/* ---------- when lineup alerts go out ---------- */
const WEEKEND = ['Saturday', 'Sunday', 'Monday'];
function tzOff(ms, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms);
  const g = t => +p.find(x => x.type === t).value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
}
/* y-m-d h:00 on the clock in that time zone, as a moment in time */
function atLocal(y, m, d, h, tz) { let t = Date.UTC(y, m - 1, d, h); t -= tzOff(t, tz); return Date.UTC(y, m - 1, d, h) - tzOff(t, tz); }
/* the schedule for a game kicking off at `kick`, for someone in time zone tz:
   eve  = when the heads-up goes out (Friday 6 pm for Sat/Sun/Mon games, otherwise 6 pm the day before)
   lead = how long before kickoff the reminder goes out (1 hour for Sat/Sun/Mon games, otherwise 1.5 hours) */
export function gameSchedule(kick, tz) {
  const wd = dayIn(kick, 'America/New_York'), weekend = WEEKEND.includes(wd);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' }).formatToParts(kick);
  const g = t => p.find(x => x.type === t).value, local = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(g('weekday'));
  const back = weekend ? (local - 5 + 7) % 7 || 7 : 1;
  const ymd = new Date(kick).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return { id: weekend ? 'wknd' : 'd' + ymd, eve: atLocal(+g('year'), +g('month'), +g('day') - back, 18, tz), lead: weekend ? H : 1.5 * H };
}
/* Which lineup problems to send now, and under which record key (so each goes once per moment):
   - ':w<group>'  the heads-up (night before / Friday 6 pm). A problem first seen later in that window, like a starter
                  ruled out on Saturday, gets the same key, so it goes out the moment it appears.
   - ':p<kickoff>' the reminder before kickoff (1.5 hours / 1 hour), for anything still not fixed.
   Bench swaps follow projections, which move all week: only at the heads-up and the reminder, never as a "change". */
export function lineupTiming(issues, games, now, tz) {
  const upcoming = Object.values(games).filter(g => g.state === 'pre' && g.start > now).map(g => g.start).sort((a, b) => a - b);
  const out = [];
  for (const x of issues) {
    const kick = x.kick || upcoming[0];
    if (!kick || kick <= now) continue;
    const S = gameSchedule(kick, tz);
    if (now < S.eve) continue;                                              // too early: the heads-up hasn't gone out yet
    const pre = now >= kick - S.lead;
    if (pre) out.push({ ...x, k: `${x.k}:p${x.kind === 'empty' ? S.id : kick}`, when: 'pre', mins: Math.round((kick - now) / 6e4) });
    else if (x.kind !== 'bench' || now < S.eve + 3 * H) out.push({ ...x, k: `${x.k}:w${S.id}`, when: now < S.eve + 3 * H ? 'eve' : 'change' });
  }
  return out;
}

/* ---------- one run's shared facts: the NFL week, kickoff times, when the last game of the week ends ---------- */
export async function weekInfo(now = Date.now()) {
  const nfl = await j('https://api.sleeper.app/v1/state/nfl').catch(() => null);
  if (!nfl) return null;
  const season = +nfl.season, week = +nfl.week;
  const board = await j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`).catch(() => null);
  const games = gamesOf(board), starts = Object.values(games).map(g => g.start).filter(Boolean);
  return { season, week, games, now, rd: makeReader(season, week),
    weekEnd: starts.length ? Math.max(...starts) + 3.5 * H : null,                                   // the last game of the week ends
    // lineups are only read when some game kicks off within the next 3 days (Friday 6 pm covers Monday night)
    lineupTime: Object.values(games).some(g => g.state === 'pre' && g.start > now && g.start - now <= 3 * D) };
}

/* Everything new for one account: [{ keys: [push_sent keys], kind: 'dl' | 'lineup', payload }].
   off: the account's switched-off kinds (S.acct.push.off). Leagues set to "News tab only" are skipped. */
export async function alertsFor(st, W, tz, off = [], had = new Set()) {
  const out = [], skip = new Set((st.notif && st.notif.off) || []), now = W.now;
  if (!tzOk(tz)) tz = 'America/New_York';
  for (const lg of leaguesOf(st)) {
    if (!lg.key || lg.key === 'sample' || skip.has(lg.key)) continue;
    try {
      if (!off.includes('dl') && lg.tdl) {
        const at = lg.tdl.at || (lg.tdl.wk && W.weekEnd ? W.weekEnd + 7 * D * (lg.tdl.wk - W.week) : null);
        const m = at && deadlineNotice({ ...lg, dlWeek: lg.tdl.wk || null }, at, now, tz);
        if (m) out.push({ keys: [m.k], kind: 'dl', payload: { title: m.title, body: m.body, tag: m.tag, url: m.url } });
      }
      if (off.includes('lineup') || !W.lineupTime || !lg.rid || !lg.id) continue;
      let lineup = null;
      if (lg.type === 'sleeper') {
        const d = await W.rd.sleeper(lg.id), r = d && d.rosters && d.rosters.find(x => String(x.roster_id) === String(lg.rid));
        const [P, proj] = await Promise.all([W.rd.slpPlayers(), W.rd.slpProj()]);
        if (d && d.lg && r && P) lineup = sleeperLineup(d.lg, r, P, proj);
      } else if (lg.type === 'espn' && !lg.priv) {
        const d = await W.rd.espn(lg.id), t = d && (d.teams || []).find(x => String(x.id) === String(lg.rid));
        if (t) lineup = espnLineup(d, t, W.week);
      }
      if (!lineup) continue;
      const ORD = { out: 0, empty: 1, bye: 2, bench: 3 };
      const iss = lineupTiming(lineupIssues(lineup, W.games, now, W.week), W.games, now, tz).map(x => ({ ...x, k: `lu:${lg.key}:${x.k}` }))
        .filter(x => !had.has(x.k)).sort((a, b) => ORD[a.kind] - ORD[b.kind]);
      if (!iss.length) continue;
      const pre = iss.find(x => x.when === 'pre'), change = iss.every(x => x.when === 'change');
      const title = pre ? `Kickoff in ${pre.mins >= 90 ? Math.round(pre.mins / 60) + ' hours' : pre.mins + ' min'}: fix your lineup in ${lg.name}` : change ? `Lineup change: ${lg.name}` : `Lineup check: ${lg.name}`;
      out.push({ keys: iss.map(x => x.k), kind: 'lineup',
        payload: { title, body: iss[0].msg + (iss.length > 1 ? ` Plus ${iss.length - 1} more.` : ''), tag: ('lu-' + lg.key).replace(/[^A-Za-z0-9_-]/g, '-'), url: '/#team' } });
    } catch (e) { /* one league failing never stops the others */ }
  }
  return out;
}
