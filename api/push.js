// Phone/desktop alerts, the page's side:
//   GET  /api/push          -> { key } the public key the browser needs to turn alerts on
//   POST /api/push {test}    -> sends a test notice to the signed-in person's own devices (needs their sign-in token)
import { pushOn, pushKey, subsFor, sendTo } from './_push.js';
import { sbAuthUser } from './_shared.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ on: pushOn(), key: pushKey() || null });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!pushOn()) return res.status(503).json({ error: 'Alerts are not set up yet.' });
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const user = await sbAuthUser(tok);
  if (!user || !user.id) return res.status(401).json({ error: 'Sign in first.' });
  const subs = await subsFor([user.id]);
  if (!subs.length) return res.status(404).json({ error: 'No devices with alerts on yet.' });
  let n = 0;
  for (const s of subs) if (await sendTo(s, { title: 'TradeMetric alerts are on', body: "You'll hear about trade deadlines and lineup fixes here.", url: '/#account-leagues', tag: 'test' })) n++;
  return res.status(200).json({ ok: n > 0, devices: n });
}
