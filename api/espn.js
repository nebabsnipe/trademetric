// Server function for private ESPN leagues.
// ESPN has no sign-in for outside apps. Private leagues are read with the two
// login cookies ESPN puts in your browser (espn_s2 and SWID). This function
// forwards them to ESPN for one request and never stores or logs them.

const VIEWS = ['mTeam', 'mRoster', 'mSettings', 'mMatchupScore'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { leagueId, season, s2, swid, scoringPeriodId } = req.body || {};
  const sp = parseInt(scoringPeriodId, 10);
  const id = String(leagueId || '').trim();
  const yr = String(season || '').trim();
  let sw = String(swid || '').trim();
  let cookie = String(s2 || '').trim();
  try { if (/%[0-9A-F]{2}/i.test(cookie)) cookie = decodeURIComponent(cookie); } catch {}
  if (sw && !sw.startsWith('{')) sw = '{' + sw.replace(/[{}]/g, '') + '}';

  if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ code: 'bad_id', error: 'League ID should be a number.' });
  if (!/^\d{4}$/.test(yr)) return res.status(400).json({ code: 'bad_season', error: 'Bad season.' });
  if (!/^\{[0-9A-Fa-f-]{36}\}$/.test(sw)) return res.status(400).json({ code: 'bad_swid', error: 'SWID should look like {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}.' });
  if (cookie.length < 40 || cookie.length > 2000 || !/^[A-Za-z0-9%+/=_.-]+$/.test(cookie)) return res.status(400).json({ code: 'bad_s2', error: 'espn_s2 looks incomplete. Copy the whole value.' });

  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${yr}/segments/0/leagues/${id}?` + VIEWS.map(v => 'view=' + v).join('&') + (sp >= 1 && sp <= 18 ? '&scoringPeriodId=' + sp : '');
  try {
    const r = await fetch(url, {
      headers: {
        Cookie: `espn_s2=${encodeURIComponent(cookie)}; SWID=${sw}`,
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (TradeMetric league import)',
      },
      redirect: 'manual',
    });
    if (r.status === 401 || r.status === 403) return res.status(401).json({ code: 'denied', error: "ESPN didn't accept those codes. Sign in to ESPN again and copy fresh ones." });
    if (r.status === 404) return res.status(404).json({ code: 'not_found', error: 'No league with that ID for this season.' });
    if (!r.ok) return res.status(502).json({ code: 'upstream', error: 'ESPN returned an error (' + r.status + ').' });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ code: 'upstream', error: "Couldn't reach ESPN. Try again." });
  }
}
