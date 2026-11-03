// Temporary test route: /api/newsprobe/<Name>--<TEAM>--<POS>[--ai]
import news, { collect } from '../news.js';
export default async function handler(req, res) {
  const [name, team, pos, ai] = String(req.query.slug || '').split('--');
  const nm = decodeURIComponent(name || '').replace(/_/g, ' ');
  if (ai) { req.query = { name: nm, team, pos }; return news(req, res); }
  const { items, report } = await collect(nm, (team || '').toUpperCase(), true);
  res.status(200).json({ name: nm, report, items: items.map(i => ({ src: i.src, outlet: i.outlet, title: i.title, desc: (i.desc || '').slice(0, 160), also: i.also })) });
}
