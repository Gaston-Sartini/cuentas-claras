import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSupabaseLive } from './useSupabaseLive'

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

  // El banner suma tres patas: cualquier cambio en una de ellas lo refresca.
  useSupabaseLive(['transactions', 'installments', 'recurring_expenses'], refresh)

  // Al loguearse/desloguearse el RPC devuelve otra cosa: refrescar también.
  useEffect(() => {
    const { data: authSub } = supabase.auth.onAuthStateChange(() => refresh())
    return () => authSub.subscription.unsubscribe()
  }, [refresh])

  return { projection, loading, refresh }
}
