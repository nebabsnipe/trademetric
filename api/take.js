// The "TradeMetric take": 2-3 plain sentences on a player's outlook for next season plus a role outlook tag
// (growing / steady / threatened), written by Claude from his numbers and recent reports. Pro only.
//
// POST /api/take   Authorization: Bearer <Supabase access token>
//   body {id, rank, posRank, cRank, mRank, tag, grade, g, ppg, xfpg, xfpgP, wopr, woprP}
//   -> {ok:true, take, outlook, updated, reports}
//
// Only generated when someone opens a player's panel. One take per player is kept on the server:
//   - in memory on the warm server instance, and
//   - in the Supabase table player_takes (supabase/takes.sql) when SUPABASE_SERVICE_ROLE_KEY is set,
//     so it survives restarts. The table is also where the role outlook is stored for the opportunity model.
// A stored take is reused until new stories about the player come in (checked at most every 6 hours),
// or it is 7 days old.
//
// The stories come from the same outlets as api/news.js. Outlet and site names never go into the take.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { API_KEY, ESPN_TEAM, collect, getText, parseRSS, parseESPN, norm, similar, moveOf, FLUFF, RUMOR, askClaude, lastErr, cleanLine } from './news.js';

/* BETA: keep in step with TMO_BETA_PRO in js/offseason.js. While true every signed-in account counts as Pro. */
const BETA_PRO = true;
const SUPA_URL = process.env.SUPABASE_URL || 'https://rltmfnmgbfgecbaevfvc.supabase.co';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_AFX79aKgqorAx3zgOyKatw_o_3_ERWG';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RECHECK_MS = 6 * 3600e3;      // look for new stories at most this often per player
const MAX_AGE_MS = 7 * 864e5;       // rewrite a take after a week even with no new stories
const PER_USER_PER_HOUR = 60;       // new takes one account can trigger per hour
const OUTLOOKS = ['growing', 'steady', 'threatened'];
const POS = ['QB', 'RB', 'WR', 'TE'];

const TEAM_NAME = { ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans', IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LV: 'Raiders', LAC: 'Chargers', LAR: 'Rams', MIA: 'Dolphins', MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SF: '49ers', SEA: 'Seahawks', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders' };
const POS_WORD = { QB: 'quarterback', RB: 'running back', WR: 'wide receiver', TE: 'tight end' };
const POS_RE = { QB: /\b(quarterbacks?|qbs?)\b/i, RB: /\b(running backs?|rbs?|backfield)\b/i, WR: /\b(wide receivers?|receivers?|wideouts?|wrs?)\b/i, TE: /\b(tight ends?|tes?)\b/i };
/* Names that must never appear in a take: outlets, other fantasy sites and data sources. */
const BANNED = /\b(espn|cbs( sports)?|yahoo|nbc( sports)?|profootballtalk|pro football talk|pft|rotoballer|pro football network|pfn|the athletic|nfl trade rumors|google news|fantasypros|fantasy pros|fantasycalc|keeptradecut|ktc|sleeper|underdog|pff|pro football focus|draft sharks|rotowire|rotoworld|the ringer|bleacher report|nfl network|nfl\.com|fox sports|sports illustrated|si\.com|usa today|sharp football|4for4|footballguys|next gen stats|consensus rankings?)\b/i;

/* ---------- who is asking ---------- */
const users = new Map();
async function userOf(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); if (!m) return null;
  const tok = m[1].trim(); if (tok.length < 20 || tok.length > 4000) return null;
  const c = users.get(tok); if (c && Date.now() - c.at < 5 * 60e3) return c.v;
  let v = null;
  try {
    const r = await fetch(SUPA_URL + '/auth/v1/user', { headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + tok } });
    if (r.ok) {
      const u = await r.json();
      if (u && u.id) {
        v = { id: u.id, pro: BETA_PRO };
        if (!BETA_PRO) {
          const p = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${u.id}&select=plan`, { headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + tok } });
          const rows = p.ok ? await p.json() : []; v.pro = !!(rows[0] && rows[0].plan && rows[0].plan !== 'free');
        }
      }
    }
  } catch { return null; }
  if (users.size > 2000) users.clear();
  users.set(tok, { at: Date.now(), v }); return v;
}
const hits = new Map();
function limited(uid) {
  const now = Date.now(), list = (hits.get(uid) || []).filter(t => now - t < 3600e3);
  if (list.length >= PER_USER_PER_HOUR) { hits.set(uid, list); return true; }
  list.push(now); hits.set(uid, list); return false;
}

/* ---------- the player list (so names, teams and positions come from our own data, not the request) ---------- */
let ROSTER = null, ROSTER_AT = 0;
async function roster(req) {
  if (ROSTER && Date.now() - ROSTER_AT < 30 * 60e3) return ROSTER;
  let d = null;
  try { d = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'nfl.json'), 'utf8')); } catch { }
  if (!d) {
    try { const host = req.headers['x-forwarded-host'] || req.headers.host; const r = await fetch(`https://${host}/data/nfl.json`); if (r.ok) d = await r.json(); } catch { }
  }
  if (!d || !Array.isArray(d.players)) return ROSTER;
  const m = new Map(); const dyn = d.dyn || {};
  for (const p of d.players) if (POS.includes(p[2])) m.set(p[0], { n: p[1], pos: p[2], t: p[3] || '', age: dyn[p[0]] ? dyn[p[0]][2] : null });
  ROSTER = m; ROSTER_AT = Date.now(); return m;
}

/* ---------- storage ---------- */
const mem = new Map();
const svc = () => ({ apikey: SUPA_SERVICE, Authorization: 'Bearer ' + SUPA_SERVICE, 'content-type': 'application/json' });
async function dbGet(id) {
  if (!SUPA_SERVICE) return null;
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/player_takes?player_id=eq.${encodeURIComponent(id)}&select=*`, { headers: svc() });
    if (!r.ok) return null; const x = (await r.json())[0]; if (!x) return null;
    return { take: x.take, outlook: x.outlook, sig: x.sig, reports: x.reports || 0, made: Date.parse(x.updated_at), checked: Date.parse(x.checked_at) };
  } catch { return null; }
}
async function dbPut(id, p, v) {
  if (!SUPA_SERVICE) return;
  try {
    await fetch(`${SUPA_URL}/rest/v1/player_takes?on_conflict=player_id`, {
      method: 'POST', headers: { ...svc(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ player_id: id, name: p.n, team: p.t, pos: p.pos, take: v.take, outlook: v.outlook, sig: v.sig, reports: v.reports, updated_at: new Date(v.made).toISOString(), checked_at: new Date(v.checked).toISOString() }),
    });
  } catch { }
}

/* ---------- reports ---------- */
/* Moves at his position on his team that don't name him (a signing, a trade, a release). */
async function teamMoves(p) {
  const nick = TEAM_NAME[p.t]; if (!nick) return [];
  const srcs = [
    ...(ESPN_TEAM[p.t] ? [{ kind: 'espn', src: 'ESPN', url: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team=${ESPN_TEAM[p.t]}&limit=50` }] : []),
    { kind: 'rss', src: 'Google News', url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${nick}" "${POS_WORD[p.pos]}" (signs OR signed OR drafted OR trade OR acquire OR released) when:30d`)}&hl=en-US&gl=US&ceid=US:en` },
  ];
  const got = await Promise.all(srcs.map(async s => { try { const txt = await getText(s.url, 20 * 60e3); return s.kind === 'espn' ? parseESPN(txt) : parseRSS(txt, s.src); } catch { return []; } }));
  const cutoff = Date.now() - 45 * 864e5, me = ' ' + norm(p.n) + ' ', out = [];
  for (const i of got.flat()) {
    if (!i.title || (i.at && Date.parse(i.at) < cutoff) || FLUFF.test(i.title) || RUMOR.test(i.title)) continue;
    const head = i.title + ' ' + String(i.desc || '').slice(0, 300);
    if (!new RegExp('\\b' + nick + '\\b', 'i').test(head) || !POS_RE[p.pos].test(head)) continue;
    const k = moveOf(i.title) || moveOf(String(i.desc || '').slice(0, 260)); if (k !== 'trade' && k !== 'move') continue;
    if ((' ' + norm(head) + ' ').includes(me)) continue;            // stories that name him come from collect()
    if (out.some(o => similar(o.title, i.title, new Set()))) continue;
    out.push(i);
  }
  return out.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 4);
}
async function reports(p) {
  const [own, team] = await Promise.all([
    collect(p.n, p.t, false, false, 'outlook', 30).then(x => x.items.filter(i => !FLUFF.test(i.title)).slice(0, 6)).catch(() => []),
    teamMoves(p).catch(() => []),
  ]);
  const list = [...own.map(i => ({ ...i, about: 'him' })), ...team.map(i => ({ ...i, about: 'team' }))];
  const sig = createHash('sha1').update(list.map(i => norm(i.title)).sort().join('|') || 'none').digest('hex').slice(0, 16);
  return { list, sig };
}

/* ---------- writing the take ---------- */
const num = (v, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; };
const ord = n => { n = Math.round(n); const t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
function statLines(p, b) {
  const L = [], rank = num(b.rank, 1, 400), posRank = num(b.posRank, 1, 150), cRank = num(b.cRank, 1, 400), mRank = num(b.mRank, 1, 400);
  const g = num(b.g, 0, 20), ppg = num(b.ppg, 0, 45), xfpg = num(b.xfpg, 0, 45), xP = num(b.xfpgP, 0, 1), wopr = num(b.wopr, 0, 1.5), wP = num(b.woprP, 0, 1);
  if (rank) L.push(`TradeMetric rank: ${rank} overall${posRank ? `, ${p.pos}${posRank}` : ''}`);
  if (cRank) L.push(`Expert rank: ${cRank} overall`);
  if (mRank) L.push(`Market rank (where drafters take him): ${mRank} overall`);
  if (b.tag === 'sleeper') L.push('TradeMetric flags him as a sleeper: ranked well above the market'); else if (b.tag === 'bust') L.push('TradeMetric flags him as a bust risk: ranked well below the market');
  if (/^[A-F]\+?$/.test(b.grade || '')) L.push(`Opportunity grade at his position: ${b.grade}`);
  if (g != null) L.push(`Games this season: ${g}${ppg != null && g ? `, ${ppg.toFixed(1)} half-PPR points per game` : ''}`);
  if (xfpg != null) L.push(`Expected points per game from his workload: ${xfpg.toFixed(1)}${xP != null ? ` (${ord(xP * 100)} percentile at ${p.pos})` : ''}`);
  if (p.pos !== 'QB' && wopr != null) L.push(`Receiving role (WOPR, his share of the team's targets and air yards): ${wopr.toFixed(2)}${wP != null ? ` (${ord(wP * 100)} percentile at ${p.pos})` : ''}`);
  if (p.age != null) L.push(`Age next season: ${Math.floor(p.age + 1)}`);
  return L;
}
function parseObj(text) {
  try { return JSON.parse(text); } catch { }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { } }
  return null;
}
/* Drop any sentence that names an outlet or another site. */
function clean(take) {
  const parts = cleanLine(take, 520).replace(/\s*[\u2014\u2013]\s*/g, ', ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  return parts.map(s => s.trim()).filter(s => s && !BANNED.test(s)).join(' ');
}
async function write(p, body, list) {
  const stats = statLines(p, body);
  const reps = list.map((x, i) => `[${i + 1}] ${x.about === 'team' ? `About the ${TEAM_NAME[p.t] || 'team'}'s ${POS_WORD[p.pos]}s` : 'About him'}, ${x.at ? x.at.slice(0, 10) : 'date unknown'}\nHeadline: ${x.title}\nText: ${String(x.desc || '(headline only)').slice(0, 700)}`).join('\n\n');
  const prompt = `You write the "TradeMetric take" on a fantasy football rankings page: a short read on one player's outlook for NEXT season's redraft drafts (half-PPR). Today is ${new Date().toISOString().slice(0, 10)}.

Player: ${p.n} (${p.pos}, ${TEAM_NAME[p.t] || p.t || 'free agent'})

His numbers:
${stats.map(s => '- ' + s).join('\n') || '- (none)'}

Recent reports${list.length ? '' : ': none found'}
${reps}

Write:
- "take": 2 or 3 plain sentences, 60 words at most in total. Say what matters most for his value next season: his role and workload, anything the reports say about how his team plans to use him, and any signing, trade or draft pick at his position that helps or hurts him. If there are no useful reports, write from his numbers and age alone and do not mention reports at all.
- "outlook": his role outlook for next season, exactly one of "growing", "steady" or "threatened".
  growing = the facts point to a bigger role (more work late in the season, a starter ahead of him leaving, the coach saying he will be used more).
  threatened = the facts point to a smaller role (the team added or plans to add competition at his position, the coach talks about a committee or a reduced role, he lost snaps, or he is past the usual peak age for his position with a falling workload).
  steady = anything else, including when there is nothing clear either way.

Rules:
- Use only the facts above. Do not add stats, injuries, contracts, quotes or transactions that are not given.
- Plain words a casual fan understands. No jargon, no hype, no "it remains to be seen". Do not use dashes.
- Never name a website, news outlet, reporter, app or data source, and never say "reports say" with a source attached. Say "his coach said" or "the team signed" instead.
- Never mention formulas, weights, percentages of a score or how rankings are calculated. Do not repeat the rank numbers as a list.
- Do not give draft-round advice or guarantees.

Reply with only JSON: {"take":"...","outlook":"growing|steady|threatened"}`;
  const text = await askClaude(prompt, 400, 20000); if (!text) return null;
  const j = parseObj(text); if (!j || typeof j.take !== 'string') return null;
  const take = clean(j.take), outlook = OUTLOOKS.includes(String(j.outlook).toLowerCase()) ? String(j.outlook).toLowerCase() : 'steady';
  return take.length >= 40 ? { take, outlook } : null;
}

const inflight = new Map();
async function takeFor(id, p, body, uid) {
  const now = Date.now();
  let c = mem.get(id) || await dbGet(id);
  if (c) mem.set(id, c);
  const fresh = c && now - c.made < MAX_AGE_MS;
  if (fresh && now - c.checked < RECHECK_MS) return c;
  if (inflight.has(id)) return inflight.get(id);
  const job = (async () => {
    const { list, sig } = await reports(p);
    if (fresh && c.sig === sig) { c.checked = now; mem.set(id, c); dbPut(id, p, c); return c; }   // no new stories
    if (limited(uid)) return c || { error: 'rate' };
    const w = await write(p, body, list);
    if (!w) return c || { error: 'ai' };                                                            // keep the old take if the rewrite fails
    const v = { take: w.take, outlook: w.outlook, sig, reports: list.length, made: now, checked: now };
    mem.set(id, v); if (mem.size > 800) [...mem.keys()].slice(0, 200).forEach(k => mem.delete(k));
    await dbPut(id, p, v); return v;
  })().finally(() => inflight.delete(id));
  inflight.set(id, job); return job;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, code: 'method' });
  const user = await userOf(req);
  if (!user) return res.status(401).json({ ok: false, code: 'signin' });
  if (!user.pro) return res.status(403).json({ ok: false, code: 'pro' });
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const id = String(body.id || '').slice(0, 80); if (!/^[a-z0-9-]+$/.test(id)) return res.status(400).json({ ok: false, code: 'bad_id' });
  const R = await roster(req);
  let p = R ? R.get(id) : null;
  if (R && !p) return res.status(404).json({ ok: false, code: 'unknown_player' });
  if (!p) {   // player file unreachable: fall back to the request, letters only
    const pos = String(body.pos || ''), n = String(body.n || '').replace(/[^A-Za-z .'-]/g, '').slice(0, 40).trim();
    if (!POS.includes(pos) || n.length < 3) return res.status(503).json({ ok: false, code: 'no_data' });
    p = { n, pos, t: TEAM_NAME[String(body.t || '')] ? String(body.t) : '', age: num(body.age, 18, 50) };
  }
  if (!API_KEY && !mem.has(id) && !SUPA_SERVICE) return res.status(200).json({ ok: false, code: 'ai_off' });
  const v = await takeFor(id, p, body, user.id);
  if (!v || v.error) return res.status(200).json({ ok: false, code: v && v.error === 'rate' ? 'rate' : API_KEY ? 'ai' : 'ai_off', err: v && v.error === 'ai' ? lastErr() : undefined });
  return res.status(200).json({ ok: true, take: v.take, outlook: v.outlook, updated: new Date(v.made).toISOString(), reports: v.reports });
}

export const config = { maxDuration: 60 };
