import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { addMonthsISO } from '../lib/dates'

/**
 * Ingresos estimados por mes. saveIncome hace upsert sobre (org_id, month_year):
 * "repetir" copia el monto a los meses siguientes y cualquier mes puntual se
 * puede pisar después sin tocar el resto.
 */
export function useIncomeProjections() {
  const { session, profile } = useAuth()
  const [incomes, setIncomes] = useState({}) // { '2026-08-01': 1500000, ... }
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('income_projections')
      .select('month_year, estimated_amount')
    setIncomes(Object.fromEntries(
      (data ?? []).map((r) => [r.month_year, Number(r.estimated_amount)])
    ))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`income-projections-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'income_projections' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  const saveIncome = useCallback(
    async (monthISO, amount, { replicateMonths = 0 } = {}) => {
      const rows = Array.from({ length: replicateMonths + 1 }, (_, i) => ({
        org_id: profile?.org_id,
        month_year: addMonthsISO(monthISO, i),
        estimated_amount: amount,
      }))
      const { error } = await supabase
        .from('income_projections')
        .upsert(rows, { onConflict: 'org_id,month_year' })
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, refresh]
  )

  return { incomes, loading, saveIncome, refresh }
}
