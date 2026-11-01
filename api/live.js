// Live game-day data: scores and game clocks (ESPN), player stats so far (Sleeper)
// and the latest injury designations (Sleeper). Cached at Vercel's edge so every
// visitor shares one fetch: 2 minutes while games are on, 10 minutes otherwise.

const TEAM = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' };
const fix = t => TEAM[t] || t;
const INJ = { Questionable: 'Q', Doubtful: 'D', Out: 'O', IR: 'IR', PUP: 'PUP', Sus: 'SUS', NA: 'O', DNR: '' };

async function j(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'TradeMetric/1.0' } });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

let injCache = { at: 0, data: null };
async function injuries() {
  if (injCache.data && Date.now() - injCache.at < 10 * 60e3) return injCache.data;
  const all = await j('https://api.sleeper.app/v1/players/nfl');
  const out = [];
  for (const p of Object.values(all)) {
    if (!['QB', 'RB', 'WR', 'TE'].includes(p.position) || !p.team) continue;
    if (!(p.search_rank > 0 && p.search_rank <= 600)) continue;
    let st = p.injury_status ? (INJ[p.injury_status] ?? '') : '';
    if (!st && p.status === 'Injured Reserve') st = 'IR';
    out.push([p.full_name || `${p.first_name} ${p.last_name}`, fix(p.team), st]);
  }
  injCache = { at: Date.now(), data: out };
  return out;
}

function gameInfo(board) {
  const events = (board && (board.events || (board.leagues && board.leagues[0] && board.leagues[0].events))) || [];
  const games = {};
  for (const ev of events) {
    const c = ev.competitions && ev.competitions[0];
    if (!c) continue;
    const st = (ev.status && ev.status.type) || {};
    const state = st.state || 'pre';                       // pre | in | post
    const period = (ev.status && ev.status.period) || 0;
    const clock = (ev.status && ev.status.displayClock) || '0:00';
    const [m, s] = clock.split(':').map(Number);
    const elapsed = state === 'post' ? 60 : state === 'pre' ? 0 : Math.min(60, (period - 1) * 15 + (15 - ((m || 0) + (s || 0) / 60)));
    const rem = state === 'post' ? 0 : state === 'pre' ? 1 : Math.max(0, 1 - elapsed / 60);
    const teams = (c.competitors || []).map(x => ({ t: fix(x.team && x.team.abbreviation), score: +x.score || 0, home: x.homeAway === 'home' }));
    for (const a of teams) {
      const b = teams.find(x => x !== a) || {};
      games[a.t] = { state, rem: +rem.toFixed(3), detail: st.shortDetail || st.detail || '', start: ev.date, score: a.score, opp: b.t, oppScore: b.score || 0, home: a.home };
    }
  }
  return games;
}

function statLine(s, pos) {
  const n = k => +s[k] || 0;
  if (pos === 'DEF') return {
    dsk: n('def_sack') || n('sack'), dint: n('def_int') || n('int'), dfr: n('def_fum_rec') || n('fum_rec'),
    dtd: n('def_td') + n('def_st_td') + n('st_td'), dsf: n('def_safe') || n('safe'), pa: n('pts_allow'),
  };
  return {
    cmp: n('pass_cmp'), pyd: n('pass_yd'), ptd: n('pass_td'), int: n('pass_int'),
    ratt: n('rush_att'), ryd: n('rush_yd'), rtd: n('rush_td'),
    tgt: n('rec_tgt'), rec: n('rec'), recyd: n('rec_yd'), rectd: n('rec_td'), fl: n('fum_lost'),
  };
}

export default async function handler(req, res) {
  try {
    const state = await j('https://api.sleeper.app/v1/state/nfl');
    const season = +state.season;
    let week = parseInt((req.query && req.query.week) || state.week, 10);
    if (!(week >= 1 && week <= 18)) week = state.week;
    const pos = ['QB', 'RB', 'WR', 'TE', 'DEF'].map(p => 'position[]=' + p).join('&');
    const [stats, board, inj] = await Promise.all([
      j(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&${pos}`).catch(() => []),
      j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`).catch(() => null),
      injuries().catch(() => null),
    ]);
    const games = gameInfo(board);
    const players = [];
    for (const x of Array.isArray(stats) ? stats : []) {
      const p = x.player || {}, s = x.stats || {};
      const ps = p.position || (x.player_id && /^[A-Z]{2,3}$/.test(x.player_id) ? 'DEF' : null);
      if (!ps || !Object.keys(s).length) continue;
      const team = fix(x.team || p.team || (ps === 'DEF' ? x.player_id : ''));
      players.push({ n: ps === 'DEF' ? null : `${p.first_name || ''} ${p.last_name || ''}`.trim(), pos: ps === 'DEF' ? 'DST' : ps, t: team, s: statLine(s, ps), ppr: +s.pts_ppr || 0 });
    }
    const live = Object.values(games).some(g => g.state === 'in');
    res.setHeader('Cache-Control', `public, s-maxage=${live ? 120 : 600}, stale-while-revalidate=300`);
    return res.status(200).json({ season, week, nflWeek: state.week, updated: new Date().toISOString(), live, games, players, injuries: inj });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Live data unavailable' });
  }
}
