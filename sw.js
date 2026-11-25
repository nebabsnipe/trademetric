/* TradeMetric service worker: push notifications only.
   It deliberately has no "fetch" handler and keeps no cache, so it can never serve an old copy of the site.
   Pages, css and js always come straight from the network exactly as they did before this file existed. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

/* A push arrived (the site can be closed). The server sends {title, body, tag, url}.
   The same tag replaces the earlier notification for that event instead of stacking a second one. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png?v=1',
    badge: '/badge-96.png?v=1',
    data: { url: d.url || '/' },
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(self.registration.showNotification(d.title || 'TradeMetric', opts));
});

/* Tapping it: bring an open TradeMetric tab to the front and move it to the right section (News, My Team...),
   or open a new one there. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url;
  try { url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin); } catch (err) { url = new URL('/', self.location.origin); }
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(c => new URL(c.url).origin === url.origin);
    if (tab) {
      try { await tab.focus(); } catch (err) {}
      tab.postMessage({ type: 'tm-go', hash: url.hash });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
