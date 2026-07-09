import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { addMonthsISO, monthDiff, monthStartISO } from '../lib/dates'

// Número de cuota que vence en un mes dado, o null si el plan no aplica ahí.
export const installmentDueInMonth = (inst, monthISO) => {
  const k = monthDiff(monthStartISO(new Date(`${inst.start_date}T00:00:00`)), monthISO) + 1
  return k >= 1 && k <= inst.total_installments ? k : null
}

// Último mes en el que se paga una cuota del plan.
export const installmentLastMonth = (inst) =>
  addMonthsISO(
    monthStartISO(new Date(`${inst.start_date}T00:00:00`)),
    inst.total_installments - 1
  )

export function useInstallments() {
  const { session, profile } = useAuth()
  const [installments, setInstallments] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('installments')
      .select('*, payment_methods(name), categories(name, icon)')
      .order('created_at', { ascending: false })
    setInstallments(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`installments-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'installments' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  /**
   * Alta pensada como habla la gente: "en {mes que viene} pago la cuota K de N".
   * start_date se calcula hacia atrás: la cuota 1 venció (K-1) meses antes.
   * methodId referencia payment_methods (la tarjeta real de la familia).
   */
  const addInstallment = useCallback(
    async ({ description, amountPer, total, dueNextMonth, methodId, categoryId = null }) => {
      const nextMonth = addMonthsISO(monthStartISO(), 1)
      const { error } = await supabase.from('installments').insert({
        org_id: profile?.org_id,
        description: description.trim(),
        amount_per_installment: amountPer,
        total_installments: total,
        current_installment: Math.min(dueNextMonth, total),
        payment_method_id: methodId,
        category_id: categoryId,
        start_date: addMonthsISO(nextMonth, -(dueNextMonth - 1)),
      })
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, refresh]
  )

  const removeInstallment = useCallback(
    async (id) => {
      const { error } = await supabase.from('installments').delete().eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { installments, loading, addInstallment, removeInstallment, refresh }
}
