/* Test fixtures for running the site locally with every outside service faked.
   Everything here is built from data/nfl.json, so the league is "real-shaped": real players, real weekly
   scores for the weeks already played, a 12-team half-PPR Sleeper-style league.
   Nothing in this folder is loaded by the live site. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nfl.json'), 'utf8'));
const WEEK = D.week, F = D.fields;
export const SEASON = 2026;
export const LEAGUE_ID = '1100000000000000001';
export const USER = { id: '00000000-0000-4000-8000-000000000001', name: 'coachtaylor' };

/* half-PPR points from a stat line in nfl.json's field order */
const pts = a => { const s = Object.fromEntries(F.map((k, i) => [k, +a[i] || 0]));
  return s.pyd / 25 + s.ptd * 4 - s.int * 2 + s.ryd / 10 + s.rtd * 6 + s.rec * .5 + s.recyd / 10 + s.rectd * 6 - s.fl * 2; };
const line = a => Object.fromEntries(F.map((k, i) => [k, Math.round((+a[i] || 0) * 10) / 10]));
const r2 = x => Math.round(x * 100) / 100;

/* ---- players, with Sleeper-style numeric ids ---- */
const P = D.players.map((p, i) => ({ pid: String(1000 + i), id: p[0], n: p[1], pos: p[2], t: p[3], avg: p[6], log: p[7], ppg: pts(p[6]) }))
  .filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.pos));
const K = D.k.map((k, i) => ({ pid: String(5000 + i), id: k[0], n: k[1], pos: 'K', t: k[2], ppg: 8 - i * .05 }));
const DST = D.dst.map((d, i) => ({ pid: d[0] === 'LAR' ? 'LA' : d[0], n: null, pos: 'DEF', t: d[0], ppg: 7 - i * .05 }));
const byPid = Object.fromEntries([...P, ...K, ...DST].map(p => [p.pid, p]));
const wkPts = (p, w) => { if (p.pos === 'K' || p.pos === 'DEF') return Math.round(p.ppg + ((w * 7 + p.pid.length * 3 + p.pid.charCodeAt(0)) % 9) - 4);
  const g = p.log && p.log[w - 1]; return Array.isArray(g) ? r2(pts(g.slice(2, 14))) : 0; };

/* ---- 12 teams, snake draft by points per game with roster limits ---- */
const NAMES = ['Sunday Scaries', 'Gridiron Gang', 'Hail Mary Co.', 'The Replacements', 'Bye Week Blues', 'Fourth & Long',
  'Red Zone Rangers', 'Blitz Brigade', 'End Zone Elite', 'Two-Minute Drill', 'Pigskin Pros', 'Waiver Wire Heroes'];
const OWNERS = [USER.name, 'mjordan88', 'kelly_d', 'bigtone', 'sam_r', 'priya', 'dutch', 'ajones', 'marcus_w', 'lena', 'oscar_p', 'tk'];
const N = 12, LIM = { QB: 2, RB: 5, WR: 5, TE: 2, K: 1, DEF: 1 };
const rosters = Array.from({ length: N }, () => ({ players: [], c: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 } }));
/* value over replacement, so quarterbacks don't all go first */
const REPL = { QB: 15, RB: 8, WR: 8, TE: 6 };
const board = [...P].sort((a, b) => (b.ppg - REPL[b.pos]) - (a.ppg - REPL[a.pos]));
const taken = new Set();
for (let rd = 0; rd < 14; rd++) for (let k = 0; k < N; k++) { const t = rd % 2 ? N - 1 - k : k, R = rosters[t];
  const p = board.find(x => !taken.has(x.pid) && R.c[x.pos] < LIM[x.pos]); if (!p) continue; taken.add(p.pid); R.players.push(p.pid); R.c[p.pos]++; }
rosters.forEach((R, t) => { R.players.push(K[t].pid, DST[(t * 5) % 32].pid); });

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];
export const ROSTER_POSITIONS = [...SLOTS, 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'];
/* best lineup for a week by a scoring function */
function lineup(R, f) { const left = [...R.players].sort((a, b) => f(byPid[b]) - f(byPid[a])), out = [];
  for (const s of SLOTS) { const ok = s === 'FLEX' ? ['RB', 'WR', 'TE'] : [s]; const i = left.findIndex(pid => ok.includes(byPid[pid].pos));
    out.push(i < 0 ? '0' : left.splice(i, 1)[0]); } return out; }

/* ---- schedule (round robin) and scores ---- */
const REG = 14, sched = {};
{ const ids = Array.from({ length: N }, (_, i) => i);
  for (let w = 1; w <= REG; w++) { sched[w] = []; for (let i = 0; i < N / 2; i++) sched[w].push([ids[i], ids[N - 1 - i]]); ids.splice(1, 0, ids.pop()); } }

/* this week: the games already played (Wednesday and Thursday) are final, the rest haven't kicked off */
const NOW = Date.parse('2026-11-27T15:00:00Z');
const kickAt = t => { const k = D.kick[t]; return k ? Date.parse(`${k[1]}T${k[2]}:00-05:00`) : null; };
const DONE = new Set(Object.keys(D.kick).filter(t => kickAt(t) + 4 * 3600e3 < NOW));
const curLine = p => p.avg.map((v, i) => Math.round(v));   /* a finished game's stat line: his season average, rounded */
const curPts = p => !DONE.has(p.t) ? 0 : p.pos === 'K' || p.pos === 'DEF' ? Math.round(p.ppg) : r2(pts(curLine(p)));

const matchups = {}, rec = rosters.map(() => ({ wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 }));
for (let w = 1; w <= REG; w++) {
  const past = w <= D.played, cur = w === WEEK, rows = [];
  sched[w].forEach(([a, b], mi) => { const pair = [a, b].map(t => { const R = rosters[t];
      const st = past ? lineup(R, p => wkPts(p, w) + p.ppg / 100) : lineup(R, p => p.ppg);
      const pp = {}; R.players.forEach(pid => pp[pid] = past ? wkPts(byPid[pid], w) : cur ? curPts(byPid[pid]) : 0);
      const total = r2(st.reduce((s, pid) => s + (pp[pid] || 0), 0));
      return { roster_id: t + 1, matchup_id: mi + 1, points: total, starters: st, players: [...R.players], players_points: pp, starters_points: st.map(pid => pp[pid] || 0) }; });
    if (past) { const [x, y] = pair, rx = rec[x.roster_id - 1], ry = rec[y.roster_id - 1];
      rx.pf += x.points; ry.pf += y.points; rx.pa += y.points; ry.pa += x.points;
      if (x.points > y.points) { rx.wins++; ry.losses++; } else if (y.points > x.points) { ry.wins++; rx.losses++; } else { rx.ties++; ry.ties++; } }
    rows.push(...pair); });
  matchups[w] = rows;
}

export const sleeper = {
  user: { user_id: 'u1', username: USER.name, display_name: USER.name },
  league: { league_id: LEAGUE_ID, name: 'Sunday Night League', season: String(SEASON), total_rosters: N, status: 'in_season', roster_positions: ROSTER_POSITIONS,
    scoring_settings: { pass_yd: .04, pass_td: 4, pass_int: -2, rush_yd: .1, rush_td: 6, rec: .5, rec_yd: .1, rec_td: 6, fum_lost: -2 },
    settings: { playoff_week_start: 15, playoff_teams: 6, reserve_slots: 1, type: 0, waiver_type: 2, waiver_budget: 100, trade_deadline: 13 } },
  users: OWNERS.map((o, i) => ({ user_id: 'u' + (i + 1), display_name: o, metadata: { team_name: NAMES[i] } })),
  rosters: rosters.map((R, i) => ({ roster_id: i + 1, owner_id: 'u' + (i + 1), players: R.players, starters: lineup(R, p => p.ppg), reserve: [],
    settings: { wins: rec[i].wins, losses: rec[i].losses, ties: rec[i].ties, fpts: Math.floor(rec[i].pf), fpts_decimal: Math.round((rec[i].pf % 1) * 100), fpts_against: Math.floor(rec[i].pa) } })),
  players: Object.fromEntries([...P, ...K].map(p => [p.pid, { player_id: p.pid, full_name: p.n, first_name: p.n.split(' ')[0], last_name: p.n.split(' ').slice(1).join(' '), position: p.pos, team: p.t === 'LAR' ? 'LA' : p.t }])
    .concat(DST.map(d => [d.pid, { player_id: d.pid, position: 'DEF', team: d.pid }]))),
  matchups,
};

/* ---- the site's own /api answers ---- */
const games = {};
{ const seen = new Set();
  for (const t of Object.keys(D.kick)) { if (seen.has(t)) continue; const g = D.sched[t] && D.sched[t][WEEK - 1]; if (!g) continue; const o = g[0]; seen.add(t); seen.add(o);
    const done = DONE.has(t), sc = x => done ? Math.round(D.vegas[x] || 20) : 0, start = new Date(kickAt(t)).toISOString();
    const mk = (a, b, home) => ({ id: 'g' + [t, o].sort().join(''), state: done ? 'post' : 'pre', rem: done ? 0 : 1, detail: done ? 'Final' : '', start, score: sc(a), opp: b, oppScore: sc(b), home, implied: D.vegas[a] ?? null, total: (D.vegas[a] || 0) + (D.vegas[b] || 0) || null, line: '' });
    games[t] = mk(t, o, !!g[1]); games[o] = mk(o, t, !g[1]); } }
const statRows = live => [...P].filter(p => p.ppg > 1 && (!live || DONE.has(p.t)))
  .map(p => ({ n: p.n, pos: p.pos, t: p.t, s: live ? Object.fromEntries(F.map((k, i) => [k, curLine(p)[i]])) : line(p.avg), ppr: r2((live ? pts(curLine(p)) : p.ppg) + (live ? curLine(p)[8] : p.avg[8]) * .5) }));

export function api(pathname, q) {
  const week = +(q.get('week') || WEEK);
  if (pathname === '/api/live') return { season: SEASON, week, nflWeek: WEEK, updated: new Date(NOW).toISOString(), live: false, games: week === WEEK ? games : {}, players: week === WEEK ? statRows(true) : [], injuries: null, injAll: false, notes: null };
  if (pathname === '/api/proj') { const rows = statRows(false); return { season: SEASON, week, updated: new Date(NOW).toISOString(), sources: { sleeper: rows, espn: rows }, errors: { sleeper: null, espn: null } }; }
  if (pathname === '/api/players') return Object.fromEntries([...P, ...K].map(p => [p.pid, [p.n, p.pos, p.t]]));
  if (pathname === '/api/plan') return { beta: true, signedIn: q.get('_in') === '1', plan: 'free', pro: true, betaUser: true, billing: null };
  if (pathname === '/api/feed') return { season: SEASON, week, updated: new Date(NOW).toISOString(), games: [], videos: [], news: [] };
  if (pathname === '/api/plays') return { ok: false, plays: [] };
  if (pathname === '/api/news') return q.get('recap') ? { ai: false, items: {} } : { updated: new Date(NOW).toISOString(), items: [] };
  if (pathname === '/api/market') return null;   /* 404: the page falls back to data/market.json */
  return {};
}
export { NOW };
