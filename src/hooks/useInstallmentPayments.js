import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Cuotas que ya entraron en un resumen pagado. Las registra el cierre de
 * tarjeta (settle_card_month), y sirven para dos cosas: que la misma cuota no
 * se descuente dos veces, y que deje de figurar como pendiente.
 */
export function useInstallmentPayments() {
  const { session } = useAuth()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('installment_payments')
      .select('installment_id, month_year, amount')
    setPayments(data ?? [])
    setLoading(false)
  }, [])

  useSupabaseLive('installment_payments', refresh, !!session)

  // Búsqueda directa por (cuota, mes), que es como lo consulta la UI
  const cobradas = useMemo(
    () => new Set(payments.map((p) => `${p.installment_id}|${p.month_year}`)),
    [payments]
  )

  const isPaid = useCallback(
    (installmentId, monthISO) => cobradas.has(`${installmentId}|${monthISO}`),
    [cobradas]
  )

  return { payments, isPaid, loading, refresh }
}
