import { formatARS } from './format'
import { dayDiff, todayISO } from './dates'
import { etiquetaVencimiento } from './vencimientos'
import { pushActivo } from './push'

/**
 * Avisos locales de vencimientos, el plan B del push real: si el navegador
 * no pudo suscribirse a Web Push (lib/push.js), al abrir la app igual salta
 * un aviso por lo que vence ya. Con push activo no hace nada: el servidor
 * (Edge Function send-reminders) ya avisa cada mañana con la app cerrada.
 *
 * El permiso lo pide el usuario con "Avisarme" y cada vencimiento se avisa
 * una sola vez por fecha (marca en localStorage).
 */

const PREF_KEY = 'cc-avisos'
const DIAS_ANTES = 2 // avisa lo que vence hoy, mañana o pasado (y lo vencido)

const leer = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const avisosSoportados = () =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator

export const avisosActivos = () =>
  avisosSoportados() && Notification.permission === 'granted' && leer(PREF_KEY) === '1'

export const avisosRechazados = () =>
  avisosSoportados() && Notification.permission === 'denied'

export const activarAvisos = async () => {
  if (!avisosSoportados()) return false
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return false
  try {
    localStorage.setItem(PREF_KEY, '1')
  } catch {
    /* sin storage el permiso igual queda dado */
  }
  return true
}

// Muestra un aviso por cada ítem que vence en <= DIAS_ANTES días (o vencido),
// una sola vez por (ítem, fecha). En Android el aviso sale por el service
// worker; new Notification() directo no está permitido ahí.
export const notificarVencimientos = async (items, hoy = todayISO()) => {
  if (!avisosActivos() || items.length === 0) return
  if (pushActivo()) return // el servidor ya avisa por push: no duplicar
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return

  for (const item of items) {
    if (dayDiff(hoy, item.fecha) > DIAS_ANTES) continue
    const marca = `cc-notif-${item.id}-${item.fecha}`
    try {
      if (localStorage.getItem(marca)) continue
      localStorage.setItem(marca, '1')
    } catch {
      continue // sin storage no hay dedupe: mejor no spamear
    }
    reg.showNotification('Cuentas Claras', {
      body: `${item.titulo} — ${etiquetaVencimiento(item.fecha, hoy)} (${formatARS(item.monto)})`,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: marca,
    })
  }
}
