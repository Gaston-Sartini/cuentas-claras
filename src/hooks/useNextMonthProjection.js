import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Proyección del mes que viene para el banner rojo:
 * compras con tarjeta pendientes + cuotas que vencen el mes próximo.
 * Se refresca solo cuando cambia cualquier transacción o cuota (Realtime),
 * así toda la familia ve el mismo número al instante.
 */
export function useNextMonthProjection() {
  const [projection, setProjection] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_next_month_projection')
    if (!error) {
      setProjection(Array.isArray(data) ? data[0] : data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()

    const { data: authSub } = supabase.auth.onAuthStateChange(() => refresh())

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`next-month-projection-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        refresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'installments' },
        refresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recurring_expenses' },
        refresh
      )
      .subscribe()

    return () => {
      authSub.subscription.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [refresh])

  return { projection, loading, refresh }
}
