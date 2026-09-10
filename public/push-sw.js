/**
 * Push real: este archivo se suma al service worker generado por Workbox
 * (workbox.importScripts en vite.config.js). Recibe los avisos que manda la
 * Edge Function send-reminders y los muestra aunque la app esté cerrada.
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Cuentas Claras', {
      body: data.body || '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: data.tag || undefined, // mismo tag => reemplaza, no duplica
      data: { url: data.url || '/' },
    })
  )
})

// Tocar el aviso abre la app (o la trae al frente si ya está abierta)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const abierta = wins.find((w) => 'focus' in w)
      return abierta ? abierta.focus() : self.clients.openWindow(url)
    })
  )
})
