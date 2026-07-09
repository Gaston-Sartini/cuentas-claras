import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { METHOD_META } from '../lib/icons'
import { monthStartISO } from '../lib/dates'

/**
 * Compras con tarjeta pendientes de pago, agrupadas por mes contable y por
 * tarjeta. De acá salen el detalle por tarjeta de la proyección y el cierre
 * mensual ("¿pagaste la tarjeta?"), que usa el RPC settle_card_month.
 */
export function useCardCharges() {
  const { session } = useAuth()
  const [byMonth, setByMonth] = useState({}) // { '2026-08-01': 120000, ... }
  const [byMonthCard, setByMonthCard] = useState({}) // { '2026-08-01': { 'Visa Gasti': 85000 } }
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('billing_month, amount, payment_method, payment_methods(name)')
      .eq('kind', 'expense')
      .eq('status', 'next_month')
    const totals = {}
    const cards = {}
    for (const t of data ?? []) {
      const m = t.billing_month
      const card =
        t.payment_methods?.name ?? METHOD_META[t.payment_method]?.label ?? 'Tarjeta'
      totals[m] = (totals[m] ?? 0) + Number(t.amount)
      cards[m] = cards[m] ?? {}
      cards[m][card] = (cards[m][card] ?? 0) + Number(t.amount)
    }
    setByMonth(totals)
    setByMonthCard(cards)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`card-charges-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  // Meses ya vencidos (este mes o antes) con tarjeta sin pagar.
  const dueMonths = Object.keys(byMonth)
    .filter((m) => m <= monthStartISO())
    .sort()
  const dueTotal = dueMonths.reduce((sum, m) => sum + byMonth[m], 0)

  /**
   * Marca como pagados todos los meses vencidos; si walletId viene,
   * descuenta cada total de esa billetera (Banco, normalmente).
   */
  const settleDue = useCallback(
    async (walletId = null) => {
      for (const month of dueMonths) {
        const { error } = await supabase.rpc('settle_card_month', {
          p_month: month,
          p_wallet: walletId,
        })
        if (error) return { error }
      }
      refresh()
      return { error: null }
    },
    [dueMonths, refresh]
  )

  return { byMonth, byMonthCard, dueMonths, dueTotal, loading, settleDue, refresh }
}
