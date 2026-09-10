import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { installmentDueInMonth, useInstallments } from './useInstallments'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Cuánto lleva gastado el mes, total y por categoría: gastos del mes contable
 * más las cuotas que vencen ese mes (la misma regla que el resumen del
 * Historial). Alimenta el freno de topes al cargar un gasto y el
 * "disponible por día" del Inicio.
 */
export function useCategorySpending(monthISO) {
  const { session } = useAuth()
  const { installments } = useInstallments()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('amount, category_id')
      .eq('kind', 'expense')
      .eq('billing_month', monthISO)
    setRows(data ?? [])
    setLoading(false)
  }, [monthISO])

  useSupabaseLive('transactions', refresh, !!session)

  return useMemo(() => {
    const porCategoria = {}
    let total = 0
    const sumar = (categoryId, monto) => {
      const key = categoryId ?? 'sin'
      porCategoria[key] = (porCategoria[key] ?? 0) + monto
      total += monto
    }
    for (const r of rows) sumar(r.category_id, Number(r.amount))
    for (const inst of installments) {
      if (installmentDueInMonth(inst, monthISO))
        sumar(inst.category_id, Number(inst.amount_per_installment))
    }
    return { porCategoria, total, loading }
  }, [rows, installments, monthISO, loading])
}
