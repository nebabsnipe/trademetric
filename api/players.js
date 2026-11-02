// Compact Sleeper player list (id -> [name, position, team]) so the page can sync
// Sleeper rosters without downloading Sleeper's full 5 MB player file.
export default async function handler(req, res) {
  try {
    const r = await fetch('https://api.sleeper.app/v1/players/nfl', { headers: { 'User-Agent': 'TradeMetric/1.0' } });
    if (!r.ok) throw new Error('sleeper ' + r.status);
    const all = await r.json(), out = {};
    for (const [id, p] of Object.entries(all)) {
      if (!p || !['QB', 'RB', 'WR', 'TE', 'K'].includes(p.position) || !p.full_name) continue;
      out[id] = [p.full_name, p.position, p.team || ''];
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200');
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Player list unavailable' });
  }
}
