// Temporary: /api/newsprobe/<Name>--<TEAM> shows which news sources answer (for testing).
import { collect } from '../news.js';
export default async function handler(req, res) {
  const [name, team] = String(req.query.slug || '').split('--');
  const { items, report } = await collect(decodeURIComponent(name || '').replace(/_/g, ' '), (team || '').toUpperCase(), true);
  res.status(200).json({ name, report, items: items.map(i => ({ src: i.src, outlet: i.outlet, title: i.title, desc: (i.desc || '').slice(0, 160), also: i.also })) });
}
