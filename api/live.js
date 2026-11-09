// Live game-day data: scores and game clocks (ESPN), player stats so far (Sleeper)
// and the latest injury designations (Sleeper). Cached at Vercel's edge so every
// visitor shares one fetch per 2-minute window (5 minutes when no game is on).
// Also carries the current betting lines (DraftKings via ESPN) and ESPN's injury notes,
// which include practice participation through the week.

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
  if (injCache.data && Date.now() - injCache.at < 5 * 60e3) return injCache.data;
  const all = await j('https://api.sleeper.app/v1/players/nfl');
  const out = [];
  for (const p of Object.values(all)) {
    if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(p.position) || !p.team) continue;
    if (!(p.search_rank > 0 && p.search_rank <= 600)) continue;
    let st = p.injury_status ? (INJ[p.injury_status] ?? '') : '';
    if (!st && p.status === 'Injured Reserve') st = 'IR';
    out.push([p.full_name || `${p.first_name} ${p.last_name}`, fix(p.team), st, st ? (p.injury_body_part || '') : '', p.number != null && p.number !== '' ? +p.number : null]);
  }
  injCache = { at: Date.now(), data: out };
  return out;
}

/* ESPN injury notes (Rotowire-style), with practice participation through the week */
let noteCache = { at: 0, data: null };
async function notes() {
  if (noteCache.data && Date.now() - noteCache.at < 5 * 60e3) return noteCache.data;
  const d = await j('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries');
  const out = [];
  for (const t of d.injuries || []) for (const x of t.injuries || []) {
    const a = x.athlete || {}, pos = a.position && a.position.abbreviation;
    if (pos && !['QB', 'RB', 'WR', 'TE', 'K', 'FB'].includes(pos)) continue;
    const team = fix((a.team && a.team.abbreviation) || '');
    out.push({ n: a.displayName, t: team, st: x.status || '', at: x.date || null, note: String(x.shortComment || '').slice(0, 300), type: (x.details && (x.details.type || x.details.location)) || '' });
  }
  noteCache = { at: Date.now(), data: out };
  return out;
}

function oddsOf(c) {
  const o = (c.odds || []).find(x => x && x.overUnder != null) || (c.odds || [])[0];
  if (!o || o.overUnder == null) return null;
  const home = (c.competitors || []).find(x => x.homeAway === 'home'), away = (c.competitors || []).find(x => x.homeAway === 'away');
  if (!home || !away) return null;
  const sp = Math.abs(+o.spread || 0), favAbbr = fix(String(o.details || '').split(' ')[0]);
  const homeFav = o.homeTeamOdds && o.homeTeamOdds.favorite != null ? !!o.homeTeamOdds.favorite : favAbbr === fix(home.team && home.team.abbreviation);
  const total = +o.overUnder;
  // implied points: half the total, plus or minus half the spread
  const h = total / 2 + (homeFav ? sp : -sp) / 2;
  return { [fix(home.team.abbreviation)]: +h.toFixed(1), [fix(away.team.abbreviation)]: +(total - h).toFixed(1), total, line: o.details || '' };
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
    let odds = null; try { odds = oddsOf(c); } catch {}
    const teams = (c.competitors || []).map(x => ({ t: fix(x.team && x.team.abbreviation), score: +x.score || 0, home: x.homeAway === 'home' }));
    for (const a of teams) {
      const b = teams.find(x => x !== a) || {};
      games[a.t] = { id: String(ev.id), state, rem: +rem.toFixed(3), detail: st.shortDetail || st.detail || '', start: ev.date, score: a.score, opp: b.t, oppScore: b.score || 0, home: a.home, implied: odds ? odds[a.t] ?? null : null, total: odds ? odds.total : null, line: odds ? odds.line : '' };
    }
  }
  return games;
}

function statLine(s, pos) {
  const n = k => +s[k] || 0;
  if (pos === 'K') return {
    k39: n('fgm_0_19') + n('fgm_20_29') + n('fgm_30_39'), k49: n('fgm_40_49'), k50: n('fgm_50p') || (n('fgm_50_59') + n('fgm_60p')),
    kmiss: n('fgmiss'), xpm: n('xpm'), xpmiss: n('xpmiss'),
  };
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
    const pos = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => 'position[]=' + p).join('&');
    const [stats, board, inj, note] = await Promise.all([
      j(`https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&${pos}`).catch(() => []),
      j(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${season}`).catch(() => null),
      injuries().catch(() => null),
      notes().catch(() => null),
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
    // The page adds a 2-minute time bucket to the URL (&b=...), so a cached copy is never older than that.
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${live ? 120 : 240}`);
    return res.status(200).json({ season, week, nflWeek: state.week, updated: new Date().toISOString(), live, games, players, injuries: inj, notes: note });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Live data unavailable' });
  }
}
