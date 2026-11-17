// Season Recap data: GET /api/recap?league=<id>&year=<yyyy>
// Owner-only. The caller sends their TradeMetric sign-in token (Authorization: Bearer ...).
// We read their own saved state (row-level security means only they can) to confirm the
// league is theirs and which team is theirs. Private ESPN leagues: POST the same URL with
// { s2, swid } in the body; the codes are forwarded to ESPN for these reads and never stored.
//
// Everything is rebuilt from the league's own records:
//   - trades: ESPN only shows the contents of accepted trades to league members, so each trade is
//     rebuilt by following every player's owner over time (draft, adds/drops, lineup moves,
//     weekly rosters). A player who changes teams without a waiver or free-agent add was traded.
//     Each move must match a real accepted trade between those two teams or it is left out.
//   - trade grades: what each side's players did after the deal, measured against a replacement-level
//     player at the same position each week.
//   - weekly scores, lineups and player points come from the weekly box scores.

const SUPA_URL = process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';
const ESPN = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/';

const POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST' };
const SLOT_POS = { 0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K' };
const BENCH = new Set([20, 21]); // bench, injured reserve
const DAY = 864e5;

// Manager grade blend: finish, start/sit, trades, waivers. Can be overridden with the
// RECAP_GRADE_W environment variable ("a,b,c,d"). Never shown on the site.
const GRADE_W = (() => {
  const v = String(process.env.RECAP_GRADE_W || '').split(',').map(Number);
  return v.length === 4 && v.every(x => x >= 0) ? v : [35, 25, 20, 20];
})();

const r1 = x => Math.round(x * 10) / 10;
const sum = a => a.reduce((s, x) => s + x, 0);

// ---------- ESPN reads ----------
function espnHeaders(creds) {
  const h = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (TradeMetric recap)' };
  if (creds) h.Cookie = `espn_s2=${encodeURIComponent(creds.s2)}; SWID=${creds.swid}`;
  return h;
}
async function espn(url, creds, filter) {
  const h = espnHeaders(creds);
  if (filter) h['x-fantasy-filter'] = JSON.stringify(filter);
  const r = await fetch(url, { headers: h, redirect: 'manual' });
  if (r.status === 401 || r.status === 403) { const e = new Error('denied'); e.code = 'denied'; throw e; }
  if (r.status === 404) { const e = new Error('not_found'); e.code = 'not_found'; throw e; }
  if (!r.ok) throw new Error('ESPN ' + r.status);
  return r.json();
}

// ---------- maths helpers ----------
const GRADES = [[.75, 'A+'], [.68, 'A'], [.62, 'A-'], [.57, 'B+'], [.47, 'B'], [.43, 'B-'], [.38, 'C+'], [.32, 'C'], [.25, 'D']];
const shareGrade = s => (GRADES.find(g => s >= g[0]) || [0, 'F'])[1];
const SEASON_GRADES = [[.90, 'A+'], [.82, 'A'], [.75, 'A-'], [.68, 'B+'], [.60, 'B'], [.53, 'B-'], [.46, 'C+'], [.38, 'C'], [.30, 'C-'], [.20, 'D']];
const seasonGrade = s => (SEASON_GRADES.find(g => s >= g[0]) || [0, 'F'])[1];
const initials = name => {
  const w = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
};
const clamp01 = x => Math.max(0, Math.min(1, x));

// Best possible lineup for one week from the players on the roster (IR excluded).
function optimalPoints(entries, slotCounts) {
  const players = entries.filter(e => e.slot !== 21).map(e => ({ pts: e.pts, el: new Set(e.eligible) }));
  const slots = [];
  for (const [s, n] of Object.entries(slotCounts)) if (n > 0 && !BENCH.has(+s)) for (let i = 0; i < n; i++) slots.push(+s);
  // fill the slots that take the fewest players first (QB, K, D/ST before FLEX)
  const width = s => players.filter(p => p.el.has(s)).length;
  slots.sort((a, b) => width(a) - width(b));
  players.sort((a, b) => b.pts - a.pts);
  const used = new Set(); let tot = 0;
  for (const s of slots) {
    const i = players.findIndex((p, k) => !used.has(k) && p.el.has(s));
    if (i >= 0) { used.add(i); tot += players[i].pts; }
  }
  return tot;
}

// ---------- the recap ----------
export async function buildRecap({ league, year, teamId, creds }) {
  const base = ESPN + year + '/segments/0/leagues/' + league;
  const L = await espn(base + '?view=mSettings&view=mTeam&view=mStatus&view=mMatchupScore', creds);
  const st = L.settings || {}, sch = st.scheduleSettings || {}, status = L.status || {};
  const teams = L.teams || [];
  const N = teams.length;
  const tName = {}; teams.forEach(t => { tName[t.id] = t.name || ((t.location || '') + ' ' + (t.nickname || '')).trim() || 'Team ' + t.id; });
  const me = teams.find(t => t.id === teamId);
  if (!me) { const e = new Error('team_not_found'); e.code = 'team_not_found'; throw e; }

  // matchup periods (a playoff matchup can span two scoring periods)
  const mpSp = {}; for (const [mp, sps] of Object.entries(sch.matchupPeriods || {})) mpSp[+mp] = sps.map(Number);
  const games = (L.schedule || []).filter(g => g.home);
  const byMp = {}; games.forEach(g => (byMp[g.matchupPeriodId] = byMp[g.matchupPeriodId] || []).push(g));
  const doneMps = Object.keys(byMp).map(Number).sort((a, b) => a - b)
    .filter(mp => byMp[mp].every(g => g.winner && g.winner !== 'UNDECIDED'));
  // only count a week once every week before it is finished too
  const mps = []; for (const mp of doneMps) { if (mp !== mps.length + 1) break; mps.push(mp); }
  const W = mps.length;
  const regWeeks = sch.matchupPeriodCount || 14;
  const finalMp = Math.max(...Object.keys(byMp).map(Number), 0);
  const seasonComplete = W > 0 && W === finalMp && !status.isActive;
  const sps = mps.flatMap(mp => (mpSp[mp] || [mp]).map(sp => ({ sp, mp })));
  const lastSp = Math.max(status.latestScoringPeriod || 0, L.scoringPeriodId || 0, ...sps.map(x => x.sp), 1);

  // ---- parallel reads: weekly box scores, every transaction, NFL game times ----
  const [box, txs, pro] = await Promise.all([
    Promise.all(sps.map(({ sp, mp }) => espn(base + '?view=mBoxscore&view=mMatchupScore&scoringPeriodId=' + sp, creds,
      { schedule: { filterMatchupPeriodIds: { value: [mp] } } }).then(d => ({ sp, mp, d })))),
    Promise.all(Array.from({ length: lastSp + 1 }, (_, sp) => espn(base + '?view=mTransactions2&scoringPeriodId=' + sp, creds)
      .then(d => d.transactions || []).catch(() => []))),
    espn(ESPN + year + '?view=proTeamSchedules_wl', null).catch(() => null),
  ]);

  // ---- players and weekly lineups ----
  const P = {}; // id -> { name, pos, proTeam, pts: {sp: pts} }
  const proAbbr = {}; const gameAt = {}; // proTeamId -> sp -> kickoff ms
  let spEnd = {}; // sp -> time all of that week's games were over
  if (pro) for (const t of (pro.settings && pro.settings.proTeams) || []) {
    proAbbr[t.id] = t.abbrev;
    gameAt[t.id] = {};
    for (const [sp, gs] of Object.entries(t.proGamesByScoringPeriod || {})) for (const g of gs) {
      gameAt[t.id][+sp] = g.date; spEnd[+sp] = Math.max(spEnd[+sp] || 0, g.date + 5 * 3600e3);
    }
  }
  const notePlayer = (pl, ppe) => {
    if (!pl) return;
    const p = P[pl.id] || (P[pl.id] = { id: pl.id, name: pl.fullName, pos: POS[pl.defaultPositionId] || '', proTeam: pl.proTeamId, pts: {} });
    for (const s of pl.stats || []) if (s.statSourceId === 0 && s.statSplitTypeId === 1 && s.seasonId === year && s.scoringPeriodId > 0) p.pts[s.scoringPeriodId] = s.appliedTotal || 0;
    return p;
  };
  const LU = {}; // sp -> teamId -> [{ id, slot, pts, eligible }]
  for (const { sp, d } of box) {
    LU[sp] = {};
    for (const g of d.schedule || []) for (const side of ['home', 'away']) {
      const s = g[side]; if (!s) continue;
      const ro = s.rosterForCurrentScoringPeriod || {};
      LU[sp][s.teamId] = (ro.entries || []).map(e => {
        const ppe = e.playerPoolEntry || {}, pl = ppe.player || {};
        const p = notePlayer(pl);
        if (p && p.pts[sp] == null) p.pts[sp] = ppe.appliedStatTotal || 0;
        return { id: e.playerId, slot: e.lineupSlotId, pts: ppe.appliedStatTotal || 0, eligible: pl.eligibleSlots || [] };
      });
    }
  }
  const started = (sp, t, pid) => { const e = (LU[sp] && LU[sp][t] || []).find(x => x.id === pid); return e && !BENCH.has(e.slot) ? e.pts : null; };
  const onRoster = (sp, t, pid) => !!(LU[sp] && LU[sp][t] || []).find(x => x.id === pid);

  // ---- transactions ----
  const T = new Map(); txs.flat().forEach(x => T.set(x.id, x));
  const tx = [...T.values()];
  const tOf = x => x.processDate || x.proposedDate || 0;
  const accepts = tx.filter(x => x.type === 'TRADE_ACCEPT').map(x => ({ id: x.relatedTransactionId || x.id, team: x.teamId, t: tOf(x), sp: x.scoringPeriodId }));
  const adds = []; // waiver and free-agent pickups
  const obs = {}; // pid -> [{ t, team, kind }]
  const ob = (pid, t, team, kind) => (obs[pid] = obs[pid] || []).push({ t, team, kind });
  for (const x of tx) {
    const t = tOf(x);
    if (x.type === 'DRAFT' && x.status === 'EXECUTED') for (const it of x.items || []) if (it.toTeamId > 0) ob(it.playerId, t, it.toTeamId, 'draft');
    if ((x.type === 'WAIVER' || x.type === 'FREEAGENT') && x.status === 'EXECUTED') for (const it of x.items || []) {
      if (it.type === 'ADD' && it.toTeamId > 0) { ob(it.playerId, t, it.toTeamId, 'add'); adds.push({ pid: it.playerId, team: it.toTeamId, sp: x.scoringPeriodId, t, faab: x.type === 'WAIVER' ? (x.bidAmount || 0) : 0 }); }
      if (it.type === 'DROP' && it.fromTeamId > 0) ob(it.playerId, t, 0, 'drop');
    }
    if ((x.type === 'ROSTER' || x.type === 'FUTURE_ROSTER') && x.status === 'EXECUTED' && x.teamId > 0) for (const it of x.items || []) if (it.type === 'LINEUP') ob(it.playerId, x.proposedDate || t, x.teamId, 'lineup');
  }
  for (const { sp } of sps) for (const [t, es] of Object.entries(LU[sp])) for (const e of es) ob(e.id, spEnd[sp] || 0, +t, 'week' + sp);

  // ---- trades: owner changes with no pickup in between ----
  const transfers = [];
  for (const [pid, list] of Object.entries(obs)) {
    list.sort((a, b) => a.t - b.t || (a.kind === 'drop') - (b.kind === 'drop'));
    let cur = 0, since = 0;
    for (const o of list) {
      if (o.kind === 'drop') { if (o.team === 0) cur = 0; since = o.t; continue; }
      if (o.kind === 'add' || o.kind === 'draft' || cur === 0) { cur = o.team; since = o.t; continue; }
      if (o.team !== cur) { transfers.push({ pid: +pid, from: cur, to: o.team, t1: since, t2: o.t }); cur = o.team; }
      since = o.t;
    }
  }
  // the deal counts from the first finished week that ended after the player was seen on his new team
  // (a player flipped again within a week never shows on a weekly roster, but his deal still has a week)
  const weekOf = t => { for (const { sp } of sps) if ((spEnd[sp] || 0) >= t) return sp; return null; };
  transfers.forEach(tr => { tr.eff = weekOf(tr.t2); });
  // group into deals: same two teams, same first week
  const groups = new Map();
  for (const tr of transfers) {
    const pair = [tr.from, tr.to].sort((a, b) => a - b);
    const k = pair.join('-') + '@' + (tr.eff ?? 'later');
    const g = groups.get(k) || { pair, eff: tr.eff, moves: [], t1: 0, t2: Infinity };
    g.moves.push(tr); g.t1 = Math.max(g.t1, tr.t1); g.t2 = Math.min(g.t2, tr.t2);
    groups.set(k, g);
  }
  // each deal must match a real accepted trade by one of its two teams
  const used = new Set(); const deals = [];
  const cand = g => accepts.filter(a => !used.has(a.id) && g.pair.includes(a.team) && a.t <= g.t2 + 60e3 && a.t >= g.t1 - 7 * DAY);
  const pending = [...groups.values()];
  pending.sort((a, b) => cand(a).length - cand(b).length || a.t2 - b.t2);
  let unverified = 0;
  for (const g of pending) {
    const c = cand(g).sort((a, b) => a.t - b.t);
    if (!c.length) { unverified++; continue; }
    used.add(c[0].id);
    deals.push({ ...g, acceptT: c[0].t, acceptSp: c[0].sp });
  }
  deals.sort((a, b) => a.acceptT - b.acceptT);

  // make sure every traded player has weekly points even after being dropped
  const need = [...new Set([...deals.flatMap(d => d.moves.map(m => m.pid)), ...adds.map(a => a.pid)])].filter(id => !P[id] || Object.keys(P[id].pts).length < W);
  for (let i = 0; i < need.length; i += 50) {
    try {
      const d = await espn(base + '?view=kona_playercard', creds, { players: { filterIds: { value: need.slice(i, i + 50) }, filterStatsForTopScoringPeriodIds: { value: 25, additionalValue: ['00' + year] } } });
      for (const x of d.players || []) { const p = notePlayer(x.player); if (p && x.player && x.player.proTeamId != null) p.proTeam = x.player.proTeamId; }
    } catch (e) { /* players without stats score zero */ }
  }
  const pts = (pid, sp) => (P[pid] && P[pid].pts[sp]) || 0;

  // replacement level per position per week (the last starter-worthy score among rostered players)
  const lc = st.rosterSettings && st.rosterSettings.lineupSlotCounts || {};
  const c = s => +(lc[s] || 0);
  const flex = c(23), op = c(7);
  const depth = { QB: N * (c(0) + op), RB: N * (c(2) + c(3) * .5 + flex * .45), WR: N * (c(4) + c(3) * .5 + c(5) * .5 + flex * .45), TE: N * (c(6) + c(5) * .5 + flex * .1), K: N * c(17), 'D/ST': N * c(16) };
  const repl = {};
  for (const { sp } of sps) {
    repl[sp] = {};
    const byPos = {};
    for (const es of Object.values(LU[sp])) for (const e of es) { const p = P[e.id]; if (p && p.pos) (byPos[p.pos] = byPos[p.pos] || []).push(pts(e.id, sp)); }
    for (const [pos, arr] of Object.entries(byPos)) {
      arr.sort((a, b) => b - a);
      const k = Math.max(1, Math.round(depth[pos] || N));
      const win = arr.slice(k - 1, k + 2);
      repl[sp][pos] = win.length ? sum(win) / win.length : 0;
    }
  }
  const spsAfter = eff => eff == null ? [] : sps.filter(x => x.sp >= eff).map(x => x.sp);
  const playerAfter = (pid, eff) => {
    const ws = spsAfter(eff), p = P[pid] || { pos: '' };
    const played = ws.filter(sp => P[pid] && P[pid].pts[sp] != null);
    const tot = sum(played.map(sp => pts(pid, sp)));
    const vor = sum(ws.map(sp => Math.max(0, pts(pid, sp) - ((repl[sp] || {})[p.pos] || 0))));
    return { tot, ppw: played.length ? tot / played.length : 0, vor };
  };
  const pInfo = (pid, eff) => {
    const p = P[pid] || { name: 'Unknown player', pos: '', proTeam: 0 };
    return { name: p.name, pos: p.pos, team: proAbbr[p.proTeam] || 'FA', ptsPerWeekAfter: r1(playerAfter(pid, eff).ppw) };
  };

  // grade every deal
  const graded = deals.map(d => {
    const [a, b] = d.pair;
    const got = t => d.moves.filter(m => m.to === t).map(m => m.pid);
    const va = sum(got(a).map(pid => playerAfter(pid, d.eff).vor)), vb = sum(got(b).map(pid => playerAfter(pid, d.eff).vor));
    const hasAfter = d.eff != null;
    // a small even-money cushion per week so one side never shows 100% / 0%
    const k = 1.5 * spsAfter(d.eff).length;
    const s = !hasAfter || va + vb < 5 ? .5 : (va + k) / (va + vb + 2 * k);
    return { ...d, got, value: { [a]: va, [b]: vb }, share: { [a]: s, [b]: 1 - s }, hasAfter, week: d.eff || (d.acceptSp + 1) };
  });
  const myDeals = graded.filter(d => d.pair.includes(teamId));
  const myGraded = myDeals.filter(d => d.hasAfter);
  const other = d => d.pair[0] === teamId ? d.pair[1] : d.pair[0];

  // starter points a set of players gave me in given weeks
  const startedPts = (pids, ws) => sum(ws.flatMap(sp => pids.map(pid => started(sp, teamId, pid) || 0)));
  const tradeOut = (d, extra) => {
    const gaveIds = d.got(other(d)), gotIds = d.got(teamId);
    return { week: d.week, gave: gaveIds.map(pid => pInfo(pid, d.eff)), got: gotIds.map(pid => pInfo(pid, d.eff)), ...extra };
  };

  // ---- standings week by week ----
  const rec = {}; teams.forEach(t => { rec[t.id] = { w: 0, l: 0, t: 0, pf: 0 }; });
  const rankOrder = () => teams.map(t => t.id).sort((a, b) => {
    const A = rec[a], B = rec[b], ga = A.w + A.l + A.t || 1, gb = B.w + B.l + B.t || 1;
    return (B.w + B.t / 2) / gb - (A.w + A.t / 2) / ga || B.pf - A.pf;
  });
  const snap = week => { const ord = rankOrder(); return { week, teams: ord.map((id, i) => ({ teamId: id, teamName: tName[id], rank: i + 1, wins: rec[id].w, losses: rec[id].l, ties: rec[id].t, pointsFor: r1(rec[id].pf) })) }; };
  const standingsByWeek = [{ week: 0, teams: teams.map((t, i) => ({ teamId: t.id, teamName: tName[t.id], rank: i + 1, wins: 0, losses: 0, ties: 0, pointsFor: 0 })) }];
  const myGames = [];
  for (const mp of mps) {
    for (const g of byMp[mp]) {
      const h = g.home, a = g.away;
      if (!a) continue; // bye
      const isReg = mp <= regWeeks;
      if (isReg) {
        rec[h.teamId].pf += h.totalPoints; rec[a.teamId].pf += a.totalPoints;
        if (g.winner === 'HOME') { rec[h.teamId].w++; rec[a.teamId].l++; } else if (g.winner === 'AWAY') { rec[a.teamId].w++; rec[h.teamId].l++; } else { rec[h.teamId].t++; rec[a.teamId].t++; }
      }
      const mine = h.teamId === teamId ? [h, a] : a.teamId === teamId ? [a, h] : null;
      if (mine) myGames.push({ week: mp, me: mine[0].totalPoints, opp: mine[1].totalPoints, oppId: mine[1].teamId, won: (g.winner === 'HOME') === (mine[0] === h) && g.winner !== 'TIE', tie: g.winner === 'TIE', playoff: g.playoffTierType === 'WINNERS_BRACKET', sps: mpSp[mp] || [mp] });
    }
    if (mp <= regWeeks) standingsByWeek.push(snap(mp));
  }
  const rankAt = w => { const s = standingsByWeek[Math.min(w, standingsByWeek.length - 1)]; return (s.teams.find(t => t.teamId === teamId) || {}).rank; };
  const lastReg = standingsByWeek.length - 1;
  const finalStanding = seasonComplete && me.rankCalculatedFinal ? me.rankCalculatedFinal : rankAt(lastReg);

  // ---- callouts ----
  const callouts = [];
  for (let k = 2; k <= lastReg; k++) {
    const d = rankAt(k - 2) - rankAt(k);
    const prev = callouts[callouts.length - 1];
    if (prev && prev.week === k - 1 && prev.kind === Math.sign(d)) continue;
    if (d >= 3) callouts.push({ week: k, text: `Week ${k}: you climbed ${d} spots`, kind: 1 });
    else if (d <= -3) callouts.push({ week: k, text: `Week ${k}: slid ${-d} spots`, kind: -1 });
  }
  const reg = myGames.filter(g => g.week <= regWeeks);
  if (reg.length >= 5) {
    const w = reg.slice(0, 5).filter(g => g.won).length;
    if (w <= 1) callouts.push({ week: 5, text: `Started ${w}–${5 - w}. Rough start.` });
    else if (w >= 4) callouts.push({ week: 5, text: `Started ${w}–${5 - w}.` });
  }
  for (let i = 0, run = 0; i <= reg.length; i++) {
    if (i < reg.length && reg[i].won) { run++; continue; }
    if (run >= 4) callouts.push({ week: reg[i - 1].week, text: `Won ${run} straight (Weeks ${reg[i - run].week}–${reg[i - 1].week})` });
    run = 0;
  }
  // month records: week k's Sunday is (first Sunday after Labor Day) + 7(k-1)
  const labor = (() => { const d = new Date(Date.UTC(year, 8, 1)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return d; })();
  const sunday = k => new Date(labor.getTime() + (6 + 7 * (k - 1)) * DAY);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const byMonth = {}; reg.forEach(g => { const m = sunday(g.week).getUTCMonth(); (byMonth[m] = byMonth[m] || []).push(g); });
  for (const [m, gs] of Object.entries(byMonth)) {
    if (gs.length < 3) continue;
    const w = gs.filter(g => g.won).length, l = gs.length - w;
    if (l === 0 || (w >= 4 && l <= 1) || w === 0) callouts.push({ week: gs[gs.length - 1].week, text: `Went ${w}–${l} in ${MONTHS[m]}` });
  }
  callouts.sort((a, b) => a.week - b.week);
  callouts.forEach(c => delete c.kind);

  // ---- best weeks, beatdown, clutch ----
  const topStarter = g => {
    let best = null;
    for (const sp of g.sps) for (const e of (LU[sp] && LU[sp][teamId]) || []) if (!BENCH.has(e.slot) && (!best || e.pts > best.points)) best = { name: (P[e.id] || {}).name, points: r1(e.pts) };
    return best;
  };
  const bestWeeks = [...myGames].sort((a, b) => b.me - a.me).slice(0, 3).map(g => ({ week: g.week, myScore: r1(g.me), oppName: tName[g.oppId], oppScore: r1(g.opp), won: g.won, topPlayer: topStarter(g) }));
  const wins = myGames.filter(g => g.won);
  const bd = wins.sort((a, b) => (b.me - b.opp) - (a.me - a.opp))[0];
  const beatdown = bd ? { week: bd.week, myScore: r1(bd.me), oppName: tName[bd.oppId], oppScore: r1(bd.opp), margin: r1(bd.me - bd.opp) } : null;

  const close = myGames.filter(g => Math.abs(g.me - g.opp) < 10 && !g.tie);
  const elim = myGames.filter(g => g.playoff);
  // comeback: score as each kickoff window started; biggest deficit I came back from
  const when = t => {
    const et = new Date(t - 4 * 3600e3); // close enough to US Eastern for labels
    const day = et.getUTCDay(), h = et.getUTCHours();
    if (day === 1) return 'Monday night';
    if (day === 0 && h >= 19) return 'Sunday night';
    if (day === 0 && h >= 15) return 'the late Sunday games';
    if (day === 0) return 'Sunday';
    return null;
  };
  let comeback = null;
  for (const g of myGames.filter(g => g.won)) {
    const pl = (t) => g.sps.flatMap(sp => ((LU[sp] && LU[sp][t]) || []).filter(e => !BENCH.has(e.slot)).map(e => ({ ...e, at: (gameAt[(P[e.id] || {}).proTeam] || {})[sp] || 0 })));
    const mine = pl(teamId), theirs = pl(g.oppId);
    const kicks = [...new Set([...mine, ...theirs].map(e => e.at).filter(Boolean))].sort((a, b) => a - b);
    for (const k of kicks.slice(1)) {
      const a = sum(mine.filter(e => e.at && e.at < k).map(e => e.pts)), b = sum(theirs.filter(e => e.at && e.at < k).map(e => e.pts));
      const deficit = b - a, label = when(k);
      if (deficit > 0 && label && (!comeback || deficit > comeback.deficit)) {
        const rest = mine.filter(e => e.at >= k).sort((x, y) => y.pts - x.pts)[0];
        comeback = { week: g.week, deficit: r1(deficit), goingInto: label, finalMargin: r1(g.me - g.opp), player: rest ? (P[rest.id] || {}).name : null, playerPoints: rest ? r1(rest.pts) : null };
      }
    }
  }
  if (comeback && comeback.deficit < 10) comeback = null;
  const clutch = {
    closeRecord: { wins: close.filter(g => g.won).length, losses: close.filter(g => !g.won).length },
    eliminationRecord: elim.length ? { wins: elim.filter(g => g.won).length, losses: elim.filter(g => !g.won).length } : null,
    comeback,
  };

  // ---- waivers: starter points the pickup gave the team that added him ----
  const addVal = adds.map(a => {
    let p = 0, seen = false;
    for (const { sp } of sps) {
      if (sp < a.sp) continue;
      if (!onRoster(sp, a.team, a.pid)) { if (seen) break; if (sp > a.sp) break; continue; }
      seen = true; p += started(sp, a.team, a.pid) || 0;
    }
    return { ...a, pointsAfter: p };
  });
  const bestAdd = new Map();
  for (const a of addVal) { const k = a.team + ':' + a.pid; if (!bestAdd.has(k) || bestAdd.get(k).pointsAfter < a.pointsAfter) bestAdd.set(k, a); }
  const allAdds = [...bestAdd.values()].filter(a => a.pointsAfter > 0).sort((a, b) => b.pointsAfter - a.pointsAfter);
  const usingFaab = !!(st.acquisitionSettings && st.acquisitionSettings.isUsingAcquisitionBudget);
  const myAdd = allAdds.find(a => a.team === teamId);
  const waivers = {
    myBest: myAdd ? { player: pInfo(myAdd.pid, myAdd.sp), week: myAdd.sp, faab: usingFaab ? myAdd.faab : null, pointsAfter: r1(myAdd.pointsAfter), leagueRank: allAdds.indexOf(myAdd) + 1 } : null,
    top5: allAdds.slice(0, 5).map(a => ({ player: (P[a.pid] || {}).name, pos: (P[a.pid] || {}).pos, teamName: tName[a.team], week: a.sp, pointsAfter: r1(a.pointsAfter), isMine: a.team === teamId })),
  };

  // ---- trades output ----
  const counts = {}; teams.forEach(t => { counts[t.id] = 0; });
  graded.forEach(d => d.pair.forEach(t => { counts[t]++; }));
  const podium = teams.map(t => t.id).filter(id => counts[id] > 0).sort((a, b) => counts[b] - counts[a] || tName[a].localeCompare(tName[b])).slice(0, 3)
    .map(id => ({ teamId: id, teamName: tName[id], initials: initials(tName[id]), count: counts[id], isMine: id === teamId }));

  const byShare = [...myGraded].sort((a, b) => b.share[teamId] - a.share[teamId]);
  const bestD = byShare[0] || null;
  const worstD = byShare.length > 1 && byShare[byShare.length - 1].share[teamId] < .5 ? byShare[byShare.length - 1] : null;
  const perWeek = (pids, ws) => ws.length ? startedPts(pids, ws) / ws.length : 0;
  const best = bestD && (() => {
    const after = spsAfter(bestD.eff), before = sps.map(x => x.sp).filter(sp => sp < bestD.eff);
    const delta = perWeek(bestD.got(teamId), after) - perWeek(bestD.got(other(bestD)), before);
    return tradeOut(bestD, { grade: shareGrade(bestD.share[teamId]), lineupDelta: r1(delta) });
  })();
  const worst = worstD && tradeOut(worstD, { grade: shareGrade(worstD.share[teamId]) });
  // defining: the deal whose incoming players gave my starting lineup the most points
  const defPool = myGraded.length > 2 ? myGraded.filter(d => d !== bestD && d !== worstD) : myGraded;
  const defD = [...defPool].sort((a, b) => startedPts(b.got(teamId), spsAfter(b.eff)) - startedPts(a.got(teamId), spsAfter(a.eff)))[0] || null;
  const defining = defD && tradeOut(defD, { rankBefore: rankAt(Math.max(0, Math.min(defD.eff - 1, lastReg))), rankFinal: finalStanding });
  const fleeceD = graded.filter(d => d.hasAfter).sort((a, b) => Math.abs(b.share[b.pair[0]] - .5) - Math.abs(a.share[a.pair[0]] - .5))[0] || null;
  const fleece = fleeceD && (() => {
    const [a, b] = fleeceD.pair, win = fleeceD.share[a] >= .5 ? a : b, lose = win === a ? b : a;
    const side = t => ({ teamId: t, teamName: tName[t], isMine: t === teamId, got: fleeceD.got(t).map(pid => pInfo(pid, fleeceD.eff)), grade: shareGrade(fleeceD.share[t]), valueShare: Math.round(fleeceD.share[t] * 100) });
    return { week: fleeceD.week, winner: side(win), loser: side(lose) };
  })();

  // ---- summary ----
  const myStarted = {}; // pid -> [points, weeks]
  for (const { sp } of sps) for (const e of (LU[sp] && LU[sp][teamId]) || []) if (!BENCH.has(e.slot)) { const m = myStarted[e.id] || (myStarted[e.id] = [0, 0]); m[0] += e.pts; m[1]++; }
  const bp = Object.entries(myStarted).sort((a, b) => b[1][0] - a[1][0])[0];
  const highScore = myGames.length ? Math.max(...myGames.map(g => g.me)) : 0;

  // manager grade (provisional): finish, start/sit, trades, waivers
  const finishC = N > 1 ? 1 - (finalStanding - 1) / (N - 1) : .5;
  let act = 0, opt = 0;
  for (const { sp } of sps) { const es = (LU[sp] && LU[sp][teamId]) || []; act += sum(es.filter(e => !BENCH.has(e.slot)).map(e => e.pts)); opt += optimalPoints(es, lc); }
  const startSitC = opt > 0 ? clamp01((act / opt - .80) / .17) : .5;
  const tv = sum(myGraded.map(d => d.value[d.pair[0]] + d.value[d.pair[1]]));
  const tradeC = myGraded.length && tv > 0 ? clamp01((sum(myGraded.map(d => d.share[teamId] * (d.value[d.pair[0]] + d.value[d.pair[1]]))) / tv - .3) / .4) : .5;
  const wTot = {}; teams.forEach(t => { wTot[t.id] = 0; }); addVal.forEach(a => { wTot[a.team] += a.pointsAfter; });
  const wOrder = Object.keys(wTot).map(Number).sort((a, b) => wTot[b] - wTot[a]);
  const waiverC = N > 1 ? 1 - wOrder.indexOf(teamId) / (N - 1) : .5;
  const comps = [finishC, startSitC, tradeC, waiverC];
  const gradeScore = sum(comps.map((x, i) => x * GRADE_W[i])) / sum(GRADE_W);

  const owner = (L.members || []).find(m => (me.owners || [])[0] === m.id) || {};
  const myTrades = myDeals.length;
  const out = {
    league: { id: String(league), name: st.name || 'League', year, teamCount: N, weeksPlayed: W, regularSeasonWeeks: regWeeks, seasonComplete },
    me: { teamId, teamName: tName[teamId], managerName: owner.firstName || owner.displayName || tName[teamId] },
    trades: {
      leagueTotal: graded.length,
      mine: myTrades,
      podium,
      best, worst, defining, fleece,
      network: graded.map(d => d.pair), // one [teamId, teamId] per trade, for the share card
    },
    waivers,
    standingsByWeek,
    callouts,
    bestWeeks,
    beatdown,
    clutch,
    summary: {
      managerGrade: seasonGrade(gradeScore),
      finalStanding,
      tradesMade: myTrades,
      highScore: r1(highScore),
      bestPlayer: bp ? { name: (P[bp[0]] || {}).name, ptsPerWeek: r1(bp[1][0] / bp[1][1]) } : null,
      bestTrade: best ? { grade: best.grade, label: `Got ${best.got.map(p => p.name).join(' + ') || 'nothing'}, Wk ${best.week}` } : null,
      beatdown: beatdown ? { margin: beatdown.margin, label: `Wk ${beatdown.week} vs ${beatdown.oppName}` } : null,
    },
    // which cards have real data (the slideshow skips the rest)
    cards: {
      leagueTrades: graded.length > 0,
      myTrades: graded.length > 0,
      best: !!best, worst: !!worst, defining: !!defining, fleece: !!fleece,
      waivers: !!(waivers.myBest || waivers.top5.length),
      timelapse: lastReg >= 2,
      bestWeeks: bestWeeks.length > 0,
      beatdown: !!beatdown,
      clutch: close.length > 0 || elim.length > 0 || !!comeback,
    },
  };
  // internal checks, not for the page
  Object.defineProperty(out, '_debug', { enumerable: false, value: { accepts: accepts.length, deals: deals.length, unverifiedMoves: unverified, comps, gradeScore, graded } });
  return out;
}

// ---------- owner check ----------
async function ownerTeam(tok, league) {
  const h = { apikey: SUPA_ANON, Authorization: 'Bearer ' + tok };
  const u = await fetch(SUPA_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) return { error: 401 };
  const user = await u.json();
  const r = await fetch(`${SUPA_URL}/rest/v1/user_state?user_id=eq.${encodeURIComponent(user.id)}&select=state`, { headers: h });
  if (!r.ok) return { error: 403 };
  const rows = await r.json();
  const S = rows && rows[0] && rows[0].state;
  if (!S) return { error: 403 };
  const key = 'espn:' + league;
  const e = (S.leagues || []).find(x => x.key === key);
  let ref = e ? e.meRef : null;
  if (ref == null && S.real && S.real.src && S.real.src.type + ':' + S.real.src.league === key) {
    ref = Object.keys(S.real.src.rid || {}).find(k => S.real.src.rid[k] === S.me) ?? null;
  }
  if (ref == null) {
    const sl = (S.leagues || []).some(x => x.key === 'sleeper:' + league);
    return { error: sl ? 400 : 403, code: sl ? 'unsupported' : 'not_owner' };
  }
  return { teamId: +ref };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const q = req.query || {};
  const league = String(q.league || '').trim(), year = parseInt(q.year, 10);
  if (!/^\d{1,12}$/.test(league)) return res.status(400).json({ code: 'bad_id', error: 'League ID should be a number.' });
  if (!(year >= 2018 && year <= 2100)) return res.status(400).json({ code: 'bad_year', error: 'Bad season.' });

  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!tok) return res.status(401).json({ code: 'sign_in', error: 'Sign in to see your recap.' });
  let who;
  try { who = await ownerTeam(tok, league); } catch (e) { return res.status(502).json({ code: 'upstream', error: "Couldn't check your sign-in. Try again." }); }
  if (who.error === 401) return res.status(401).json({ code: 'sign_in', error: 'Sign in to see your recap.' });
  if (who.code === 'unsupported') return res.status(400).json({ code: 'unsupported', error: 'Recaps are ESPN-only for now.' });
  if (who.error) return res.status(403).json({ code: 'not_owner', error: 'This recap belongs to another account.' });

  let creds = null;
  const b = req.method === 'POST' ? (req.body || {}) : {};
  if (b.s2 && b.swid) {
    let sw = String(b.swid).trim(), s2 = String(b.s2).trim();
    try { if (/%[0-9A-F]{2}/i.test(s2)) s2 = decodeURIComponent(s2); } catch {}
    if (!sw.startsWith('{')) sw = '{' + sw.replace(/[{}]/g, '') + '}';
    if (/^\{[0-9A-Fa-f-]{36}\}$/.test(sw) && /^[A-Za-z0-9%+/=_.-]{40,2000}$/.test(s2)) creds = { s2, swid: sw };
  }
  try {
    return res.status(200).json(await buildRecap({ league, year, teamId: who.teamId, creds }));
  } catch (e) {
    if (e.code === 'denied') return res.status(401).json({ code: 'private', error: 'This is a private league. Send your ESPN codes to read it.' });
    if (e.code === 'not_found') return res.status(404).json({ code: 'not_found', error: 'No league with that ID for this season.' });
    if (e.code === 'team_not_found') return res.status(404).json({ code: 'team_not_found', error: 'Your team is no longer in this league.' });
    return res.status(502).json({ code: 'upstream', error: "Couldn't build the recap. Try again." });
  }
}
