// M5.1 — Service worker for web push.
// The backend sends a JSON payload via web-push (RFC 8030 / VAPID). On 'push',
// we render an OS-level notification; on click, we focus an existing tab or
// open a new one at the optional `link` field.

self.addEventListener('install', (event) => {
  // Take control on the next page load so a refresh isn't required after the
  // first install on a given browser.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Pharmacy update';
  const options = {
    body: data.body || '',
    data: { link: data.link || '/', kind: data.kind || 'system' },
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.kind || 'pharmacloud',
    requireInteraction: data.severity === 'critical',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Re-focus an existing tab if we have one open at the right origin.
    for (const client of allClients) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin) {
        await client.focus();
        try { client.postMessage({ type: 'NAV', link }); } catch {}
        return;
      }
    }
    await self.clients.openWindow(link);
  })());
});
