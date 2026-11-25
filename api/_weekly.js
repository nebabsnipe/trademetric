// What happened in each person's leagues, read on the server for the update emails. Helper for api/email.js.
//   weekly recap   the week's result, standout games, #1 at his position, highlight clips (after Monday night)
//   injuries       players ruled out or put on injured reserve (confirmed, the same rules as push notifications)
//   trade deadline a few days before each league's deadline
//   player moves   offseason: a player from your team now listed on a new NFL team (seen on two daily checks)
//
// Everything comes from the league platform's own data, never a projection or a guess, and a section is left
// out rather than risk saying something untrue (for example "#1 at his position" is only said when the whole
// position's scores could be read and our scoring matches the league's own number for that player).

import { norm, userRosters, injuryEvents } from './_push.js';
import { leaguesOf } from './_alerts.js';

const H = 3600e3, D = 24 * H;
const TEAM = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' }, fix = t => TEAM[t] || t;
const ESPN_TEAM = { 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU' };
const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };
const ESPN_SLOT_OF = { QB: 0, RB: 2, WR: 4, TE: 6, 'D/ST': 16, K: 17 };
const POS_SLP = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'D/ST' };
export const RULES = {
  bigGame: 28,                 // standout game: this many points ...
  bigX: 2.2, bigMin: 12,       // ... or 2.2x his projection and at least 12 (the same rule as the site's big-game banner)
  maxPerf: 3, maxClips: 3,
  recapAfterH: 6,              // the weekly recap waits this long after the week's last game ends
  recapWithinD: 4,             // and isn't sent at all once the week is this many days old
  deadlineD: 3,                // trade deadline reminder: when the deadline is within this many days
  moveConfirmH: 20,            // a player move has to show on two checks this far apart
  movesFrom: [2, 1], movesTo: [8, 31],   // the offseason window for player moves (Feb 1 - Aug 31)
};
const num = x => (Number.isFinite(+x) ? +x : 0);
const r1 = x => Math.round(x * 10) / 10;
const etDay = ms => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(ms);
const etTime = ms => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(ms);

/* ---------- which week to recap ----------
   The newest NFL week whose games are all final, at least 6 hours after its last game, and not more than 4 days
   old. Returns { season, week, games, lastEnd } or null. */
export async function recapWeek(get, now) {
  const st = await get('https://api.sleeper.app/v1/state/nfl').catch(() => null);
  if (!st || !/regular|post/.test(String(st.season_type || 'regular'))) return null;
  const season = num(st.season);
  for (const week of [num(st.week), num(st.week) - 1].filter(w => w >= 1 && w <= 18)) {
    const board = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`).catch(() => null);
    const evs = (board && board.events) || [];
    if (!evs.length || !evs.every(e => e.status && e.status.type && e.status.type.state === 'post')) continue;
    const lastEnd = Math.max(...evs.map(e => Date.parse(e.date))) + 3.5 * H;
    if (now - lastEnd < RULES.recapAfterH * H || now - lastEnd > RULES.recapWithinD * D) return null;
    return { season, week, lastEnd, games: evs.map(e => ({ id: e.id, teams: ((e.competitions && e.competitions[0] && e.competitions[0].competitors) || []).map(c => fix(c.team && c.team.abbreviation)) })) };
  }
  return null;
}

/* ---------- highlight clips for a week: the league's official game clips, tagged with the players in them ---------- */
export async function weekClips(get, wk) {
  const out = [], seen = { games: wk.games.length, read: 0, videos: 0 };
  await Promise.all(wk.games.map(async g => {
    const s = await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${g.id}`).catch(() => null);
    if (s) seen.read++;
    seen.videos += ((s && s.videos) || []).length;
    for (const v of (s && s.videos) || []) {
      const who = (v.categories || []).filter(c => c && (c.type === 'athlete' || c.athleteId || c.athlete))
        .map(c => (c.athlete && c.athlete.description) || c.description || '').filter(Boolean).map(norm);
      const url = v.links && v.links.web && (v.links.web.href || (v.links.web.self && v.links.web.self.href));
      if (url && (v.headline || v.title)) out.push({ title: String(v.headline || v.title).slice(0, 140), url, who, t: ' ' + norm(v.headline || v.title) + ' ' });
    }
  }));
  out.seen = seen;
  return out;
}

/* ---------- standout games ---------- */
const standout = p => !['K', 'D/ST'].includes(p.pos) && (p.pts >= RULES.bigGame || (p.proj > 0 && p.pts >= p.proj * RULES.bigX && p.pts >= RULES.bigMin));

/* ---------- ESPN ---------- */
const espnPts = (x, week, src) => { const s = (x.stats || []).find(z => num(z.scoringPeriodId) === week && num(z.statSourceId) === src && num(z.statSplitTypeId || 1) === 1); return s ? num(s.appliedTotal) : null; };
async function espnWeek(lg, season, week, get) {
  const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(lg.id)}`;
  const d = await get(`${base}?view=mMatchupScore&view=mTeam&view=mRoster&view=mSettings&scoringPeriodId=${week}`);
  const T = d.teams || [], me = T.find(t => String(t.id) === String(lg.rid));
  if (!me) return { ok: false, why: 'team not found' };
  const name = t => t.name || [t.location, t.nickname].filter(Boolean).join(' ') || 'Team ' + t.id;
  const out = { ok: true, league: lg.name || (d.settings && d.settings.name) || 'League', team: name(me), result: null, players: [], tops: [], topWhy: '' };
  // the result, only once this matchup is over (a two-week playoff round is reported after its second week)
  const mps = (d.settings && d.settings.scheduleSettings && d.settings.scheduleSettings.matchupPeriods) || {};
  const mp = Object.keys(mps).find(k => (mps[k] || []).map(num).includes(week));
  const lastOfMp = mp ? Math.max(...mps[mp].map(num)) : week;
  const m = (d.schedule || []).find(x => num(x.matchupPeriodId) === num(mp || week) && x.home && x.away && (x.home.teamId === me.id || x.away.teamId === me.id));
  if (m && lastOfMp === week && /HOME|AWAY|TIE/.test(m.winner || '')) {
    const mine = m.home.teamId === me.id ? m.home : m.away, opp = m.home.teamId === me.id ? m.away : m.home, oT = T.find(t => t.id === opp.teamId);
    const o = (me.record && me.record.overall) || {};
    out.result = { won: m.winner === 'TIE' ? null : (m.winner === 'HOME') === (m.home.teamId === me.id), me: r1(num(mine.totalPoints)), opp: r1(num(opp.totalPoints)), oppName: oT ? name(oT) : 'your opponent',
      record: `${num(o.wins)}-${num(o.losses)}${num(o.ties) ? '-' + num(o.ties) : ''}`, playoff: (m.playoffTierType || 'NONE') !== 'NONE' };
  }
  for (const e of (me.roster && me.roster.entries) || []) {
    const x = e.playerPoolEntry && e.playerPoolEntry.player; if (!x) continue;
    const pos = ESPN_POS[x.defaultPositionId], pts = espnPts(x, week, 0); if (!pos || pts == null) continue;
    out.players.push({ id: String(x.id), name: x.fullName, pos, team: ESPN_TEAM[x.proTeamId] || '', pts: r1(pts), proj: r1(espnPts(x, week, 1) || 0), starter: ![20, 21].includes(num(e.lineupSlotId)) });
  }
  // #1 at his position: the whole position's scores for the week, sorted by the league itself
  const cands = out.players.filter(p => p.pts > 0).sort((a, b) => b.pts - a.pts);
  const checked = new Set();
  for (const p of cands) {
    if (checked.has(p.pos) || ESPN_SLOT_OF[p.pos] == null) continue;
    checked.add(p.pos);
    const filter = { players: { filterSlotIds: { value: [ESPN_SLOT_OF[p.pos]] }, sortAppliedStatTotalForScoringPeriodId: { sortAsc: false, sortPriority: 1, value: week }, limit: 25 } };
    const k = await get(`${base}?view=kona_player_info&scoringPeriodId=${week}`, { 'x-fantasy-filter': JSON.stringify(filter) }).catch(() => null);
    const list = ((k && k.players) || []).map(z => z.player || z).map(z => ({ id: String(z.id), name: z.fullName, pts: espnPts(z, week, 0) })).filter(z => z.pts != null);
    (out.checked = out.checked || []).push({ pos: p.pos, returned: ((k && k.players) || []).length, top: list.slice(0, 5).map(z => `${z.name} ${z.pts}`) });
    const sorted = list.length >= 5 && list.every((z, i) => i === 0 || z.pts <= list[i - 1].pts + 0.01);
    if (!sorted) { out.topWhy = 'The position\'s scores could not be read in order, so #1 is not claimed.'; continue; }
    for (const q of cands.filter(c => c.pos === p.pos)) {
      const best = Math.max(...list.filter(z => z.id !== q.id).map(z => z.pts));
      if (q.pts >= best - 0.001) out.tops.push({ ...q, tied: Math.abs(q.pts - best) < 0.05 });
    }
  }
  return out;
}

/* ---------- Sleeper ---------- */
function slpScore(ss, stats) { let t = 0; for (const k in ss) if (stats && stats[k] != null) t += num(ss[k]) * num(stats[k]); return t; }
async function sleeperWeek(lg, season, week, get, memo) {
  const u = `https://api.sleeper.app/v1/league/${encodeURIComponent(lg.id)}`;
  const [L, rosters, users, ms] = await Promise.all([get(u), get(u + '/rosters'), get(u + '/users').catch(() => []), get(`${u}/matchups/${week}`)]);
  if (!L || !Array.isArray(rosters) || !Array.isArray(ms)) return { ok: false, why: 'league not readable' };
  const nameOf = rid => { const r = rosters.find(x => x.roster_id === rid), us = r && (users || []).find(x => x.user_id === r.owner_id); return (us && us.metadata && us.metadata.team_name) || (us && us.display_name) || 'Team ' + rid; };
  const mine = ms.find(x => String(x.roster_id) === String(lg.rid));
  if (!mine) return { ok: false, why: 'team not found' };
  const out = { ok: true, league: lg.name || L.name || 'League', team: nameOf(mine.roster_id), result: null, players: [], tops: [], topWhy: '' };
  const opp = mine.matchup_id != null && ms.find(x => x.matchup_id === mine.matchup_id && x.roster_id !== mine.roster_id);
  const pw = num(L.settings && L.settings.playoff_week_start);
  if (opp) {
    const r = rosters.find(x => x.roster_id === mine.roster_id), s = (r && r.settings) || {};
    out.result = { won: num(mine.points) === num(opp.points) ? null : num(mine.points) > num(opp.points), me: r1(num(mine.points)), opp: r1(num(opp.points)), oppName: nameOf(opp.roster_id),
      record: `${num(s.wins)}-${num(s.losses)}${num(s.ties) ? '-' + num(s.ties) : ''}`, playoff: !!(pw && week >= pw) };
  }
  const P = await memo('slp:players', () => get('https://api.sleeper.app/v1/players/nfl'));
  const pos = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => 'position[]=' + p).join('&');
  const [stats, proj] = await Promise.all([
    memo(`slp:stats:${week}`, () => get(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&${pos}`)),
    memo(`slp:proj:${week}`, () => get(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${pos}`)),
  ]);
  const projOf = Object.fromEntries((Array.isArray(proj) ? proj : []).map(x => [x.player_id, x.stats || {}]));
  const ss = L.scoring_settings || {}, starters = new Set(mine.starters || []);
  for (const [id, pts] of Object.entries(mine.players_points || {})) {
    const x = P && P[id]; if (!x || !POS_SLP[x.position]) continue;
    out.players.push({ id, name: x.position === 'DEF' ? `${x.team || id} D/ST` : (x.full_name || `${x.first_name} ${x.last_name}`), pos: POS_SLP[x.position], team: fix(x.team || ''), pts: r1(num(pts)), proj: r1(slpScore(ss, projOf[id])), starter: starters.has(id) });
  }
  // #1 at his position: every player's stats for the week, scored with this league's settings. Only claimed when
  // our score for him matches the league's own number (so a scoring rule we can't see can't make us wrong).
  if (Array.isArray(stats) && stats.length > 100) {
    const all = stats.map(x => ({ id: x.player_id, pos: POS_SLP[(P[x.player_id] || {}).position], pts: slpScore(ss, x.stats) })).filter(x => x.pos);
    for (const q of out.players.filter(p => p.pts > 0)) {
      const ours = all.find(z => z.id === q.id);
      if (!ours || Math.abs(ours.pts - q.pts) > 0.11) { out.topWhy = out.topWhy || 'Our scoring didn\'t match the league\'s own number exactly, so #1 is not claimed.'; continue; }
      const best = Math.max(...all.filter(z => z.pos === q.pos && z.id !== q.id).map(z => z.pts));
      if (q.pts >= best - 0.001) out.tops.push({ ...q, tied: Math.abs(q.pts - best) < 0.05 });
    }
  } else out.topWhy = 'The week\'s scores for every player could not be read, so #1 is not claimed.';
  return out;
}

/* ---------- one league's week ---------- */
export async function leagueWeek(lg, wk, get, memo, clips) {
  try {
    const w = lg.type === 'espn' ? await espnWeek(lg, wk.season, wk.week, get) : lg.type === 'sleeper' ? await sleeperWeek(lg, wk.season, wk.week, get, memo) : { ok: false, why: 'unknown platform' };
    if (!w.ok) return w;
    w.perf = w.players.filter(standout).sort((a, b) => b.pts - a.pts).slice(0, RULES.maxPerf);
    // a clip is about your player when the league tagged him in it, or his full name is in its title
    const named = w.players.filter(p => p.pos !== 'D/ST' && norm(p.name).includes(' '));
    const about = c => named.find(p => c.who.includes(norm(p.name)) || (c.t || '').includes(' ' + norm(p.name) + ' '));
    w.clips = (clips || []).map(c => ({ c, p: about(c) })).filter(x => x.p).map(({ c, p }) => ({ title: c.title, url: c.url, who: c.who, player: p.name }));
    return w;
  } catch (e) { return { ok: false, why: 'league not readable (' + (e && e.status || 'error') + ')' }; }
}

/* The weekly recap email's facts for one account, from its leagues' weeks. Sections are lists; the email only
   shows the ones the person has switched on. */
export function weeklyData(weeks, wk) {
  const ok = weeks.filter(w => w && w.ok);
  const seenClip = new Set();
  return {
    week: wk.week, season: wk.season,
    matchup: ok.filter(w => w.result).map(w => ({ league: w.league, team: w.team, ...w.result })),
    perf: ok.flatMap(w => w.perf.map(p => ({ ...p, league: w.league }))).sort((a, b) => b.pts - a.pts).slice(0, RULES.maxPerf),
    top: ok.flatMap(w => w.tops.map(p => ({ ...p, league: w.league }))).filter((p, i, a) => a.findIndex(q => q.name === p.name) === i),
    clips: ok.flatMap(w => w.clips).filter(c => !seenClip.has(c.url) && seenClip.add(c.url)).slice(0, RULES.maxClips),
  };
}

/* ---------- injuries: ruled out or put on injured reserve, confirmed, in the last day ---------- */
export function injuryData(st, players, log, cur, now) {
  const { roster, src } = userRosters(st, players);
  const ev = injuryEvents({ roster, src, log, cur, now, maxAgeH: 24 }).filter(e => e.st === 'O' || e.st === 'IR');
  return ev.map(e => ({ name: e.name, team: e.team, st: e.st, body: e.body && !/^(undisclosed|na|n\/a)$/i.test(e.body) ? e.body.toLowerCase() : '', leagues: e.leagues }));
}

/* ---------- trade deadline: within 3 days ----------
   wkInfo (from api/_alerts.js weekInfo) is needed for leagues whose deadline is a week number. */
export function deadlinesOf(st, wkInfo, now) {
  const out = [];
  for (const lg of leaguesOf(st)) {
    if (!lg.key || lg.key === 'sample' || !lg.tdl) continue;
    const at = lg.tdl.at || (lg.tdl.wk && wkInfo && wkInfo.weekEnd ? wkInfo.weekEnd + 7 * D * (lg.tdl.wk - wkInfo.week) : null);
    if (!at || at - now <= 0 || at - now > RULES.deadlineD * D) continue;
    out.push({ key: lg.key, league: lg.name, at, when: lg.tdl.wk && !lg.tdl.at ? `${etDay(at)}, after the last Week ${lg.tdl.wk} game` : `${etDay(at)} at ${etTime(at)} ET` });
  }
  return out;
}

/* ---------- offseason player moves ----------
   Once a day: every fantasy-relevant player's NFL team, from the league platform's player list. A change is only
   believed once the next day's check still shows the new team. kv: { get, put } on the shared store. */
export const inMovesWindow = now => { const d = new Date(now), m = d.getUTCMonth() + 1, day = d.getUTCDate(), v = m * 100 + day; return v >= RULES.movesFrom[0] * 100 + RULES.movesFrom[1] && v <= RULES.movesTo[0] * 100 + RULES.movesTo[1]; };
export async function trackMoves(get, kv, now, dry) {
  const P = await get('https://api.sleeper.app/v1/players/nfl').catch(() => null);
  if (!P || Object.keys(P).length < 1000) return null;
  const snap = {};
  for (const x of Object.values(P)) if (['QB', 'RB', 'WR', 'TE', 'K'].includes(x.position) && x.active !== false && x.full_name) snap[norm(x.full_name)] = [x.team || '', x.position, x.full_name];
  const [prev, mv] = await Promise.all([kv.get('email:teams'), kv.get('email:moves')]);
  if (!prev || !mv) return null;                                          // the store isn't answering: decide nothing
  const was = (prev.value && prev.value.m) || null, items = ((mv.value && mv.value.items) || []).filter(x => now - (x.conf || x.first) < 30 * D);
  if (was) for (const [k, [team, pos, name]] of Object.entries(snap)) {
    const from = was[k] && was[k][0];
    if (from && team && from !== team && !items.some(x => x.k === k && x.to === team)) items.push({ k, name, pos, from, to: team, first: now });
  }
  for (const x of items) if (!x.conf) {
    if (!snap[x.k] || snap[x.k][0] !== x.to) x.gone = true;               // it didn't hold: forget it
    else if (now - x.first >= RULES.moveConfirmH * H) x.conf = now;
  }
  const keep = items.filter(x => !x.gone);
  if (!dry) await Promise.all([kv.put('email:teams', { m: snap }), kv.put('email:moves', { items: keep })]);
  return keep.filter(x => x.conf);
}
export function movesFor(st, players, confirmed, since) {
  const { roster } = userRosters(st, players);
  return confirmed.filter(x => x.conf > since && roster[x.k]).map(x => ({ name: x.name, pos: x.pos, from: x.from, to: x.to, leagues: roster[x.k].leagues }));
}
