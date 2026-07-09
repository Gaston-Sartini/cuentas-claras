import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/**
 * Topes de gasto mensual por categoría. El consumo se calcula en el cliente
 * contra los gastos del mes (el resumen del Historial ya tiene esos totales).
 * Devuelve un mapa { category_id: monthly_amount } para lookup directo.
 */
export function useCategoryBudgets() {
  const { session, profile } = useAuth()
  const [budgets, setBudgets] = useState({}) // { category_id: monto }
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('category_budgets')
      .select('category_id, monthly_amount')
    setBudgets(
      Object.fromEntries((data ?? []).map((b) => [b.category_id, Number(b.monthly_amount)]))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`budgets-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'category_budgets' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  // Upsert por (org_id, category_id): setear o pisar el tope de una categoría.
  const setBudget = useCallback(
    async (categoryId, amount) => {
      const { error } = await supabase
        .from('category_budgets')
        .upsert(
          { org_id: profile?.org_id, category_id: categoryId, monthly_amount: amount },
          { onConflict: 'org_id,category_id' }
        )
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, refresh]
  )

  const removeBudget = useCallback(
    async (categoryId) => {
      const { error } = await supabase
        .from('category_budgets')
        .delete()
        .eq('category_id', categoryId)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { budgets, loading, setBudget, removeBudget, refresh }
}
