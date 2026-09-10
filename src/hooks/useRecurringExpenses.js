import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { monthInRange, monthStartISO } from '../lib/dates'
import { useSupabaseLive } from './useSupabaseLive'

// ¿El gasto fijo está vigente en un mes dado?
export const recurringActiveInMonth = (r, monthISO) =>
  monthInRange(r.start_month, r.end_month, monthISO)

/**
 * Gastos fijos mensuales (alquiler, expensas, luz). Son proyección: avisan lo
 * que va a venir cada mes; el pago real se carga como gasto común cuando llega.
 */
export function useRecurringExpenses() {
  const { session, profile } = useAuth()
  const [recurring, setRecurring] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('recurring_expenses')
      .select('*, categories(name, icon), payment_methods(name)')
      .order('amount', { ascending: false })
    setRecurring(data ?? [])
    setLoading(false)
  }, [])

  useSupabaseLive('recurring_expenses', refresh, !!session)

  const addRecurring = useCallback(
    async ({ description, amount, categoryId = null, methodId = null }) => {
      const { error } = await supabase.from('recurring_expenses').insert({
        org_id: profile?.org_id,
        description: description.trim(),
        amount,
        category_id: categoryId,
        payment_method_id: methodId,
        start_month: monthStartISO(),
      })
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, refresh]
  )

  // Editar nombre/monto: las expensas suben todos los meses, hay que poder
  // actualizar el fijo sin borrarlo y recrearlo.
  const updateRecurring = useCallback(
    async (id, fields) => {
      const { error } = await supabase.from('recurring_expenses').update(fields).eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  const removeRecurring = useCallback(
    async (id) => {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { recurring, loading, addRecurring, updateRecurring, removeRecurring, refresh }
}
