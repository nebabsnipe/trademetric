// Sending phone/desktop notifications (web push). Helper, not an endpoint.
// Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel (a key pair made once; the public half is handed to the page).
import webpush from 'web-push';
import { sbRest } from './_shared.js';

const PUB = process.env.VAPID_PUBLIC_KEY || '', PRIV = process.env.VAPID_PRIVATE_KEY || '';
export const pushOn = () => !!(PUB && PRIV);
export const pushKey = () => PUB;
if (PUB && PRIV) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://www.trademetric.app', PUB, PRIV);

/* every device that turned on alerts, for the given accounts (or all) */
export async function subsFor(ids) {
  const q = ids ? `&user_id=in.(${ids.map(encodeURIComponent).join(',')})` : '';
  const r = await sbRest(`push_subs?select=endpoint,user_id,keys${q}`, { ms: 6000 });
  return Array.isArray(r) ? r : [];
}

/* send one notice to one device. Devices that are gone (uninstalled, alerts turned off) are removed. */
export async function sendTo(sub, msg) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(msg), { TTL: msg.ttl || 6 * 3600, urgency: msg.urgent ? 'high' : 'normal' });
    return true;
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) await sbRest(`push_subs?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', prefer: 'return=minimal' });
    return false;
  }
}
