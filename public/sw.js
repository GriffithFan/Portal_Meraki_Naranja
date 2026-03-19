// Service Worker for Carrot push notifications
self.addEventListener('push', function(event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: 'Portal Meraki',
      body: event.data.text(),
    };
  }

  // Separate title prefix (tipo label) and body for cleaner display
  var body = data.body || data.mensaje || '';
  // Replace \n with line breaks for multi-line support
  body = body.replace(/\\n/g, '\n');

  var options = {
    body: body,
    icon: '/images/icon-192.png',
    badge: '/images/badge-72.png',
    tag: data.tag || 'pmn-notification',
    renotify: true,
    data: {
      url: data.url || data.enlace || '/dashboard/bandeja',
    },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'Ver' },
      { action: 'dismiss', title: 'Cerrar' },
    ],
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Carrot', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard/bandeja';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});
