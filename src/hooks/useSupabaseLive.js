import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Patrón común de todos los hooks de datos: carga inicial + refresco en vivo
 * ante cualquier cambio en una o más tablas (Supabase Realtime).
 *
 * El nombre del canal es único por instancia: dos componentes pueden montar
 * el mismo hook a la vez y Supabase no permite reusar un canal ya suscripto.
 *
 * @param {string|string[]} tables  tabla(s) a escuchar
 * @param {() => void} refresh      callback estable (useCallback) que recarga
 * @param {boolean} enabled         normalmente !!session: sin login no se carga
 */
export function useSupabaseLive(tables, refresh, enabled = true) {
  const key = Array.isArray(tables) ? tables.join(',') : tables

  useEffect(() => {
    if (!enabled) return
    refresh()

    let channel = supabase.channel(`${key}-live-${crypto.randomUUID()}`)
    for (const table of key.split(',')) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        refresh
      )
    }
    channel.subscribe()

    return () => supabase.removeChannel(channel)
  }, [key, refresh, enabled])
}
