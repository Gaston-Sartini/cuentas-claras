import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { METHOD_META } from '../lib/icons'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Tarjetas marcadas como pagadas en los últimos días, para poder deshacerlo.
 *
 * Se mira la ventana reciente y no todo el historial a propósito: lo que hay
 * que poder arreglar es el toque de hace un rato, no los pagos viejos que
 * estuvieron bien. Así la sección aparece sólo cuando tiene sentido.
 */
const DIAS = 7

export function useRecentSettlements() {
  const { session } = useAuth()
  const [compras, setCompras] = useState([])
  const [cuotas, setCuotas] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const desde = new Date(Date.now() - DIAS * 86400000).toISOString()

    const [{ data: t }, { data: p }] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, billing_month, payment_method, payment_method_id, payment_methods(name, kind)')
        .eq('kind', 'expense')
        .eq('status', 'settled')
        .gte('updated_at', desde),
      supabase
        .from('installment_payments')
        .select('amount, month_year, installments(payment_method_id, payment_method, payment_methods(name))')
        .gte('created_at', desde),
    ])

    setCompras(t ?? [])
    setCuotas(p ?? [])
    setLoading(false)
  }, [])

  useSupabaseLive(['transactions', 'installment_payments'], refresh, !!session)

  // Una fila por (tarjeta, mes): es la granularidad con la que se deshace
  const settlements = useMemo(() => {
    const acc = new Map()
    const sumar = (clave, datos, monto) => {
      const actual = acc.get(clave) ?? { ...datos, total: 0 }
      actual.total += Number(monto)
      acc.set(clave, actual)
    }

    for (const t of compras) {
      // Sólo crédito: un débito no se "cierra", ya descontó al comprarse
      const esCredito =
        t.payment_methods?.kind === 'credit' ||
        t.payment_method === 'visa' ||
        t.payment_method === 'mastercard'
      if (!esCredito) continue
      const methodId = t.payment_method_id ?? null
      const name = t.payment_methods?.name ?? METHOD_META[t.payment_method]?.label ?? 'Tarjeta'
      sumar(`${methodId}|${t.billing_month}`, { methodId, name, month: t.billing_month }, t.amount)
    }

    for (const p of cuotas) {
      const methodId = p.installments?.payment_method_id ?? null
      const name =
        p.installments?.payment_methods?.name ??
        METHOD_META[p.installments?.payment_method]?.label ??
        'Tarjeta'
      sumar(`${methodId}|${p.month_year}`, { methodId, name, month: p.month_year }, p.amount)
    }

    return [...acc.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [compras, cuotas])

  const undo = useCallback(
    async (settlement, walletId = null) => {
      const { error } = await supabase.rpc('unsettle_card_month', {
        p_month: settlement.month,
        p_wallet: walletId,
        p_method: settlement.methodId,
      })
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { settlements, loading, undo, refresh }
}
