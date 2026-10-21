// Se suma al service worker de la app (vite.config.ts: workbox.importScripts).
// Muestra la notificación cuando llega un mensaje nuevo, aunque la app esté cerrada.
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }
  const title = data.title || 'Mensaje nuevo'
  // Si la app está abierta, que recargue ya (por si el tiempo real se cayó).
  const avisarApp = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => list.forEach(c => c.postMessage({ type: 'crm-refresh' })))
  event.waitUntil(Promise.all([avisarApp, self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'crm',
    renotify: true,
    data: { url: data.url || '/crm' },
  })]))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/crm'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) { return c.focus() }
    }
    return self.clients.openWindow(url)
  }))
})
