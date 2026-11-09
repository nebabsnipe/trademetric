// Play-by-play for the News tab and big-play banners.
// Reads ESPN's game summary for every game that has kicked off this week and keeps only the plays
// that could ever trigger a banner: touchdowns and runs or catches of 20+ yards. The page decides
// which of those count (30+ yard run, 40+ yard catch, and so on) and whose they are.
// Cached at Vercel's edge, so every visitor shares one fetch per window.
// If ESPN changes shape or is unreachable this returns ok:false and the page falls back to
// comparing live stat totals between checks.

const TEAM = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' };
const fix = t => TEAM[t] || t;
const MIN_YDS = 20;

async function j(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TradeMetric/1.0' } });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

// "J.Gibbs", "A.St. Brown", "Ja.Chase" (gamebook style) or "Jahmyr Gibbs" (scoring summary style)
const NM = "[A-Z][A-Za-z'\\-]*\\.\\s?[A-Z][A-Za-z'\\-\\.]*(?:\\s(?:St\\.|Jr\\.|II|III|IV|[A-Z][A-Za-z'\\-]+))*?";
const FULL = "[A-Z][A-Za-z'\\-\\.]+(?:\\s[A-Z][A-Za-z'\\-\\.]+){1,3}?";
const RE = {
  pass: new RegExp(`(${NM})\\s+pass\\s+(?:[a-z]+\\s+){0,3}to\\s+(${NM})(?=\\s+(?:to|for|pushed|ran|is|was|at)\\b|\\s*\\(|,|\\s*$)`),
  rush: new RegExp(`^(?:\\([^)]*\\)\\s*)*(?:\\d+-)?(${NM})\\s+(?:up the middle|left|right|scrambles|rushes|rush|kneels)`),
  sumPass: new RegExp(`^(${FULL})\\s+(\\d+)\\s+Yd\\s+pass\\s+from\\s+(${FULL})`, 'i'),
  sumRush: new RegExp(`^(${FULL})\\s+(\\d+)\\s+Yd\\s+(?:Run|Rush)`, 'i'),
};

function parse(txt) {
  const t = String(txt || '').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = t.match(RE.sumPass))) return { kind: 'pass', rec: m[1], qb: m[3], yds: +m[2] };
  if ((m = t.match(RE.sumRush))) return { kind: 'rush', ball: m[1], yds: +m[2] };
  if ((m = t.match(RE.pass))) return { kind: 'pass', qb: m[1], rec: m[2] };
  if ((m = t.match(RE.rush))) return { kind: 'rush', ball: m[1] };
  return null;
}

function plays(sum, ev) {
  const out = [];
  const comp = sum && sum.header && sum.header.competitions && sum.header.competitions[0];
  const idTeam = {};
  for (const c of (comp && comp.competitors) || []) if (c.team) idTeam[c.team.id] = fix(c.team.abbreviation);
  const drives = [...((sum.drives && sum.drives.previous) || [])];
  if (sum.drives && sum.drives.current && !drives.some(d => d.id === sum.drives.current.id)) drives.push(sum.drives.current);
  for (const d of drives) {
    const off = fix((d.team && d.team.abbreviation) || '');
    for (const p of d.plays || []) {
      const type = (p.type && p.type.text) || '';
      const text = String(p.text || '');
      if (/no play|nullified|penalty on/i.test(text) && !/touchdown/i.test(text)) continue;
      if (!/rush|pass reception|passing touchdown|rushing touchdown/i.test(type)) continue;
      const td = /touchdown/i.test(type) || /touchdown/i.test(text);
      const info = parse(text);
      if (!info) continue;
      const yds = Number.isFinite(+p.statYardage) ? +p.statYardage : (info.yds || 0);
      if (!td && yds < MIN_YDS) continue;
      const startTeam = p.start && p.start.team && idTeam[p.start.team.id];
      out.push({
        id: String(p.id || `${ev}-${p.sequenceNumber}`), ev, t: startTeam || off,
        q: (p.period && p.period.number) || 0, clk: (p.clock && p.clock.displayValue) || '',
        kind: info.kind, ball: info.ball || null, rec: info.rec || null, qb: info.qb || null,
        yds, td, txt: text.slice(0, 220), at: p.wallclock || null,
      });
    }
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const state = await j('https://api.sleeper.app/v1/state/nfl');
    const season = +state.season;
    let week = parseInt((req.query && req.query.week) || state.week, 10);
    if (!(week >= 1 && week <= 18)) week = state.week;
    const board = await j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`);
    const events = (board.events || []).filter(e => e.status && e.status.type && e.status.type.state !== 'pre');
    const all = [], games = {};
    await Promise.all(events.map(async e => {
      try {
        const sum = await j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${e.id}`);
        all.push(...plays(sum, e.id));
        games[e.id] = e.status.type.state;
      } catch {}
    }));
    const live = Object.values(games).some(s => s === 'in');
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${live ? 60 : 300}`);
    return res.status(200).json({ ok: events.length === 0 || Object.keys(games).length > 0, season, week, live, updated: new Date().toISOString(), games, plays: all });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json({ ok: false, plays: [] });
  }
}

export { parse };
