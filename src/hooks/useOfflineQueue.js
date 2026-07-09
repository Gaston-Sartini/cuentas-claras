import { useEffect, useState } from 'react'
import { flush, pendingCount, subscribe } from '../lib/offlineQueue'

/**
 * Estado de la cola offline para la UI: cuántos gastos esperan sincronizar y
 * si hay internet. Dispara el vaciado al montar y cada vez que vuelve la red.
 */
export function useOfflineQueue() {
  const [pending, setPending] = useState(pendingCount())
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const unsub = subscribe(setPending)

    const onOnline = () => {
      setOnline(true)
      flush()
    }
    const onOffline = () => setOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    flush() // por si quedaron pendientes de una sesión anterior

    return () => {
      unsub()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return { pending, online }
}
