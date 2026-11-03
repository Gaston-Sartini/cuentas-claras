import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/**
 * El dólar de la familia: a cuánto se pasan a pesos los gastos que vienen en
 * dólares. Cambiarlo recotiza, del lado del servidor y en una sola operación,
 * todo lo que todavía no se pagó (RPC set_usd_rate); lo ya pagado queda como
 * quedó, porque es lo que de verdad salió.
 */
export function useUsdRate() {
  const { org, refreshProfile } = useAuth()
  const rate = Number(org?.usd_rate ?? 0)

  const setRate = useCallback(
    async (valor) => {
      if (!(valor > 0)) return { error: { message: 'Poné a cuánto está el dólar.' } }
      const { error } = await supabase.rpc('set_usd_rate', { p_rate: valor })
      if (error) return { error: { message: 'No se pudo guardar. Probá de nuevo.' } }
      await refreshProfile()
      return {}
    },
    [refreshProfile]
  )

  // Lo que salen en pesos N dólares al cambio de hoy
  const enPesos = useCallback((usd) => Number(usd ?? 0) * rate, [rate])

  return { rate, setRate, enPesos }
}
