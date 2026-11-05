// Weekly fantasy projections from ESPN and Sleeper, as raw stat lines so the page
// can score them with each league's exact settings. Both platforms update these
// through the week as injury news and depth charts change. Cached at Vercel's
// edge for 5 minutes so every visitor shares one fetch.

const TEAM = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX' };
const fix = t => TEAM[t] || t;
const ESPN_TEAM = { 1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET', 9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN', 17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC', 25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WAS', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU' };
const ESPN_POS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST' };
const r2 = x => Math.round((+x || 0) * 100) / 100;

async function j(url, headers = {}) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (TradeMetric projections)', ...headers } });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

/* Sleeper stat keys -> the page's stat line */
function sleeperLine(s, pos) {
  const n = k => +s[k] || 0;
  if (pos === 'K') return { k39: n('fgm_0_19') + n('fgm_20_29') + n('fgm_30_39'), k49: n('fgm_40_49'), k50: n('fgm_50p') || (n('fgm_50_59') + n('fgm_60p')), kmiss: n('fgmiss'), xpm: n('xpm'), xpmiss: n('xpmiss') };
  if (pos === 'DST') return { dsk: n('def_sack') || n('sack'), dint: n('def_int') || n('int'), dfr: n('def_fum_rec') || n('fum_rec'), dtd: n('def_td') + n('def_st_td') + n('st_td'), dsf: n('def_safe') || n('safe'), pa: n('pts_allow') };
  return { cmp: n('pass_cmp'), pyd: n('pass_yd'), ptd: n('pass_td'), int: n('pass_int'), ratt: n('rush_att'), ryd: n('rush_yd'), rtd: n('rush_td'), tgt: n('rec_tgt'), rec: n('rec'), recyd: n('rec_yd'), rectd: n('rec_td'), fl: n('fum_lost') };
}

/* ESPN stat ids -> the page's stat line (offense only; kickers and defenses use ESPN's points total) */
function espnLine(s) {
  const n = k => +s[k] || 0;
  return { cmp: n(1), pyd: n(3), ptd: n(4), int: n(20), ratt: n(23), ryd: n(24), rtd: n(25), tgt: n(58), rec: n(53), recyd: n(42), rectd: n(43), fl: n(72) };
}
const round = o => { for (const k in o) o[k] = r2(o[k]); return o; };

async function sleeper(season, week) {
  const pos = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => 'position[]=' + p).join('&');
  const rows = await j(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${pos}`);
  const out = [];
  for (const x of Array.isArray(rows) ? rows : []) {
    const p = x.player || {}, s = x.stats || {};
    let ps = p.position || (x.player_id && /^[A-Z]{2,3}$/.test(x.player_id) ? 'DEF' : null);
    if (!ps || !Object.keys(s).length) continue;
    if (ps === 'DEF') ps = 'DST';
    if (!['QB', 'RB', 'WR', 'TE', 'K', 'DST'].includes(ps)) continue;
    const team = fix(x.team || p.team || (ps === 'DST' ? x.player_id : ''));
    const ppr = +s.pts_ppr || 0;
    if (ps !== 'DST' && ppr <= 0) continue;
    out.push({ n: ps === 'DST' ? null : `${p.first_name || ''} ${p.last_name || ''}`.trim(), pos: ps, t: team, s: round(sleeperLine(s, ps)), ppr: r2(ppr) });
  }
  return out;
}

async function espn(season, week) {
  const filter = { players: {
    filterSlotIds: { value: [0, 2, 4, 6, 16, 17] },
    filterStatsForSourceIds: { value: [1] },
    filterStatsForSplitTypeIds: { value: [1] },
    filterStatsForTopScoringPeriodIds: { value: 1, additionalValue: [`11${season}${week}`] },
    sortPercOwned: { sortPriority: 1, sortAsc: false },
    limit: 700,
  } };
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=${week}&view=kona_player_info`;
  const d = await j(url, { 'X-Fantasy-Filter': JSON.stringify(filter), 'X-Fantasy-Source': 'kona', 'X-Fantasy-Platform': 'kona-PROD' });
  const out = [];
  for (const e of d.players || []) {
    const pl = e.player || {}, pos = ESPN_POS[pl.defaultPositionId];
    if (!pos) continue;
    const st = (pl.stats || []).find(x => x.statSourceId === 1 && x.scoringPeriodId === week && (x.statSplitTypeId === 1 || x.statSplitTypeId == null));
    if (!st) continue;
    const t = ESPN_TEAM[pl.proTeamId] || '';
    const pts = r2(st.appliedTotal);
    if (pos !== 'DST' && pos !== 'K' && pts <= 0) continue;
    out.push({ n: pos === 'DST' ? null : pl.fullName, pos, t, s: pos === 'K' || pos === 'DST' ? null : round(espnLine(st.stats || {})), ppr: pts });
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const state = await j('https://api.sleeper.app/v1/state/nfl');
    const season = +state.season;
    let week = parseInt((req.query && req.query.week) || state.week, 10);
    if (!(week >= 1 && week <= 18)) week = +state.week;
    const [s, e] = await Promise.all([
      sleeper(season, week).catch(err => ({ err: String(err.message || err) })),
      espn(season, week).catch(err => ({ err: String(err.message || err) })),
    ]);
    const sources = {};
    if (Array.isArray(s) && s.length) sources.sleeper = s;
    if (Array.isArray(e) && e.length) sources.espn = e;
    if (!Object.keys(sources).length) throw new Error('no projections: ' + JSON.stringify({ s: s.err, e: e.err }));
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json({ season, week, updated: new Date().toISOString(), sources, errors: { sleeper: s.err || null, espn: e.err || null } });
  } catch (err) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Projections unavailable', detail: String(err.message || err).slice(0, 300) });
  }
}
