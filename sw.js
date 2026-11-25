/* TradeMetric background worker: shows phone/desktop alerts sent by the server (/api/notify) and opens the right
   page when one is tapped. It does not cache the site, so updates still arrive the normal way. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { title: 'TradeMetric', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'TradeMetric', {
    body: m.body || '', icon: '/icon-512.png?v=3', badge: '/favicon-32.png?v=3', tag: m.tag || undefined, renotify: !!m.tag,
    requireInteraction: !!m.urgent, data: { url: m.url || '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) if (new URL(c.url).origin === self.location.origin) { await c.focus(); try { await c.navigate(url); } catch { c.postMessage({ go: url }); } return; }
    await self.clients.openWindow(url);
  })());
});
