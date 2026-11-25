// Current FantasyCalc redraft trade values (1-QB and superflex), refreshed every 5 minutes
// at Vercel's edge. The daily data job still saves a copy (data/market.json) as the fallback,
// along with KeepTradeCut, which only updates daily.
import players from './_players.js';
import report from './_report.js';
import { withSentry } from './_sentry.js';

async function fc(qbs) {
  const r = await fetch(`https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${qbs}&numTeams=12&ppr=1`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (TradeMetric market values)' },
  });
  if (!r.ok) throw new Error('fantasycalc ' + r.status);
  const rows = await r.json(), out = [];
  for (const x of Array.isArray(rows) ? rows : []) {
    const p = x.player || {}, v = x.redraftValue || x.value;
    if (p.name && p.position && v) out.push([p.name, p.position, Math.round(+v), p.maybeTeam || '']);
  }
  return out;
}

async function handler(req, res) {
  try {
    const [one, two] = await Promise.all([fc(1).catch(() => []), fc(2).catch(() => [])]);
    if (one.length < 50 && two.length < 50) throw new Error('empty');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json({ updated: new Date().toISOString(), fc1: one, fc2: two });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Market values unavailable' });
  }
}

const market = withSentry(handler, 'market');

/* /api/players and /api/report are served from here too (see the rewrites in vercel.json), to stay inside Vercel's
   limit of 12 functions. Each keeps its own error-report label. */
export default function route(req, res) {
  const fn = req.query && req.query.fn;
  if (fn === 'players') return players(req, res);
  if (fn === 'report') return report(req, res);
  return market(req, res);
}
