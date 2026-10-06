import { supabase } from './supabase'

/**
 * Push real (Web Push): el navegador se suscribe con la clave pública VAPID
 * y guarda su endpoint en push_subscriptions. La Edge Function send-reminders
 * usa la clave privada (en el servidor) para mandar los avisos de
 * vencimientos cada mañana, con la app cerrada.
 *
 * La clave pública no es secreta por diseño (viaja en cada suscripción);
 * VITE_VAPID_PUBLIC_KEY permite pisarla por entorno si se rotan las claves.
 */
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ??
  'BFaXP0jsMT2ptl5-ej7jXnKVlMB-fl_nj-ZQ_CHJMV31u8W0pCOmV0PLn1osvBO0WWW9Cs8HZ5vxzvwGY_LvTZY'

const PUSH_KEY = 'cc-push' // marca local: este navegador ya está suscripto

// applicationServerKey tiene que ser Uint8Array; la clave viaja en base64url
const base64UrlToUint8Array = (base64Url) => {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

export const pushSoportado = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

export const pushActivo = () => {
  try {
    return pushSoportado() && localStorage.getItem(PUSH_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Suscribe este navegador y registra el endpoint para la familia.
 * Requiere permiso de notificaciones ya dado (lo pide activarAvisos).
 */
export const suscribirPush = async (profile) => {
  if (!pushSoportado() || !profile?.org_id) return false

  try {
    // .ready nunca resuelve si no hay SW registrado (ej: servidor de dev):
    // con timeout, cae limpio al plan B de avisos locales.
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    if (!reg) return false
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
    })

    const { keys } = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        org_id: profile.org_id,
        profile_id: profile.id,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: 'endpoint' }
    )
    if (error) return false

    try {
      localStorage.setItem(PUSH_KEY, '1')
    } catch {
      /* la suscripción quedó igual */
    }
    return true
  } catch {
    // Sin service worker activo (dev) o permiso denegado: sin push, la app
    // sigue con los avisos locales al abrir.
    return false
  }
}

/**
 * Aviso de prueba: le pide al servidor que mande un push ahora mismo a los
 * navegadores de la familia. Es la única forma de comprobar desde el teléfono
 * que la cadena servidor -> navegador funciona, sin esperar a que algo venza
 * de verdad (puede faltar un mes para el próximo vencimiento).
 */
export const probarPush = async () => {
  const { data, error } = await supabase.functions.invoke('send-reminders', {
    body: { test: true },
  })
  if (error) return { error: 'No se pudo pedir el aviso de prueba. Probá de nuevo.' }
  if (data?.motivo === 'sin_suscripciones') {
    return { error: 'Este teléfono todavía no quedó suscripto. Cerrá la app y volvé a abrirla.' }
  }
  if (!data?.ok) return { error: 'El servidor no pudo entregar el aviso.' }
  return { enviados: data.sent }
}
