// Mock drafts (offseason Draft Tools): rooms, the rules engine, CPU drafting, the pick clock and draft grades.
//
// POST /api/draft   Authorization: Bearer <Supabase access token>     body {action, ...}
//   solo:    create (mode solo) -> tick / pick / undo / pause / resume / abandon
//   friends: create (mode friends) / join {code} / settings / order / kick / rename / start / pause / resume / chat / react
//   public:  lobbies / quick / join {id}
//   all:     state / queue / pick / tick / leave / back / results / result
//
// The server owns the truth. Serverless functions can't hold a timer, so each room stores a pick deadline and
// clients call "tick" when they see it pass (or when a CPU seat is up). tick checks the deadline itself and is safe
// to call from many clients at once: draft_picks is unique on (room, pick number), so only one pick can land.
//
// Storage: Supabase tables from supabase/mockdraft.sql, written with the secret key (SUPABASE_SECRET_KEY).
// Until that is set up, solo drafts still work: the page sends the draft back with each request ("carry") and the
// server only validates and advances it. Rooms with other people need the tables.
//
// The pool's order ("ADP") is the blend of expert consensus and market value already used for TradeMetric Rankings,
// adjusted for the room's scoring. CPU teams draft from that order. Grade weights are never sent to the page.

import { randomUUID, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/* Who has Pro: the one beta switch and profiles.plan, in api/_plan.js */
import { isProPlan } from './_plan.js';
const SUPA_URL = (process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co').replace(/\/+$/, '');
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
/* Draft grade blend: value against ADP, TradeMetric rank of the roster, lineup strength, roster balance.
   Can be overridden with the DRAFT_GRADE_W environment variable ("a,b,c,d"). Never shown on the site. */
const GRADE_W = (() => {
  const v = String(process.env.DRAFT_GRADE_W || '').split(',').map(Number);
  return v.length === 4 && v.every(x => x >= 0) && v.some(x => x > 0) ? v : [30, 25, 30, 15];
})();

/* test hooks (scripts/test-mockdraft.mjs): an in-memory store, a fake sign-in and a fake clock */
export const _t = { mem: null, auth: null, now: null, data: null };
const NOW = () => (_t.now ? _t.now() : Date.now());

const TEAM_MIN = 4, TEAM_MAX = 20, SCORING = ['ppr', 'half', 'std'], CLOCK_MIN = 10, CLOCK_MAX = 180, SPEEDS = ['instant', 'fast', 'real'];
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'], SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SF', 'K', 'DST', 'BN'];
const SLOT_MAX = { QB: 2, RB: 4, WR: 4, TE: 2, FLEX: 3, SF: 1, K: 1, DST: 1, BN: 10 };
const DEF_ROSTER = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SF: 0, K: 1, DST: 1, BN: 6 };
const CAP = { QB: 36, RB: 72, WR: 96, TE: 36 };
const PRESETS = [
  { key: 'ppr12', name: '12-team PPR', settings: { teams: 12, scoring: 'ppr', roster: { ...DEF_ROSTER } } },
  { key: 'ppr10', name: '10-team PPR', settings: { teams: 10, scoring: 'ppr', roster: { ...DEF_ROSTER } } },
  { key: 'sfppr12', name: '12-team Superflex', settings: { teams: 12, scoring: 'ppr', roster: { ...DEF_ROSTER, SF: 1, BN: 6 } } },
];
const LOBBY_MS = 3 * 60e3, PAUSE_MAX_MS = 5 * 60e3, EMPTY_LOBBY_MS = 15 * 60e3, KEEP_DONE_MS = 30 * 864e5;
const STRATS = ['bal', 'bal', 'rb', 'wr', 'te', 'qb', 'lateqb'];
const STRAT_NAME = { bal: 'Balanced', rb: 'Running backs early', wr: 'Receivers early', te: 'Early tight end', qb: 'Early quarterback', lateqb: 'Waited on quarterback' };
const CPU_NAMES = ['Gridiron Ghosts', 'Fourth and Long', 'Blitz Brigade', 'The Waiver Wire', 'Sunday Scaries', 'End Zone Elite', 'Hail Mary Heroes', 'Red Zone Regulars',
  'Pigskin Prophets', 'The Bye Weeks', 'Two Minute Drill', 'Goal Line Stand', 'Monday Night Lights', 'Pocket Presence', 'Screen Pass Society', 'The Audibles',
  'Draft Day Dreams', 'Fumble Recovery', 'Victory Formation', 'Slot Machines', 'Stiff Arm Squad', 'The Chain Movers', 'Onside Kings', 'Play Action Heroes',
  'Cover Zero', 'The Late Rounders', 'Flex Appeal', 'Turf Burners', 'Snap Count', 'Garbage Time All-Stars'];
const COLORS = ['#0FA3A3', '#7B5CFF', '#E0364F', '#22A35A', '#D14FA3', '#D9A21B', '#3A6FE0', '#1BA7D6', '#9A4FD1', '#7BB21E', '#EC6F8E', '#5A6E96', '#B0713F', '#4B45C8'];
const EMOJI = ['🔥', '😂', '😬', '👏', '💀', '🧊'];

/* ---------- small helpers ---------- */
const rnd = () => randomInt(0, 2 ** 31) / 2 ** 31;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
const iso = ms => new Date(ms).toISOString();
const ms = s => (s ? Date.parse(s) : null);
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_CH[randomInt(0, CODE_CH.length)]).join('');
class Fail extends Error { constructor(code, msg, status) { super(msg || code); this.code = code; this.status = status || 400; } }

/* ---------- who is asking ---------- */
const users = new Map();
async function userOf(req) {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers && req.headers.authorization) || ''); if (!m) return null;
  const tok = m[1].trim();
  if (_t.auth) return _t.auth(tok);
  if (tok.length < 20 || tok.length > 4000) return null;
  const c = users.get(tok); if (c && Date.now() - c.at < 5 * 60e3) return c.v;
  let v = null;
  try {
    const h = { apikey: SUPA_ANON, Authorization: 'Bearer ' + tok };
    const r = await fetch(SUPA_URL + '/auth/v1/user', { headers: h });
    if (r.ok) {
      const u = await r.json();
      if (u && u.id) {
        const p = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${u.id}&select=username,plan`, { headers: h });
        const rows = p.ok ? await p.json() : [], pr = rows[0] || {};
        v = { id: u.id, name: clean(pr.username || (u.email || '').split('@')[0] || 'Player', 24) || 'Player', pro: isProPlan(pr.plan) };
      }
    }
  } catch { return null; }
  if (users.size > 2000) users.clear();
  users.set(tok, { at: Date.now(), v }); return v;
}
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list); if (hits.size > 5000) hits.clear(); return false;
}

/* ---------- player data ---------- */
let DATA = null, DATA_AT = 0;
async function data() {
  if (_t.data) return _t.data;
  if (DATA && Date.now() - DATA_AT < 30 * 60e3) return DATA;
  const rd = async f => { try { return JSON.parse(await readFile(path.join(process.cwd(), 'data', f), 'utf8')); } catch { return null; } };
  const [nfl, market, hist] = await Promise.all([rd('nfl.json'), rd('market.json'), rd('tmhist.json')]);
  if (!nfl) throw new Fail('no_data', 'Player data is not available right now.', 503);
  DATA = { nfl, market: market || {}, hist: hist || {} }; DATA_AT = Date.now(); POOLS.clear(); return DATA;
}
const POOLS = new Map();
const rounds = set => SLOTS.reduce((s, k) => s + (set.roster[k] || 0), 0);
/* The room's player pool in draft order. Each entry: {id, n, pos, t, bye, adp, ppg, tm}. */
async function poolFor(set) {
  const R = rounds(set), sf = set.roster.SF > 0, key = [set.teams, R, set.scoring, sf ? 1 : 0, set.roster.K ? 1 : 0, set.roster.DST ? 1 : 0].join('|');
  if (POOLS.has(key)) return POOLS.get(key);
  const { nfl: D, market: M, hist } = await data();
  const F = D.fields || [], fi = k => F.indexOf(k), fc = (sf ? M.fc2 : M.fc1) || M.fc1 || {}, ros = D.ros || {}, bye = D.bye || {};
  const recAdj = set.scoring === 'ppr' ? .5 : set.scoring === 'std' ? -.5 : 0;
  const skill = [];
  Object.keys(CAP).forEach(pos => {
    let L = (D.players || []).filter(p => p[2] === pos && (ros[p[0]] != null || fc[p[0]] != null)).map(p => {
      const pr = p[6] || [], g = k => +pr[fi(k)] || 0;
      const half = g('pyd') / 25 + g('ptd') * 4 - g('int') * 2 + g('ryd') / 10 + g('rtd') * 6 + g('rec') * .5 + g('recyd') / 10 + g('rectd') * 6 - g('fl') * 2;
      return { id: p[0], n: p[1], pos, t: p[3] || '', ecr: ros[p[0]] ? ros[p[0]][0] : null, fc: fc[p[0]] || null, half, ppg: half + recAdj * g('rec'), games: (p[7] || []).length };
    });
    L.sort((a, b) => (a.ecr ?? 999) - (b.ecr ?? 999) || (b.fc || 0) - (a.fc || 0)); L = L.slice(0, CAP[pos]);
    /* the market's value curve at this position puts an expert rank and a market value on the same scale */
    const curve = L.map(o => o.fc).filter(Boolean).sort((a, b) => b - a), nm = curve.length;
    const at = r => { if (!nm) return 0; if (r <= 1) return curve[0]; const i = r - 1, lo = Math.floor(i), f = i - lo; if (lo + 1 < nm) return curve[lo] * (1 - f) + curve[lo + 1] * f; return curve[nm - 1] * Math.pow(.93, i - (nm - 1)); };
    const mk = [...L].sort((a, b) => (b.fc || 0) - (a.fc || 0)); mk.forEach((o, i) => o.mPos = o.fc ? i + 1 : null);
    L.forEach(o => {
      const vCons = at(o.ecr != null ? o.ecr : (o.mPos || nm + 1)), vAdp = o.fc ? o.fc : at(Math.max(o.ecr || 0, nm + 1));
      const adj = o.half > 3 ? Math.min(1.3, Math.max(.75, Math.pow(Math.max(o.ppg, 1) / o.half, .7))) : 1;
      o.v = (vCons + vAdp) / 2 * adj; skill.push(o);
    });
  });
  skill.sort((a, b) => b.v - a.v);
  /* kickers and defenses sit in the last three rounds of the order */
  const kd = [];
  if (set.roster.K) (D.k || []).filter(k => ros[k[0]]).sort((a, b) => ros[a[0]][0] - ros[b[0]][0]).forEach((k, i) => {
    const s = k[5] || []; kd.push({ id: k[0], n: k[1], pos: 'K', t: k[2] || '', o: i, ppg: 3 * (+s[0] || 0) + 4 * (+s[1] || 0) + 5 * (+s[2] || 0) + (+s[4] || 0) });
  });
  if (set.roster.DST) (D.dst || []).filter(d => ros['dst-' + String(d[0]).toLowerCase()]).sort((a, b) => ros['dst-' + a[0].toLowerCase()][0] - ros['dst-' + b[0].toLowerCase()][0]).forEach((d, i) => {
    const s = d[1] || [], pa = +s[5] || 21, tier = pa < 7 ? 7 : pa < 14 ? 4 : pa < 21 ? 1 : pa < 28 ? 0 : pa < 35 ? -1 : -4;
    kd.push({ id: 'dst-' + d[0].toLowerCase(), n: (TEAM_NICK[d[0]] || d[0]) + ' D/ST', pos: 'DST', t: d[0], o: i + .5, ppg: (+s[0] || 0) + 2 * (+s[1] || 0) + 2 * (+s[2] || 0) + 6 * (+s[3] || 0) + 2 * (+s[4] || 0) + tier });
  });
  kd.sort((a, b) => a.o - b.o);
  const out = [], start = Math.min(skill.length, Math.max(0, set.teams * (R - 3)));
  let si = 0, ki = 0;
  while (si < skill.length || ki < kd.length) {
    if (si < start || ki >= kd.length) { if (si < skill.length) out.push(skill[si++]); else out.push(kd[ki++]); }
    else { out.push(kd[ki++]); if (si < skill.length) out.push(skill[si++]); }
  }
  const days = (hist && hist.days) || [], tmIds = days.length ? days[days.length - 1].ids || [] : [], tm = {}; tmIds.forEach((id, i) => tm[id] = i + 1);
  const list = out.map((o, i) => ({ id: o.id, n: o.n, pos: o.pos, t: o.t, bye: bye[o.t] || 0, adp: i + 1, ppg: Math.round(o.ppg * 10) / 10, tm: tm[o.id] || null }));
  const P = { key, list, by: Object.fromEntries(list.map(o => [o.id, o])) };
  if (POOLS.size > 60) POOLS.clear(); POOLS.set(key, P); return P;
}
const TEAM_NICK = { ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LV: 'Raiders', LAC: 'Chargers', LAR: 'Rams', LA: 'Rams', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SF: '49ers', SEA: 'Seahawks', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders' };

/* ---------- settings ---------- */
function cleanSettings(s, mode) {
  s = s || {}; const r = s.roster || {}, roster = {};
  SLOTS.forEach(k => { const v = Math.round(+r[k]); roster[k] = Number.isFinite(v) ? Math.min(SLOT_MAX[k], Math.max(0, v)) : DEF_ROSTER[k]; });
  if (roster.QB + roster.RB + roster.WR + roster.TE + roster.FLEX + roster.SF < 1) Object.assign(roster, DEF_ROSTER);
  const tn = Math.round(+s.teams), teams = tn >= TEAM_MIN && tn <= TEAM_MAX ? tn : 12;
  /* the pool has to cover every pick */
  /* 240 skill players are ranked; very large leagues get a shorter bench so nobody is left without a real pick */
  let guard = 0; while (teams * (SLOTS.reduce((a, k) => a + roster[k], 0) - roster.K - roster.DST) > 220 && roster.BN > 0 && guard++ < 20) roster.BN--;
  const cn = Math.round(+s.clock); let clock = cn === 0 ? 0 : cn >= CLOCK_MIN && cn <= CLOCK_MAX ? cn : 60; if (mode !== 'solo' && !clock) clock = 60; if (mode === 'public') clock = 60;
  return { teams, scoring: SCORING.includes(s.scoring) ? s.scoring : 'ppr', roster, clock, speed: SPEEDS.includes(s.speed) ? s.speed : 'fast', slot: Math.min(teams, Math.max(0, Math.round(+s.slot) || 0)) };
}

/* ---------- rules engine ---------- */
const total = room => room.settings.teams * rounds(room.settings);
function seatAt(k, n) { const r = Math.floor(k / n), i = k % n; return r % 2 ? n - 1 - i : i; }
function countsOf(ids, P) { const c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 }; ids.forEach(id => { const o = P.by[id]; if (o) c[o.pos]++; }); return c; }
/* How a set of position counts sits in the roster: open starting slots, and how many players need a bench spot. */
function fit(c, R) {
  const over = {}, open = {}; POS.forEach(p => { const d = c[p] - (R[p] || 0); over[p] = Math.max(0, d); open[p] = Math.max(0, -d); });
  const fp = over.RB + over.WR + over.TE, uf = Math.min(R.FLEX || 0, fp); open.FLEX = (R.FLEX || 0) - uf;
  const sp = fp - uf + over.QB, us = Math.min(R.SF || 0, sp); open.SF = (R.SF || 0) - us;
  const bench = sp - us + over.K + over.DST;
  return { open, bench, openN: Object.values(open).reduce((a, b) => a + b, 0) };
}
const seatIds = (picks, seat) => picks.filter(p => p.seat === seat).map(p => p.player_id);
function legalFor(c, pos, R) { const d = { ...c }; d[pos]++; return fit(d, R).bench <= (R.BN || 0); }
function stratMult(strat, pos, round, c) {
  if (round > 6) return 1;
  if (strat === 'rb') return pos === 'RB' && round <= 4 ? 1.4 : 1;
  if (strat === 'wr') return pos === 'RB' && round <= 5 ? .4 : pos === 'WR' ? 1.2 : 1;
  if (strat === 'te') return pos === 'TE' && !c.TE && round >= 2 && round <= 4 ? 1.7 : 1;
  if (strat === 'qb') return pos === 'QB' && !c.QB && round >= 2 && round <= 4 ? 1.8 : 1;
  if (strat === 'lateqb') return pos === 'QB' ? .04 : 1;
  return 1;
}
/* One CPU pick. tight = an autopick for a person: best available with roster sense, almost no randomness. */
function cpuPick(room, picks, P, seat, strat, tight) {
  const set = room.settings, R = set.roster, n = set.teams, RN = rounds(set), k = picks.length, round = Math.floor(k / n) + 1;
  const taken = new Set(picks.map(p => p.player_id)), mine = seatIds(picks, seat).map(id => P.by[id]).filter(Boolean);
  const c = countsOf(mine.map(o => o.id), P), now = fit(c, R), left = RN - mine.length;       // picks this seat still has, this one included
  const sf = R.SF > 0, maxN = { QB: Math.max(2, R.QB + R.SF + (sf ? 1 : 0)), TE: Math.max(2, R.TE), K: R.K, DST: R.DST, RB: 99, WR: 99 };
  const coreOpen = now.open.QB + now.open.RB + now.open.WR + now.open.TE + now.open.FLEX + now.open.SF;
  const must = left <= now.openN;                                                              // every pick left has to fill a starting slot
  /* in big leagues a position can run short: never take a spare QB or TE that another team still needs to start */
  const left0 = { QB: 0, TE: 0 }, short = { QB: 0, TE: 0 };
  for (const o of P.list) if (!taken.has(o.id) && left0[o.pos] != null) left0[o.pos]++;
  for (let i = 0; i < n; i++) { if (i === seat) continue; const ci = countsOf(seatIds(picks, i), P); short.QB += Math.max(0, R.QB - ci.QB); short.TE += Math.max(0, R.TE - ci.TE); }
  const cand = [];
  for (const o of P.list) {
    if (taken.has(o.id)) continue;
    if (!legalFor(c, o.pos, R)) continue;
    if (left0[o.pos] != null && c[o.pos] >= R[o.pos] && left0[o.pos] <= short[o.pos]) continue;
    const d = { ...c }; d[o.pos]++; const after = fit(d, R), fills = after.openN < now.openN;
    if (must && !fills) continue;
    if (left - 1 < after.openN) continue;
    if (c[o.pos] >= maxN[o.pos]) continue;
    if ((o.pos === 'K' || o.pos === 'DST') && round <= RN - 3) continue;
    if (!fills && coreOpen > 0) { if (o.pos === 'TE' && c.TE >= R.TE) continue; if (o.pos === 'QB' && c.QB >= R.QB && !sf) continue; }
    let w = 1;
    if (fills) w *= (o.pos === 'K' || o.pos === 'DST') ? 1.1 : now.open[o.pos] > 0 ? 1.3 : 1.08;
    else {
      w *= coreOpen > 0 && round <= (RN - (R.BN || 0)) + 1 ? .5 : .9;
      const depth = c[o.pos] - (R[o.pos] || 0); if (depth > 0) w *= Math.pow(o.pos === 'QB' || o.pos === 'TE' ? .45 : .9, depth);
    }
    if (!tight) w *= stratMult(strat, o.pos, round, c);
    /* tie-breakers: same bye as someone at his position, or a third player from one NFL team */
    if (o.bye && mine.some(m => m.pos === o.pos && m.bye === o.bye)) w *= .93;
    if (o.t && mine.filter(m => m.t === o.t).length >= 2) w *= .9;
    cand.push({ o, w, fills });
    if (cand.length >= (tight ? 8 : 16)) break;
  }
  if (!cand.length) {                                                                          // nothing fits the rules: any legal player, then anyone
    const any = P.list.find(o => !taken.has(o.id) && legalFor(c, o.pos, R)) || P.list.find(o => !taken.has(o.id));
    return any ? any.id : null;
  }
  const a0 = cand[0].o.adp, tau = tight ? .5 : 1.5 + .45 * round;
  let sum = 0; cand.forEach(x => { x.w *= Math.exp(-(x.o.adp - a0) / tau); sum += x.w; });
  let r = rnd() * sum; for (const x of cand) { r -= x.w; if (r <= 0) return x.o.id; }
  return cand[0].o.id;
}
function speedDelay(speed) { return speed === 'instant' ? 0 : speed === 'real' ? 3000 + Math.floor(rnd() * 5000) : 1500; }
/* sets the deadline for the pick now on the clock (or finishes the draft) */
function setClock(room, now) {
  if (room.cur >= total(room)) { room.status = 'done'; room.pick_deadline = null; room.finished_at = iso(now); return; }
  const seat = room.seats[seatAt(room.cur, room.settings.teams)], bot = seat.k === 'c' || seat.auto;
  const d = bot ? speedDelay(room.settings.speed) : room.settings.clock ? room.settings.clock * 1000 : null;
  room.pick_deadline = d == null ? null : iso(now + d);
}
/* Makes every pick that is due. Solo rooms run through all CPU picks up to the person's next turn in one go and
   hand back a delay for each, so the page can play them one by one at the chosen speed. */
async function advance(room, picks, P, getQueue, now) {
  const made = [], solo = room.mode === 'solo', n = room.settings.teams; let wait = 0, guard = 0;
  if (room.status === 'paused' && room.pause_until && now >= ms(room.pause_until)) { room.status = 'live'; room.pick_deadline = iso(now + (room.paused_left || 0)); room.pause_until = null; room.paused_left = null; }
  while (room.status === 'live' && guard++ < 400) {
    const si = seatAt(room.cur, n), seat = room.seats[si], bot = seat.k === 'c' || !!seat.auto, dl = ms(room.pick_deadline);
    const due = (solo && bot) || (dl != null && now >= dl - 250);
    if (!due) break;
    let id = null, how = seat.k === 'c' ? 'cpu' : 'auto';
    if (seat.k !== 'c') {
      const q = (await getQueue(seat.uid)) || [], taken = new Set(picks.map(p => p.player_id)), c = countsOf(seatIds(picks, si), P);
      const qid = q.find(x => P.by[x] && !taken.has(x) && legalFor(c, P.by[x].pos, room.settings.roster));
      if (qid) { id = qid; how = 'queue'; }
      if (!seat.auto && !solo) { seat.miss = (seat.miss || 0) + 1; if (seat.miss >= 2) seat.auto = true; }   // solo: each timeout is one autopick, the draft never runs off without you
    }
    if (!id) id = cpuPick(room, picks, P, si, seat.strat || 'bal', seat.k !== 'c');
    if (!id) { room.status = 'done'; room.pick_deadline = null; break; }
    const d = solo ? speedDelay(room.settings.speed) : 0; wait += d;
    const row = { room_id: room.id, pick_no: room.cur, seat: si, player_id: id, how, at: iso(now) };
    picks.push(row); made.push({ ...row, delay: d }); room.cur++;
    setClock(room, now);
    if (solo && room.status === 'live') { const nx = room.seats[seatAt(room.cur, n)]; if (nx.k !== 'c' && !nx.auto && room.settings.clock) room.pick_deadline = iso(now + wait + room.settings.clock * 1000); }
  }
  return made;
}

/* ---------- grades ---------- */
function lineupOf(ids, P, R) {
  const L = ids.map(id => P.by[id]).filter(Boolean).sort((a, b) => b.ppg - a.ppg), used = new Set(), start = [];
  const take = (slot, ok, n) => { for (let i = 0; i < n; i++) { const o = L.find(x => !used.has(x.id) && ok(x)); if (o) used.add(o.id); start.push({ slot, id: o ? o.id : null }); } };
  ['QB', 'RB', 'WR', 'TE'].forEach(p => take(p, x => x.pos === p, R[p] || 0));
  take('FLEX', x => x.pos === 'RB' || x.pos === 'WR' || x.pos === 'TE', R.FLEX || 0);
  take('SF', x => x.pos !== 'K' && x.pos !== 'DST', R.SF || 0);
  ['K', 'DST'].forEach(p => take(p, x => x.pos === p, R[p] || 0));
  const bench = L.filter(x => !used.has(x.id)).map(x => x.id);
  return { start, bench, pts: start.reduce((s, x) => s + (x.id ? P.by[x.id].ppg : 0), 0) };
}
const LETTERS = [[1.25, 'A+'], [.85, 'A'], [.55, 'A-'], [.3, 'B+'], [.05, 'B'], [-.2, 'B-'], [-.45, 'C+'], [-.75, 'C'], [-1, 'C-'], [-1.4, 'D'], [-9, 'F']];
const letter = z => LETTERS.find(x => z >= x[0])[1];
const zs = a => { const m = a.reduce((s, x) => s + x, 0) / a.length, sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) || 1; return a.map(x => (x - m) / Math.max(sd, 1e-6)); };
function gradeRoom(room, picks, P) {
  const set = room.settings, R = set.roster, n = set.teams, by = Array.from({ length: n }, () => []);
  picks.forEach(p => by[p.seat].push(p));
  const raw = by.map(pk => {
    const ids = pk.map(p => p.player_id), lu = lineupOf(ids, P, R), c = countsOf(ids, P), f = fit(c, R), starters = new Set(lu.start.map(x => x.id).filter(Boolean));
    let val = 0, tm = 0, best = null, reach = null;
    pk.forEach(p => {
      const o = P.by[p.player_id]; if (!o) return; const d = (p.pick_no + 1) - o.adp;
      if (o.pos !== 'K' && o.pos !== 'DST') {
        val += Math.max(-2 * n, Math.min(2 * n, d)) / (1 + .12 * Math.floor(p.pick_no / n));
        if (!best || d > best.d) best = { id: o.id, d, pick: p.pick_no + 1, adp: o.adp };
        if (!reach || d < reach.d) reach = { id: o.id, d, pick: p.pick_no + 1, adp: o.adp };
        tm += (starters.has(o.id) ? 1 : .4) * 100 / ((o.tm || o.adp) + 14);
      }
    });
    const bal = -3 * f.openN + Math.min(3, Math.max(0, c.RB - R.RB)) + Math.min(3, Math.max(0, c.WR - R.WR)) - Math.max(0, c.QB - Math.max(2, R.QB + R.SF)) - Math.max(0, c.TE - 2);
    const posPts = {}; ['QB', 'RB', 'WR', 'TE'].forEach(pos => { const need = (R[pos] || 0) + (pos === 'QB' ? R.SF : pos === 'TE' ? 0 : 1); posPts[pos] = ids.map(id => P.by[id]).filter(o => o && o.pos === pos).map(o => o.ppg).sort((a, b) => b - a).slice(0, Math.max(1, need)).reduce((s, x) => s + x, 0); });
    posPts.BN = lu.bench.map(id => P.by[id]).filter(o => o.pos !== 'K' && o.pos !== 'DST').map(o => o.ppg).sort((a, b) => b - a).slice(0, 4).reduce((s, x) => s + x, 0);
    return { val, tm, pts: lu.pts, bal, lu, best: best && best.d > 0 ? best : null, reach: reach && reach.d < 0 ? reach : null, posPts };
  });
  const Z = [zs(raw.map(x => x.val)), zs(raw.map(x => x.tm)), zs(raw.map(x => x.pts)), zs(raw.map(x => x.bal))], W = GRADE_W, ws = W.reduce((a, b) => a + b, 0);
  const tot = raw.map((_, i) => (W[0] * Z[0][i] + W[1] * Z[1][i] + W[2] * Z[2][i] + W[3] * Z[3][i]) / ws * 1.6);
  const rankOf = (arr, i) => arr.filter(x => x > arr[i] + 1e-9).length + 1;
  const pz = {}; ['QB', 'RB', 'WR', 'TE', 'BN'].forEach(k => pz[k] = raw.map(x => x.posPts[k]));
  return raw.map((x, i) => ({
    seat: i, grade: letter(tot[i]), score: Math.max(1, Math.min(99, Math.round(60 + tot[i] * 22))), rank: rankOf(tot, i), n,
    pts: Math.round(x.pts * 10) / 10, ptsRank: rankOf(raw.map(y => y.pts), i), start: x.lu.start, bench: x.lu.bench, best: x.best, reach: x.reach,
    pos: Object.fromEntries(Object.keys(pz).map(k => { const r = rankOf(pz[k], i); return [k, { rank: r, grade: letter(1.3 - 2.6 * (r - 1) / Math.max(1, n - 1)), bar: Math.round(100 * (pz[k][i] / (Math.max(...pz[k]) || 1))) }]; })),
  }));
}

/* ---------- storage ---------- */
function memStore(seed) {
  const M = seed || { rooms: new Map(), picks: new Map(), queues: new Map(), results: [] };
  const cp = x => JSON.parse(JSON.stringify(x));
  return {
    kind: 'mem', M,
    async roomGet(id) { const r = M.rooms.get(id); return r ? cp(r) : null; },
    async roomByCode(code) { for (const r of M.rooms.values()) if (r.code === code) return cp(r); return null; },
    async roomInsert(room) {
      for (const r of M.rooms.values()) { if (r.code === room.code) return false; if (room.mode === 'public' && r.mode === 'public' && r.status === 'lobby' && r.preset === room.preset) return false; }
      M.rooms.set(room.id, cp(room)); M.picks.set(room.id, []); return true;
    },
    async roomPatch(id, v, patch) { const r = M.rooms.get(id); if (!r) return false; if (v != null && r.v !== v) return false; Object.assign(r, cp(patch), { v: (r.v || 0) + 1, updated_at: iso(NOW()) }); return true; },
    async roomDelete(id) { M.rooms.delete(id); M.picks.delete(id); },
    async picksGet(id) { return cp(M.picks.get(id) || []); },
    async picksInsert(rows) { if (!rows.length) return true; const L = M.picks.get(rows[0].room_id) || []; if (rows.some(r => L.some(x => x.pick_no === r.pick_no))) return false; L.push(...cp(rows)); L.sort((a, b) => a.pick_no - b.pick_no); M.picks.set(rows[0].room_id, L); return true; },
    async picksDeleteFrom(id, n) { M.picks.set(id, (M.picks.get(id) || []).filter(p => p.pick_no < n)); },
    async queueGet(id, uid) { return cp(M.queues.get(id + '|' + uid) || []); },
    async queueSet(id, uid, ids) { M.queues.set(id + '|' + uid, cp(ids)); },
    async resultPut(uid, room, summary) { M.results = M.results.filter(r => !(r.user_id === uid && r.room_id === room.id)); M.results.push({ user_id: uid, room_id: room.id, summary: cp(summary), created_at: iso(NOW()) }); },
    async resultsList(uid) { return cp(M.results.filter(r => r.user_id === uid).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20)); },
    async lobbies() { return cp([...M.rooms.values()].filter(r => r.mode === 'public' && r.status === 'lobby')); },
    async soloOpen(uid) { return cp([...M.rooms.values()].filter(r => r.mode === 'solo' && r.host === uid && (r.status === 'live' || r.status === 'paused')).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null); },
    async created(uid, mode, since) { return [...M.rooms.values()].filter(r => r.host === uid && r.mode === mode && r.created_at >= since).length; },
    async cleanup() { const now = NOW(); for (const r of [...M.rooms.values()]) { if (r.status === 'lobby' && !(r.members || []).length && now - ms(r.updated_at) > EMPTY_LOBBY_MS) { M.rooms.delete(r.id); M.picks.delete(r.id); } if (r.status === 'done' && now - ms(r.updated_at) > KEEP_DONE_MS) { M.rooms.delete(r.id); M.picks.delete(r.id); } } },
    async ping() { },
  };
}
let SB_DOWN = 0;
async function sb(pathq, { method = 'GET', body, prefer } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try {
    const headers = { apikey: SUPA_KEY, 'content-type': 'application/json' };
    if (!SUPA_KEY.startsWith('sb_')) headers.authorization = 'Bearer ' + SUPA_KEY;
    if (prefer) headers.prefer = prefer;
    const r = await fetch(`${SUPA_URL}/rest/v1/${pathq}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text().catch(() => ''); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { }
    if (r.status === 401 || r.status === 403 || r.status === 404) SB_DOWN = Date.now() + 5 * 60e3;
    return { ok: r.ok, status: r.status, data: j };
  } catch { return { ok: false, status: 0, data: null }; } finally { clearTimeout(t); }
}
const ROOM_COLS = ['id', 'code', 'mode', 'preset', 'host', 'status', 'settings', 'seats', 'members', 'ordered', 'cur', 'pick_deadline', 'paused_left', 'pause_until', 'starts_at', 'chat', 'reacts', 'results', 'v', 'created_at', 'updated_at', 'finished_at'];
const e = encodeURIComponent;
function sbStore() {
  const need = r => { if (!r.ok) throw new Fail('store', 'The draft server is having trouble. Try again in a moment.', 503); return r.data; };
  return {
    kind: 'sb',
    async roomGet(id) { const d = need(await sb(`draft_rooms?id=eq.${e(id)}&select=*`)); return d[0] || null; },
    async roomByCode(code) { const d = need(await sb(`draft_rooms?code=eq.${e(code)}&select=*`)); return d[0] || null; },
    async roomInsert(room) { const row = {}; ROOM_COLS.forEach(k => { if (room[k] !== undefined) row[k] = room[k]; }); const r = await sb('draft_rooms', { method: 'POST', body: row, prefer: 'return=minimal' }); if (r.status === 409) return false; need(r); return true; },
    async roomPatch(id, v, patch) { const r = await sb(`draft_rooms?id=eq.${e(id)}${v != null ? '&v=eq.' + v : ''}`, { method: 'PATCH', body: { ...patch, v: (patch.v != null ? patch.v : (v || 0)) + 1, updated_at: iso(NOW()) }, prefer: 'return=representation' }); const d = need(r); return Array.isArray(d) && d.length > 0; },
    async roomDelete(id) { await sb(`draft_rooms?id=eq.${e(id)}`, { method: 'DELETE' }); },
    async picksGet(id) { return need(await sb(`draft_picks?room_id=eq.${e(id)}&select=room_id,pick_no,seat,player_id,how,at&order=pick_no.asc`)); },
    async picksInsert(rows) { if (!rows.length) return true; const r = await sb('draft_picks', { method: 'POST', body: rows.map(({ delay, ...x }) => x), prefer: 'return=minimal' }); if (r.status === 409) return false; need(r); return true; },
    async picksDeleteFrom(id, n) { need(await sb(`draft_picks?room_id=eq.${e(id)}&pick_no=gte.${n}`, { method: 'DELETE' })); },
    async queueGet(id, uid) { const r = await sb(`draft_queues?room_id=eq.${e(id)}&user_id=eq.${e(uid)}&select=ids`); return (r.ok && r.data[0] && r.data[0].ids) || []; },
    async queueSet(id, uid, ids) { need(await sb('draft_queues?on_conflict=room_id,user_id', { method: 'POST', body: { room_id: id, user_id: uid, ids, updated_at: iso(NOW()) }, prefer: 'resolution=merge-duplicates,return=minimal' })); },
    async resultPut(uid, room, summary) { await sb('draft_results?on_conflict=user_id,room_id', { method: 'POST', body: { user_id: uid, room_id: room.id, summary, created_at: iso(NOW()) }, prefer: 'resolution=merge-duplicates,return=minimal' }); },
    async resultsList(uid) { const r = await sb(`draft_results?user_id=eq.${e(uid)}&select=room_id,summary,created_at&order=created_at.desc&limit=20`); return r.ok ? r.data : []; },
    async lobbies() { return need(await sb(`draft_rooms?mode=eq.public&status=eq.lobby&select=*`)); },
    async soloOpen(uid) { const r = await sb(`draft_rooms?mode=eq.solo&host=eq.${e(uid)}&status=in.(live,paused)&select=*&order=created_at.desc&limit=1`); return (r.ok && r.data[0]) || null; },
    async created(uid, mode, since) { const r = await sb(`draft_rooms?host=eq.${e(uid)}&mode=eq.${mode}&created_at=gte.${e(since)}&select=id`); return r.ok ? r.data.length : 0; },
    async cleanup() {
      const now = NOW();
      await sb(`draft_rooms?status=eq.lobby&members=eq.{}&updated_at=lt.${e(iso(now - EMPTY_LOBBY_MS))}`, { method: 'DELETE' });
      await sb(`draft_rooms?status=eq.done&updated_at=lt.${e(iso(now - KEEP_DONE_MS))}`, { method: 'DELETE' });
    },
    /* tell everyone in the room something changed (Supabase Realtime broadcast). The page also polls, so a miss is harmless. */
    async ping(id) {
      try { const h = { apikey: SUPA_KEY, 'content-type': 'application/json' }; if (!SUPA_KEY.startsWith('sb_')) h.authorization = 'Bearer ' + SUPA_KEY;
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 1500);
        await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, { method: 'POST', headers: h, signal: ctl.signal, body: JSON.stringify({ messages: [{ topic: 'md-' + id, event: 'sync', payload: { at: NOW() } }] }) }).catch(() => { }); clearTimeout(t);
      } catch { }
    },
  };
}
let SB_OK = null, SB_OK_AT = 0;
async function storeOn() {
  if (_t.mem) return true; if (!SUPA_KEY || Date.now() < SB_DOWN) return false;
  if (SB_OK != null && Date.now() - SB_OK_AT < 5 * 60e3) return SB_OK;
  const r = await sb('draft_rooms?select=id&limit=1'); SB_OK = r.ok; SB_OK_AT = Date.now(); return SB_OK;
}

/* ---------- rooms ---------- */
function newSeat(kind, u, i, usedNames) {
  if (kind === 'h') return { k: 'h', uid: u.id, name: u.name, color: COLORS[i % COLORS.length], miss: 0, auto: false };
  if (kind === 'o') return { k: 'o' };
  const free = CPU_NAMES.filter(x => !usedNames.has(x)), name = free[Math.floor(rnd() * free.length)] || 'CPU ' + (i + 1); usedNames.add(name);
  return { k: 'c', name, color: COLORS[i % COLORS.length], strat: STRATS[Math.floor(rnd() * STRATS.length)] };
}
function recolor(room) { room.seats.forEach((s, i) => { if (s.k !== 'o') s.color = COLORS[i % COLORS.length]; }); }
const humans = room => room.seats.filter(s => s.k === 'h');
const here = room => room.seats.filter(s => s.k === 'h' && !s.left);
const seatOf = (room, uid) => room.seats.findIndex(s => s.k === 'h' && s.uid === uid);
function fillCpu(room) { const used = new Set(room.seats.map(s => s.name).filter(Boolean)); room.seats = room.seats.map((s, i) => s.k === 'o' ? newSeat('c', null, i, used) : s); }
function startRoom(room, now, randomize) {
  fillCpu(room);
  if (randomize) shuffle(room.seats);
  recolor(room); room.status = 'live'; room.cur = 0; room.starts_at = null; setClock(room, now);
}
/* what one member is allowed to see */
function view(room, picks, queue, uid, P, withPool) {
  const done = room.status === 'done', you = seatOf(room, uid);
  const out = {
    ok: true, now: NOW(),
    room: {
      id: room.id, code: room.mode === 'friends' ? room.code : null, mode: room.mode, preset: room.preset || null, status: room.status, settings: room.settings, rounds: rounds(room.settings),
      host: room.mode === 'friends' ? seatOf(room, room.host) : -1, cur: room.cur, deadline: ms(room.pick_deadline), pausedLeft: room.paused_left || null, pauseUntil: ms(room.pause_until), startsAt: ms(room.starts_at),
      seats: room.seats.map(s => s.k === 'o' ? { k: 'o' } : { k: s.k, name: s.name, color: s.color, auto: !!s.auto, left: !!s.left, strat: done && s.k === 'c' ? STRAT_NAME[s.strat] || null : undefined }),
      chat: room.mode === 'friends' ? (room.chat || []).slice(-60) : [], reacts: room.reacts || {}, results: done ? room.results || null : null,
    },
    you, picks: picks.map(p => [p.player_id, p.how]), queue: queue || [],
  };
  if (withPool && P) out.pool = P.list.map(o => [o.id, o.n, o.pos, o.t, o.bye, o.adp, o.ppg]);
  return out;
}
function summaryFor(room, P, g) {
  const seat = room.seats[g.seat], nm = id => (P.by[id] ? P.by[id].n : id);
  return { at: NOW(), mode: room.mode, teams: room.settings.teams, scoring: room.settings.scoring, rounds: rounds(room.settings), team: seat.name, grade: g.grade, rank: g.rank, pts: g.pts,
    best: g.best ? nm(g.best.id) : null, top: g.start.filter(x => x.id).slice(0, 4).map(x => nm(x.id)) };
}
async function finish(S, room, picks, P) {
  room.results = gradeRoom(room, picks, P);
  for (const s of humans(room)) { const g = room.results[seatOf(room, s.uid)]; if (g) await S.resultPut(s.uid, room, summaryFor(room, P, g)); }
}

/* ---------- the endpoint ---------- */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => res.status(code).json(obj);
  if (req.method !== 'POST') return send(405, { ok: false, code: 'method' });
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
  try {
    const user = await userOf(req);
    if (!user) throw new Fail('signin', 'Sign in to use mock drafts.', 401);
    const out = await run(String(body.action || ''), body, user);
    return send(200, out);
  } catch (err) {
    if (err instanceof Fail) return send(err.status, { ok: false, code: err.code, msg: err.message });
    console.error('draft', err); return send(500, { ok: false, code: 'server', msg: 'Something went wrong. Try again.' });
  }
}

async function run(action, body, user) {
  const now = NOW(), on = await storeOn();
  /* no tables yet: a solo draft travels with the request */
  let S, carried = false;
  if (on) S = _t.mem ? memStore(_t.mem) : sbStore();
  else {
    S = memStore(); carried = true;
    const c = body.carry;
    if (c && c.room && c.room.mode === 'solo' && c.room.host === user.id && Array.isArray(c.picks) && c.picks.length <= 400) {
      const room = { ...c.room, settings: cleanSettings(c.room.settings, 'solo') };
      if (Array.isArray(room.seats) && room.seats.length === room.settings.teams) {
        S.M.rooms.set(room.id, room); S.M.picks.set(room.id, c.picks.map((p, i) => ({ room_id: room.id, pick_no: i, seat: seatAt(i, room.settings.teams), player_id: String(p[0]), how: String(p[1] || 'user'), at: iso(now) })));
        S.M.queues.set(room.id + '|' + user.id, Array.isArray(c.queue) ? c.queue.slice(0, 60).map(String) : []);
      }
    }
  }
  const pack = async (room, extra) => {
    const picks = await S.picksGet(room.id), P = await poolFor(room.settings), q = await S.queueGet(room.id, user.id);
    const { pool: wantPool, ...rest } = extra || {};
    const v = view(room, picks, q, user.id, P, !!body.pool || !!wantPool);
    Object.assign(v, rest);
    if (carried) v.carry = { room, picks: picks.map(p => [p.player_id, p.how]), queue: q };
    return v;
  };
  const needStore = () => { if (!on) throw new Fail('store_off', 'Drafts with other people aren’t switched on yet. Solo drafts work now.', 503); };
  const load = async () => {
    const room = body.room ? await S.roomGet(String(body.room)) : null;
    if (!room) throw new Fail('no_room', 'That draft room no longer exists.', 404);
    return room;
  };
  const member = room => { const i = seatOf(room, user.id); if (i < 0) throw new Fail('not_member', 'You’re not in this draft room.', 403); return i; };
  /* loads a live room, repairs a room whose pick count ran ahead of its pointer, and makes every pick that is due */
  const sync = async room => {
    const picks = await S.picksGet(room.id), P = await poolFor(room.settings);
    let dirty = false;
    if ((room.status === 'live' || room.status === 'paused') && picks.length !== room.cur) { room.cur = picks.length; if (room.status === 'live') setClock(room, now); dirty = true; }
    const before = room.status, made = await advance(room, picks, P, uid => S.queueGet(room.id, uid), now);
    if (made.length) { if (!(await S.picksInsert(made))) return { room: await S.roomGet(room.id), made: [], raced: true }; dirty = true; }
    if (room.status !== before) dirty = true;
    if (room.status === 'done' && !room.results) { await finish(S, room, picks, P); dirty = true; }
    if (dirty) { await S.roomPatch(room.id, null, { v: room.v || 0, status: room.status, cur: room.cur, pick_deadline: room.pick_deadline, paused_left: room.paused_left || null, pause_until: room.pause_until || null, seats: room.seats, results: room.results || null, finished_at: room.finished_at || null }); room.v = (room.v || 0) + 1; if (made.length || room.status !== before) await S.ping(room.id); }
    return { room, made, picks, P };
  };
  const lobbyPatch = async (room, fn) => {                         // a lobby change, retried once if someone else changed the room first
    for (let i = 0; i < 3; i++) { const r = i ? await S.roomGet(room.id) : room; if (!r) throw new Fail('no_room', 'That draft room no longer exists.', 404); const patch = fn(r); if (await S.roomPatch(r.id, r.v || 0, patch)) { Object.assign(r, patch); r.v = (r.v || 0) + 1; await S.ping(r.id); return r; } }
    throw new Fail('busy', 'The room changed while you were doing that. Try again.', 409);
  };
  const baseRoom = (mode, settings, extra) => ({ id: randomUUID(), code: newCode(), mode, preset: null, host: user.id, status: 'lobby', settings, seats: [], members: [], cur: 0, pick_deadline: null, paused_left: null, pause_until: null, starts_at: null, ordered: false, chat: [], reacts: {}, results: null, v: 0, created_at: iso(now), updated_at: iso(now), finished_at: null, ...extra });

  switch (action) {
    /* ----- entry page ----- */
    case 'home': {
      const out = { ok: true, now, rooms: on, results: on ? (await S.resultsList(user.id)).map(r => ({ room: r.room_id, ...r.summary })) : null, solo: null, lobbies: [] };
      if (on) { const r = await S.soloOpen(user.id); if (r) out.solo = { room: r.id, cur: r.cur, total: total(r), teams: r.settings.teams }; out.lobbies = await lobbyList(S, now); }
      return out;
    }
    case 'lobbies': needStore(); return { ok: true, now, lobbies: await lobbyList(S, now) };
    case 'results': return { ok: true, now, results: on ? (await S.resultsList(user.id)).map(r => ({ room: r.room_id, ...r.summary })) : null };

    /* ----- create ----- */
    case 'create': {
      const mode = body.mode === 'friends' ? 'friends' : 'solo';
      if (!user.pro) throw new Fail('pro', 'Creating a mock draft is part of TradeMetric Pro.', 403);
      const settings = cleanSettings(body.settings, mode);
      if (mode === 'friends') needStore();
      if (limited('c|' + mode + '|' + user.id, mode === 'solo' ? 30 : 5, mode === 'solo' ? 864e5 : 3600e3) || (on && !_t.mem && await S.created(user.id, mode, iso(now - (mode === 'solo' ? 864e5 : 3600e3))) >= (mode === 'solo' ? 30 : 5)))
        throw new Fail('rate', mode === 'solo' ? 'That’s 30 solo drafts today. Come back tomorrow for more.' : 'You’ve made 5 rooms in the last hour. Try again a little later.', 429);
      const room = baseRoom(mode, settings), used = new Set();
      if (mode === 'solo') {
        if (on) { const old = await S.soloOpen(user.id); if (old) await S.roomPatch(old.id, null, { v: old.v || 0, status: 'done', pick_deadline: null }); }
        const slot = settings.slot ? settings.slot - 1 : Math.floor(rnd() * settings.teams);
        room.seats = Array.from({ length: settings.teams }, (_, i) => i === slot ? newSeat('h', user, i, used) : newSeat('c', null, i, used));
        room.members = [user.id]; room.status = 'live'; setClock(room, now);
        let ok = false; for (let i = 0; i < 4 && !ok; i++) { ok = await S.roomInsert(room); if (!ok) room.code = newCode(); }
        if (!ok) throw new Fail('store', 'Couldn’t start the draft. Try again.', 503);
        const r = await sync(room); return pack(r.room, { made: r.made.map(m => [m.player_id, m.how, m.delay]), pool: true });
      }
      room.seats = Array.from({ length: settings.teams }, (_, i) => i === 0 ? newSeat('h', user, 0, used) : { k: 'o' }); room.members = [user.id];
      let ok = false; for (let i = 0; i < 4 && !ok; i++) { ok = await S.roomInsert(room); if (!ok) room.code = newCode(); }
      if (!ok) throw new Fail('store', 'Couldn’t create the room. Try again.', 503);
      S.cleanup().catch(() => { });
      return pack(room, { pool: true });
    }

    /* ----- join ----- */
    case 'quick': case 'join': {
      needStore();
      let room = null;
      if (action === 'quick') { const L = await lobbyList(S, now, true); room = L.sort((a, b) => (ms(a.starts_at) || 9e15) - (ms(b.starts_at) || 9e15) || humans(b).length - humans(a).length)[0] || null; }
      else if (body.code) room = await S.roomByCode(clean(body.code, 12).toUpperCase());
      else if (body.room) { room = await S.roomGet(String(body.room)); if (room && room.mode === 'solo' && room.host !== user.id) room = null; }
      if (!room) throw new Fail('no_room', action === 'quick' ? 'No lobby is open right now. Try again in a moment.' : 'We couldn’t find that room. Check the code and try again.', 404);
      const mine = seatOf(room, user.id);
      if (mine >= 0) {                                             // coming back
        if (room.seats[mine].left || room.seats[mine].auto) { room.seats[mine].left = false; room.seats[mine].auto = false; room.seats[mine].miss = 0; await S.roomPatch(room.id, null, { v: room.v || 0, seats: room.seats }); await S.ping(room.id); }
        const r = room.status === 'lobby' ? { room } : await sync(room); return pack(r.room, { pool: true });
      }
      if (room.status !== 'lobby') throw new Fail('started', 'That draft has already started.', 409);
      room = await lobbyPatch(room, r => {
        const open = r.seats.map((s, k) => s.k === 'o' ? k : -1).filter(k => k >= 0); if (!open.length) throw new Fail('full', 'That room is full.', 409);
        const i = r.mode === 'public' ? open[Math.floor(rnd() * open.length)] : open[0];   // online: a random spot, which you can then change
        const seats = r.seats.slice(); seats[i] = newSeat('h', user, i, new Set());
        const patch = { seats, members: [...new Set([...(r.members || []), user.id])] };
        if (r.mode === 'public' && !r.starts_at) patch.starts_at = iso(now + LOBBY_MS);
        return patch;
      });
      return pack(room, { pool: true });
    }

    /* ----- lobby (friends) ----- */
    case 'settings': case 'order': case 'kick': case 'start': case 'cpu': {
      needStore(); let room = await load(); member(room);
      if (room.mode !== 'friends' || room.host !== user.id) throw new Fail('host', 'Only the host can do that.', 403);
      if (room.status !== 'lobby') throw new Fail('started', 'The draft has already started.', 409);
      if (action === 'start') {
        room = await lobbyPatch(room, r => { const c = { ...r, seats: r.seats.map(s => ({ ...s })) }; startRoom(c, now, body.random !== false && !r.ordered); return { seats: c.seats, status: c.status, cur: 0, pick_deadline: c.pick_deadline, starts_at: null }; });
        const r = await sync(room); return pack(r.room, { pool: true });
      }
      room = await lobbyPatch(room, r => {
        const seats = r.seats.map(s => ({ ...s }));
        if (action === 'settings') {
          const set = cleanSettings({ ...body.settings, slot: 0 }, 'friends'), hs = seats.filter(s => s.k === 'h');
          if (hs.length > set.teams) throw new Fail('too_small', 'There are more people in the room than that many teams.', 409);
          const keep = seats.filter(s => s.k !== 'o').slice(0, set.teams); while (keep.length < set.teams) keep.push({ k: 'o' });
          hs.forEach(h => { if (!keep.includes(h)) { const i = keep.findIndex(s => s.k !== 'h'); keep[i] = h; } });
          return { settings: set, seats: keep };
        }
        if (action === 'order') {
          if (body.random) { shuffle(seats); return { seats, ordered: false }; }
          const o = Array.isArray(body.order) ? body.order.map(Number) : []; if (o.length !== seats.length || new Set(o).size !== o.length || o.some(i => !(i >= 0 && i < seats.length))) throw new Fail('bad', 'That order doesn’t match the room.');
          return { seats: o.map(i => seats[i]), ordered: true };
        }
        const i = Math.round(+body.seat); if (!(i >= 0 && i < seats.length)) throw new Fail('bad', 'No such seat.');
        if (action === 'kick') { if (seats[i].k !== 'h' || seats[i].uid === user.id) throw new Fail('bad', 'You can’t remove that seat.'); const uid = seats[i].uid; seats[i] = { k: 'o' }; return { seats, members: (r.members || []).filter(x => x !== uid) }; }
        if (seats[i].k === 'o') seats[i] = newSeat('c', null, i, new Set(seats.map(s => s.name).filter(Boolean))); else if (seats[i].k === 'c') seats[i] = { k: 'o' };
        return { seats };
      });
      recolor(room); return pack(room, { pool: action === 'settings' });
    }
    /* ----- choosing where you draft from ----- */
    case 'seat': {                                                 // online lobby: move to an open spot
      needStore(); let room = await load(); member(room);
      if (room.mode !== 'public') throw new Fail('bad', 'The host sets the draft order in this room.');
      if (room.status !== 'lobby') throw new Fail('started', 'The draft has already started.', 409);
      room = await lobbyPatch(room, r => {
        const seats = r.seats.map(s => ({ ...s })), i = seatOf(r, user.id), to = Math.round(+body.seat);
        if (i < 0) throw new Fail('not_member', 'You’re not in this draft room.', 403);
        if (to === i) return { seats };
        if (!(to >= 0 && to < seats.length) || seats[to].k !== 'o') throw new Fail('taken', 'That spot was just taken. Pick another.', 409);
        seats[to] = seats[i]; seats[i] = { k: 'o' }; return { seats };
      });
      recolor(room); return pack(room);
    }
    case 'slot': {                                                 // solo: change your draft spot before your first pick; the draft restarts from pick 1
      const room = await load(), i = member(room); if (room.mode !== 'solo') throw new Fail('bad', 'Only solo drafts can change spot this way.');
      if (room.status !== 'live' && room.status !== 'paused') throw new Fail('not_live', 'This draft isn’t running.', 409);
      const to = Math.round(+body.slot) - 1; if (!(to >= 0 && to < room.seats.length)) throw new Fail('bad', 'No such draft spot.');
      const picks = await S.picksGet(room.id);
      if (picks.some(p => p.seat === i && p.how === 'user')) throw new Fail('late', 'You’ve already made a pick. Start a new draft to change your spot.', 409);
      if (to === i && !picks.some(p => p.seat === i)) return pack(room);
      const me = room.seats[i]; room.seats[i] = room.seats[to]; room.seats[to] = me; me.miss = 0; me.auto = false; recolor(room);
      await S.picksDeleteFrom(room.id, 0); room.cur = 0; room.status = 'live'; room.paused_left = null; setClock(room, now);
      await S.roomPatch(room.id, null, { v: room.v || 0, status: 'live', cur: 0, pick_deadline: room.pick_deadline, paused_left: null, seats: room.seats }); room.v = (room.v || 0) + 1;
      const r = await sync(room); return pack(r.room, { made: r.made.map(m => [m.player_id, m.how, m.delay]) });
    }
    case 'rename': {
      needStore(); let room = await load(); const i = member(room);
      if (room.mode !== 'friends') throw new Fail('bad', 'Team names can’t be changed in this room.');
      const name = clean(body.name, 24); if (name.length < 2) throw new Fail('bad', 'Team names need at least 2 characters.');
      if (room.status === 'lobby') room = await lobbyPatch(room, r => { const seats = r.seats.map(s => ({ ...s })); const j = seatOf(r, user.id); if (j >= 0) seats[j].name = name; return { seats }; });
      else { room.seats[i].name = name; await S.roomPatch(room.id, null, { v: room.v || 0, seats: room.seats }); await S.ping(room.id); }
      return pack(room);
    }

    /* ----- in the draft ----- */
    case 'state': {
      const room = await load();
      if (room.status === 'done' && room.mode !== 'solo' && (room.members || []).includes(user.id)) return pack(room);
      member(room);
      if (room.status === 'lobby') { const r = await lobbyTick(S, room, now, sync); return pack(r); }
      const r = await sync(room); return pack(r.room, { made: r.made.map(m => [m.player_id, m.how, m.delay]) });
    }
    case 'tick': {
      const room = await load(); member(room);
      if (room.status === 'lobby') { const r = await lobbyTick(S, room, now, sync); return pack(r); }
      const r = await sync(room); return pack(r.room, { made: r.made.map(m => [m.player_id, m.how, m.delay]) });
    }
    case 'pick': {
      const room = await load(), i = member(room), P = await poolFor(room.settings), picks = await S.picksGet(room.id), id = String(body.player || '');
      if (room.status === 'paused') throw new Fail('paused', 'The draft is paused.', 409);
      if (room.status !== 'live') throw new Fail('not_live', 'This draft isn’t running.', 409);
      if (picks.length !== room.cur) { const r = await sync(room); return pack(r.room, { code: 'stale' }); }
      if (seatAt(room.cur, room.settings.teams) !== i) throw new Fail('turn', 'It isn’t your pick yet.', 409);
      const o = P.by[id]; if (!o) throw new Fail('bad', 'We don’t know that player.');
      if (picks.some(p => p.player_id === id)) throw new Fail('taken', `${o.n} has already been drafted.`, 409);
      if (!legalFor(countsOf(seatIds(picks, i), P), o.pos, room.settings.roster)) throw new Fail('roster', `You have no roster spot left for another ${o.pos === 'DST' ? 'defense' : o.pos}.`, 409);
      const row = { room_id: room.id, pick_no: room.cur, seat: i, player_id: id, how: 'user', at: iso(now) };
      if (!(await S.picksInsert([row]))) throw new Fail('taken', 'That pick was just made. The board has been updated.', 409);
      room.cur++; room.seats[i].miss = 0; room.seats[i].auto = false; setClock(room, now);
      const q = await S.queueGet(room.id, user.id); if (q.includes(id)) await S.queueSet(room.id, user.id, q.filter(x => x !== id));
      await S.roomPatch(room.id, null, { v: room.v || 0, status: room.status, cur: room.cur, pick_deadline: room.pick_deadline, seats: room.seats, finished_at: room.finished_at || null }); room.v = (room.v || 0) + 1;
      const r = await sync(room); if (!r.made.length) await S.ping(room.id);
      return pack(r.room, { made: r.made.map(m => [m.player_id, m.how, m.delay]) });
    }
    case 'queue': {
      const room = await load(); member(room); const P = await poolFor(room.settings);
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter(x => P.by[x]).slice(0, 60);
      await S.queueSet(room.id, user.id, ids); return pack(room);
    }
    case 'back': {
      const room = await load(), i = member(room); room.seats[i].auto = false; room.seats[i].left = false; room.seats[i].miss = 0;
      await S.roomPatch(room.id, null, { v: room.v || 0, seats: room.seats }); await S.ping(room.id); const r = await sync(room); return pack(r.room);
    }
    case 'pause': case 'resume': {
      const room = await load(); member(room);
      if (room.mode === 'public' || (room.mode === 'friends' && room.host !== user.id)) throw new Fail('host', 'Only the host can pause.', 403);
      if (action === 'pause' && room.status === 'live') { const dl = ms(room.pick_deadline); room.status = 'paused'; room.paused_left = dl == null ? null : Math.max(1000, dl - now); room.pick_deadline = null; room.pause_until = room.mode === 'friends' ? iso(now + PAUSE_MAX_MS) : null; }
      else if (action === 'resume' && room.status === 'paused') { room.status = 'live'; room.pick_deadline = room.paused_left != null ? iso(now + room.paused_left) : null; room.paused_left = null; room.pause_until = null; if (room.pick_deadline == null) setClock(room, now); }
      await S.roomPatch(room.id, null, { v: room.v || 0, status: room.status, pick_deadline: room.pick_deadline, paused_left: room.paused_left, pause_until: room.pause_until }); await S.ping(room.id);
      return pack(room);
    }
    case 'undo': {
      const room = await load(), i = member(room); if (room.mode !== 'solo') throw new Fail('bad', 'Undo is only for solo drafts.');
      const picks = await S.picksGet(room.id); let k = -1; for (let j = picks.length - 1; j >= 0; j--) if (picks[j].seat === i && picks[j].how === 'user') { k = j; break; }
      if (k < 0) throw new Fail('bad', 'There’s nothing to undo yet.');
      await S.picksDeleteFrom(room.id, k); room.cur = k; room.status = 'live'; room.results = null; room.finished_at = null; room.paused_left = null; room.seats[i].miss = 0; room.seats[i].auto = false; setClock(room, now);
      await S.roomPatch(room.id, null, { v: room.v || 0, status: 'live', cur: k, pick_deadline: room.pick_deadline, paused_left: null, results: null, finished_at: null, seats: room.seats }); room.v = (room.v || 0) + 1;
      return pack(room);
    }
    case 'abandon': {
      const room = await load(); member(room); if (room.mode !== 'solo') throw new Fail('bad', 'Only solo drafts can be discarded.');
      await S.roomDelete(room.id); return { ok: true, now, gone: true, carry: carried ? null : undefined };
    }
    case 'leave': {
      needStore(); let room = await load(); const i = member(room);
      if (room.status === 'lobby') {
        room = await lobbyPatch(room, r => {
          const seats = r.seats.map(s => ({ ...s })), j = seatOf(r, user.id); if (j >= 0) seats[j] = { k: 'o' };
          const members = (r.members || []).filter(x => x !== user.id), patch = { seats, members };
          if (r.mode === 'friends' && r.host === user.id) { const nx = seats.find(s => s.k === 'h'); if (nx) patch.host = nx.uid; }
          if (r.mode === 'public' && !seats.some(s => s.k === 'h')) patch.starts_at = null;
          return patch;
        });
        return { ok: true, now, gone: true };
      }
      if (room.status === 'done') return { ok: true, now, gone: true };
      room.seats[i].left = true; room.seats[i].auto = true;
      const patch = { v: room.v || 0, seats: room.seats };
      if (room.mode === 'friends' && room.host === user.id) { const nx = here(room)[0]; if (nx) { room.host = nx.uid; patch.host = nx.uid; } }
      /* nobody left: finish on autopick right away so it is saved for everyone */
      if (!here(room).length) { room.settings = { ...room.settings, speed: 'instant' }; patch.settings = room.settings; if (room.status === 'paused') { room.status = 'live'; patch.status = 'live'; patch.pause_until = null; patch.paused_left = null; } room.pick_deadline = iso(now); patch.pick_deadline = room.pick_deadline; }
      await S.roomPatch(room.id, null, patch); room.v = (room.v || 0) + 1; await S.ping(room.id);
      await sync(room); return { ok: true, now, gone: true };
    }
    case 'chat': {
      needStore(); const room = await load(), i = member(room); if (room.mode !== 'friends') throw new Fail('bad', 'This room has no chat.');
      const text = clean(body.text, 200); if (!text) throw new Fail('bad', 'Say something first.');
      if (limited('chat|' + user.id, 8, 20e3)) throw new Fail('rate', 'Slow down a little.', 429);
      const fresh = await S.roomGet(room.id), chat = [...((fresh && fresh.chat) || []), { s: i, t: text, at: now }].slice(-60);
      await S.roomPatch(room.id, null, { v: (fresh && fresh.v) || 0, chat }); await S.ping(room.id); return { ok: true, now, chat };
    }
    case 'react': {
      needStore(); const room = await load(); member(room); const em = String(body.emoji || ''), k = Math.round(+body.pick);
      if (!EMOJI.includes(em) || !(k >= 0 && k < room.cur)) throw new Fail('bad', 'Can’t react to that.');
      if (limited('react|' + user.id, 12, 20e3)) throw new Fail('rate', 'Slow down a little.', 429);
      const fresh = await S.roomGet(room.id), reacts = { ...((fresh && fresh.reacts) || {}) }, cur = { ...(reacts[k] || {}) }; cur[em] = Math.min(99, (cur[em] || 0) + 1); reacts[k] = cur;
      const keys = Object.keys(reacts).map(Number).sort((a, b) => a - b); while (keys.length > 40) delete reacts[keys.shift()];
      await S.roomPatch(room.id, null, { v: (fresh && fresh.v) || 0, reacts }); await S.ping(room.id); return { ok: true, now, reacts };
    }
    case 'result': {
      const room = await load(); if (!(room.members || []).includes(user.id)) throw new Fail('not_member', 'That draft isn’t on your account.', 403);
      return pack(room, { pool: true });
    }
    default: throw new Fail('bad', 'Unknown action.');
  }
}

/* public lobbies: one open lobby per preset, made on demand */
async function lobbyList(S, now, raw) {
  let L = await S.lobbies();
  for (const p of PRESETS) {
    if (L.some(r => r.preset === p.key)) continue;
    const set = cleanSettings({ ...p.settings, clock: 60, speed: 'fast' }, 'public');
    const room = { id: randomUUID(), code: newCode(), mode: 'public', preset: p.key, host: null, status: 'lobby', settings: set, seats: Array.from({ length: set.teams }, () => ({ k: 'o' })), members: [], cur: 0, pick_deadline: null, paused_left: null, pause_until: null, starts_at: null, chat: [], reacts: {}, results: null, v: 0, created_at: iso(now), updated_at: iso(now), finished_at: null };
    if (await S.roomInsert(room)) L.push(room); else L = await S.lobbies();
  }
  L = L.filter(r => PRESETS.some(p => p.key === r.preset));
  if (raw) return L;
  return PRESETS.map(p => { const r = L.find(x => x.preset === p.key); return r ? { room: r.id, preset: p.key, name: p.name, teams: r.settings.teams, clock: r.settings.clock, filled: humans(r).length, startsAt: ms(r.starts_at), seats: r.seats.filter(s => s.k === 'h').map(s => ({ name: s.name, color: s.color })) } : null; }).filter(Boolean);
}
/* a public lobby whose countdown has run out starts, with CPU teams in the empty seats */
async function lobbyTick(S, room, now, sync) {
  if (room.mode !== 'public' || !room.starts_at || now < ms(room.starts_at)) return room;
  const c = { ...room, seats: room.seats.map(s => ({ ...s })) }; startRoom(c, now, false);   // people chose their spots in the lobby
  if (!(await S.roomPatch(room.id, room.v || 0, { seats: c.seats, status: 'live', cur: 0, pick_deadline: c.pick_deadline, starts_at: null }))) return (await S.roomGet(room.id)) || room;
  c.v = (room.v || 0) + 1; await S.ping(room.id);
  const r = await sync(c); return r.room;
}

/* for scripts/test-mockdraft.mjs */
export const _engine = { poolFor, cleanSettings, cpuPick, advance, gradeRoom, fit, countsOf, seatAt, rounds, lineupOf, legalFor, setClock, startRoom, memStore, STRATS, PRESETS, DEF_ROSTER };
