import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { METHOD_META } from '../lib/icons'
import { monthStartISO } from '../lib/dates'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Compras con tarjeta pendientes de pago, agrupadas por mes contable y por
 * tarjeta. De acá salen el detalle por tarjeta de la proyección y el cierre
 * mensual ("¿pagaste la tarjeta?"), que usa el RPC settle_card_month.
 *
 * Una familia con varias tarjetas paga un resumen hoy y el otro después, así
 * que el cierre se puede hacer de a una (dueCards) o todo junto (settleDue).
 */
export function useCardCharges() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('id, date, description, billing_month, amount, payment_method, payment_method_id, payment_methods(name)')
      .eq('kind', 'expense')
      .eq('status', 'next_month')
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useSupabaseLive('transactions', refresh, !!session)

  const { byMonth, byMonthCard, dueMonths, dueTotal, dueCards } = useMemo(() => {
    const totals = {}        // { '2026-10-01': 120000 }
    const cards = {}         // { '2026-10-01': { 'Visa Yami': 85000 } }
    for (const t of rows) {
      const m = t.billing_month
      const card = t.payment_methods?.name ?? METHOD_META[t.payment_method]?.label ?? 'Tarjeta'
      totals[m] = (totals[m] ?? 0) + Number(t.amount)
      cards[m] = cards[m] ?? {}
      cards[m][card] = (cards[m][card] ?? 0) + Number(t.amount)
    }

    // Meses ya vencidos (este mes o antes) con tarjeta sin pagar
    const vencidos = Object.keys(totals).filter((m) => m <= monthStartISO()).sort()
    const total = vencidos.reduce((sum, m) => sum + totals[m], 0)

    // Una fila por tarjeta, sumando todos los meses vencidos: es lo que se
    // paga de una en el resumen real.
    const porTarjeta = new Map()
    for (const t of rows) {
      if (!vencidos.includes(t.billing_month)) continue
      // Las filas viejas con enum legacy no tienen medio al que apuntar: se
      // agrupan por nombre y sólo entran en el cierre de todas.
      const clave = t.payment_method_id ?? `legacy:${t.payment_method}`
      const actual = porTarjeta.get(clave) ?? {
        key: clave,
        methodId: t.payment_method_id ?? null,
        name: t.payment_methods?.name ?? METHOD_META[t.payment_method]?.label ?? 'Tarjeta',
        total: 0,
        items: [],
        months: new Set(),
      }
      actual.total += Number(t.amount)
      actual.items.push({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: Number(t.amount),
      })
      actual.months.add(t.billing_month)
      porTarjeta.set(clave, actual)
    }

    return {
      byMonth: totals,
      byMonthCard: cards,
      dueMonths: vencidos,
      dueTotal: total,
      dueCards: [...porTarjeta.values()]
        .map((c) => ({
          ...c,
          months: [...c.months].sort(),
          items: c.items.sort((a, b) => b.amount - a.amount),
        }))
        .sort((a, b) => b.total - a.total),
    }
  }, [rows])

  /**
   * Marca como pagados los meses vencidos; si walletId viene, descuenta cada
   * total de esa billetera (Banco, normalmente). Con methodId cierra sólo esa
   * tarjeta — así se puede pagar una y dejar la otra para después.
   */
  const settleDue = useCallback(
    async (walletId = null, { methodId = null, months = dueMonths } = {}) => {
      for (const month of months) {
        const { error } = await supabase.rpc('settle_card_month', {
          p_month: month,
          p_wallet: walletId,
          p_method: methodId,
        })
        if (error) return { error }
      }
      refresh()
      return { error: null }
    },
    [dueMonths, refresh]
  )

  return { byMonth, byMonthCard, dueMonths, dueTotal, dueCards, loading, settleDue, refresh }
}
