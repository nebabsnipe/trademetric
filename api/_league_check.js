// Did this team really clinch a playoff spot? Did it really win the title? Helper for api/email.js, not an endpoint.
//
// Read from the league's own data on its platform (results, standings, playoff bracket), never from a projection
// or a win chance. The answer is "yes" only when it is certain, and every answer comes with the reasons.
//
// Clinched means mathematically locked:
//   - the regular season is over and the team is in the winners' bracket, or
//   - games remain, but even if every team that could still catch or tie this one won out, and every other
//     division's winner took a spot, there would still be a playoff spot left for it.
//   Ties in the standings are counted against the team (tiebreakers can't be known ahead of time), so this says
//   "not yet" in some cases where the league's own site already shows a clinch. It never says "yes" early.
// Champion means the championship game is finished, the league says this team won it, and (where the league
//   gives one) the final ranking agrees.
//
// verdict(lg, season, get) -> { ok, platform, league, team, clinched, champion, facts: [...], data }
//   lg:  { type: 'espn' | 'sleeper', id, rid }   rid = the team's id on the platform
//   get: async url -> JSON; throws an error with .status for a bad answer
//   ok false = the league couldn't be read: { ok:false, status, gone } where gone means the platform itself said
//   "no such league" or "not allowed" (401/403/404), as opposed to being slow or down.

const num = x => (Number.isFinite(+x) ? +x : 0);
const recStr = t => `${t.w}-${t.l}${t.t ? '-' + t.t : ''}`;

/* The shared math. teams: [{ id, name, w, l, t, left, div }]  spots: playoff teams  divisions: how many (0/1 = none)
   Returns { clinched, why }. */
export function clinchMath(teams, meId, spots, divisions) {
  const me = teams.find(t => String(t.id) === String(meId));
  if (!me) return { clinched: false, why: 'Your team was not found in the standings.' };
  if (!(spots > 0) || teams.length <= spots) return { clinched: false, why: 'The league\'s playoff settings could not be read.' };
  const pts = t => t.w + t.t / 2, mine = pts(me);
  // anyone who could finish level with us or ahead counts as ahead (tiebreakers unknown)
  const threats = teams.filter(t => t !== me && pts(t) + t.left >= mine);
  let reserved = 0;
  if (divisions > 1) {
    const divs = [...new Set(teams.map(t => t.div))].filter(d => d !== me.div);
    reserved = divs.filter(d => !threats.some(t => t.div === d)).length;          // a division nobody in can catch us still sends its winner
  }
  const worst = threats.length + reserved + 1;                                   // our worst possible seed
  const names = threats.map(t => t.name).slice(0, 6).join(', ');
  if (worst <= spots) return { clinched: true, worst, why: `${spots} teams make the playoffs. At ${recStr(me)}, only ${threats.length} other team${threats.length === 1 ? '' : 's'} can still match or pass this record${reserved ? `, plus ${reserved} spot${reserved === 1 ? '' : 's'} held for other division winners` : ''}, so the worst possible finish is seed ${worst}.` };
  return { clinched: false, worst, why: `${spots} teams make the playoffs. At ${recStr(me)}, ${threats.length} other team${threats.length === 1 ? '' : 's'} can still match or pass this record${names ? ` (${names}${threats.length > 6 ? ', ...' : ''})` : ''}${reserved ? `, plus ${reserved} spot${reserved === 1 ? '' : 's'} held for other division winners` : ''}, so the worst possible finish is seed ${worst}. Not locked yet.` };
}

/* ---------------- ESPN ---------------- */
export function espnVerdict(d, rid) {
  const facts = [], out = { ok: true, platform: 'espn', league: (d.settings && d.settings.name) || 'League', season: d.seasonId, clinched: false, champion: false, facts };
  const ss = (d.settings && d.settings.scheduleSettings) || {}, regN = num(ss.matchupPeriodCount), spots = num(ss.playoffTeamCount);
  const T = d.teams || [], S = d.schedule || [];
  const nameOf = t => t.name || [t.location, t.nickname].filter(Boolean).join(' ') || 'Team ' + t.id;
  const meT = T.find(t => String(t.id) === String(rid));
  if (!meT) { facts.push('Your team was not found in this league.'); return out; }
  out.team = nameOf(meT);
  if (!regN || !S.length) { facts.push('The league\'s schedule could not be read.'); return out; }

  // the regular season, counted from the league's own results
  const reg = S.filter(m => num(m.matchupPeriodId) <= regN && m.home && m.away && (m.playoffTierType || 'NONE') === 'NONE');
  const tally = Object.fromEntries(T.map(t => [t.id, { id: t.id, name: nameOf(t), w: 0, l: 0, t: 0, left: 0, div: t.divisionId }]));
  for (const m of reg) {
    const h = tally[m.home.teamId], a = tally[m.away.teamId];
    if (!h || !a) continue;
    if (m.winner === 'HOME') { h.w++; a.l++; } else if (m.winner === 'AWAY') { a.w++; h.l++; } else if (m.winner === 'TIE') { h.t++; a.t++; } else { h.left++; a.left++; }
  }
  const teams = Object.values(tally), me = tally[meT.id];
  Object.assign(out, { wins: me.w, losses: me.l, ties: me.t });
  // our count has to agree with the standings the league shows, or we don't trust either
  const o = (meT.record && meT.record.overall) || {};
  const agrees = T.every(t => { const r = (t.record && t.record.overall) || {}, x = tally[t.id]; return num(r.wins) === x.w && num(r.losses) === x.l && num(r.ties) === x.t; });
  const left = reg.filter(m => m.winner === 'UNDECIDED' || !m.winner).length, regDone = left === 0;
  facts.push(`Regular season: ${regN} weeks, ${regDone ? 'finished' : `${me.left} game${me.left === 1 ? '' : 's'} left for this team`}. Record ${recStr(me)}${agrees ? '' : ` (the league's standings page says ${num(o.wins)}-${num(o.losses)}${num(o.ties) ? '-' + num(o.ties) : ''})`}.`);
  if (!agrees) { facts.push('The results and the standings don\'t match right now (scores may still be settling), so nothing is concluded.'); return out; }

  const bracket = S.filter(m => m.playoffTierType === 'WINNERS_BRACKET' && m.home && m.away);
  const inBracket = bracket.some(m => m.home.teamId === meT.id || m.away.teamId === meT.id);
  out.playoffsUnderway = bracket.some(m => m.winner === 'HOME' || m.winner === 'AWAY');
  const divisions = new Set(T.map(t => t.divisionId)).size;
  if (regDone && bracket.length) {
    out.clinched = inBracket; out.final = true;
    facts.push(inBracket ? `The regular season is over and this team is in the playoff bracket${meT.playoffSeed ? ` (seed ${meT.playoffSeed} of ${spots})` : ''}.` : 'The regular season is over and this team is not in the playoff bracket.');
  } else if (regDone) {
    facts.push('The regular season is over but the playoff bracket isn\'t posted yet, so nothing is concluded.');
  } else {
    const c = clinchMath(teams, meT.id, spots, divisions);
    out.clinched = c.clinched; facts.push(c.why);
  }

  // the title: the one winners'-bracket game in the last round, finished, won by this team
  if (bracket.length) {
    const lastRound = Math.max(...S.map(m => num(m.matchupPeriodId))), finals = bracket.filter(m => num(m.matchupPeriodId) === lastRound);
    const bracketLast = Math.max(...bracket.map(m => num(m.matchupPeriodId)));
    if (bracketLast !== lastRound || finals.length !== 1) facts.push('The championship game can\'t be picked out of the bracket yet.');
    else {
      const f = finals[0], decided = f.winner === 'HOME' || f.winner === 'AWAY';
      const winId = f.winner === 'HOME' ? f.home.teamId : f.winner === 'AWAY' ? f.away.teamId : null;
      const mine = f.home.teamId === meT.id || f.away.teamId === meT.id;
      if (!mine) facts.push('This team is not in the championship game.');
      else if (!decided) facts.push('This team is in the championship game. It isn\'t finished yet.');
      else {
        const rank = num(meT.rankCalculatedFinal), rankOk = !rank || (winId === meT.id) === (rank === 1);
        const hi = Math.max(num(f.home.totalPoints), num(f.away.totalPoints)), lo = Math.min(num(f.home.totalPoints), num(f.away.totalPoints));
        if (winId === meT.id && rankOk) { out.champion = true; out.score = `${hi.toFixed(1)} to ${lo.toFixed(1)}`; facts.push(`The championship game is final and the league lists this team as the winner, ${out.score}${rank === 1 ? ', and its final rank is 1' : ''}.`); }
        else if (winId === meT.id) facts.push(`The championship game lists this team as the winner but its final rank is ${rank}, so nothing is concluded.`);
        else facts.push('The championship game is final. This team lost it.');
      }
    }
  } else facts.push('No playoff games yet, so no championship.');
  return out;
}

/* ---------------- Sleeper ---------------- */
export function sleeperVerdict(lg, rosters, bracket, users, rid) {
  const facts = [], out = { ok: true, platform: 'sleeper', league: lg.name || 'League', season: num(lg.season), clinched: false, champion: false, facts };
  const st = lg.settings || {}, spots = num(st.playoff_teams), start = num(st.playoff_week_start), perWeek = st.league_average_match ? 2 : 1;
  const nameOf = r => { const u = (users || []).find(x => x.user_id === r.owner_id); return (u && u.metadata && u.metadata.team_name) || (u && u.display_name) || 'Team ' + r.roster_id; };
  const meR = (rosters || []).find(r => String(r.roster_id) === String(rid));
  if (!meR) { facts.push('Your team was not found in this league.'); return out; }
  out.team = nameOf(meR);
  if (!start || start < 2 || !spots) { facts.push('The league\'s playoff settings could not be read.'); return out; }
  const regWeeks = start - 1;
  const teams = rosters.map(r => { const s = r.settings || {}, w = num(s.wins), l = num(s.losses), t = num(s.ties);
    return { id: r.roster_id, name: nameOf(r), w, l, t, left: Math.max(0, regWeeks * perWeek - (w + l + t)), div: s.division || 0 }; });
  const me = teams.find(t => t.id === meR.roster_id);
  Object.assign(out, { wins: me.w, losses: me.l, ties: me.t });
  const regDone = teams.every(t => t.left === 0);
  facts.push(`Regular season: ${regWeeks} weeks, ${regDone ? 'finished' : `${Math.ceil(me.left / perWeek)} week${Math.ceil(me.left / perWeek) === 1 ? '' : 's'} left`}. Record ${recStr(me)}.`);
  const B = Array.isArray(bracket) ? bracket : [];
  const ids = m => [m.t1, m.t2].filter(x => typeof x === 'number');
  const inBracket = B.filter(m => m.r <= 2).some(m => ids(m).includes(meR.roster_id));
  out.playoffsUnderway = B.some(m => typeof m.w === 'number');
  if (regDone && B.length && B.some(m => ids(m).length)) {
    out.clinched = inBracket; out.final = true;
    facts.push(inBracket ? 'The regular season is over and this team is in the playoff bracket.' : 'The regular season is over and this team is not in the playoff bracket.');
  } else if (regDone) {
    facts.push('The regular season is over but the playoff bracket isn\'t posted yet, so nothing is concluded.');
  } else {
    const c = clinchMath(teams, meR.roster_id, spots, num(st.divisions));
    out.clinched = c.clinched; facts.push(c.why);
  }
  const fin = B.find(m => m.p === 1);
  if (!fin) facts.push(B.length ? 'The championship game can\'t be picked out of the bracket yet.' : 'No playoff bracket yet, so no championship.');
  else if (!ids(fin).includes(meR.roster_id)) facts.push('This team is not in the championship game.');
  else if (typeof fin.w !== 'number') facts.push('This team is in the championship game. It isn\'t finished yet.');
  else if (fin.w !== meR.roster_id) facts.push('The championship game is final. This team lost it.');
  else {
    const listed = lg.metadata && lg.metadata.latest_league_winner_roster_id, done = lg.status === 'complete';
    if (listed != null && String(listed) !== String(meR.roster_id)) facts.push('The bracket lists this team as the winner but the league names a different champion, so nothing is concluded.');
    else if (!done && listed == null) facts.push('The bracket lists this team as the winner, but the league hasn\'t closed its season yet, so nothing is concluded.');
    else { out.champion = true; facts.push('The championship game is final, the bracket lists this team as the winner, and the league has closed its season.'); }
  }
  return out;
}

/* ---------------- reading the league ---------------- */
export async function verdict(lg, season, get) {
  try {
    if (lg.type === 'espn') {
      const d = await get(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${encodeURIComponent(lg.id)}?view=mTeam&view=mSettings&view=mMatchupScore&view=mStandings&view=mStatus`);
      if (!d || !Array.isArray(d.teams)) return { ok: false, status: 0, gone: false };
      return espnVerdict(d, lg.rid);
    }
    if (lg.type === 'sleeper') {
      const u = `https://api.sleeper.app/v1/league/${encodeURIComponent(lg.id)}`;
      const league = await get(u);
      if (!league || !league.league_id) return { ok: false, status: 404, gone: true };            // Sleeper answers "null" for a league that doesn't exist
      const [rosters, bracket, users] = await Promise.all([get(u + '/rosters'), get(u + '/winners_bracket').catch(() => []), get(u + '/users').catch(() => [])]);
      if (!Array.isArray(rosters)) return { ok: false, status: 0, gone: false };
      return sleeperVerdict(league, rosters, bracket, users, lg.rid);
    }
    return { ok: false, status: 0, gone: false, skip: true };
  } catch (e) {
    const status = num(e && e.status);
    return { ok: false, status, gone: status === 401 || status === 403 || status === 404 };
  }
}

export async function getJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (TradeMetric league check)' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
