import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { monthInRange } from '../lib/dates'
import { useSupabaseLive } from './useSupabaseLive'

// ¿El ingreso cuenta en un mes dado? (misma vigencia que los gastos fijos)
export const incomeActiveInMonth = (entry, monthISO) =>
  monthInRange(entry.start_month, entry.end_month, monthISO)

// ¿Es de un solo mes? (end_month = start_month, sin repetición)
export const incomeIsOneOff = (entry) =>
  entry.end_month != null && entry.end_month === entry.start_month

// Ingresos vigentes en un mes, y su total: el "Entra" de la proyección.
export const incomesForMonth = (entries, monthISO) =>
  entries.filter((e) => incomeActiveInMonth(e, monthISO))

export const incomesTotal = (entries) =>
  entries.reduce((sum, e) => sum + Number(e.amount), 0)

/**
 * Ingresos proyectados por ítem ("Sueldo Yami", "Plata que debía Nico").
 * end_month null = se repite todos los meses; end_month = start_month =
 * ingreso puntual de ese único mes.
 */
export function useIncomeEntries() {
  const { session, profile } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('income_entries')
      .select('*')
      .order('amount', { ascending: false })
    setEntries(data ?? [])
    setLoading(false)
  }, [])

  useSupabaseLive('income_entries', refresh, !!session)

  const addEntry = useCallback(
    async ({ description, amount, startMonth, repeats }) => {
      const { error } = await supabase.from('income_entries').insert({
        org_id: profile?.org_id,
        description: description.trim(),
        amount,
        start_month: startMonth,
        end_month: repeats ? null : startMonth,
      })
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, refresh]
  )

  // Editar nombre/monto (los sueldos se ajustan seguido): aplica a todos los
  // meses en los que el ingreso está vigente.
  const updateEntry = useCallback(
    async (id, fields) => {
      const { error } = await supabase.from('income_entries').update(fields).eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  const removeEntry = useCallback(
    async (id) => {
      const { error } = await supabase.from('income_entries').delete().eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { entries, loading, addEntry, updateEntry, removeEntry, refresh }
}
