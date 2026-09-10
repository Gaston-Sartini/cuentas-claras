import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Deudas y préstamos activos de la familia. direction = 'owed_to_us'
 * (nos deben) | 'we_owe' (debemos). Saldar marca settled_at (no borra):
 * la lista trae solo las activas.
 */
export function useDebts() {
  const { session, profile } = useAuth()
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('debts')
      .select('*')
      .is('settled_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setDebts(data ?? [])
    setLoading(false)
  }, [])

  useSupabaseLive('debts', refresh, !!session)

  const addDebt = useCallback(
    async ({ description, amount, direction, dueDate = null }) => {
      const { error } = await supabase.from('debts').insert({
        org_id: profile?.org_id,
        description: description.trim(),
        amount,
        direction,
        due_date: dueDate,
      })
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, refresh]
  )

  const updateDebt = useCallback(
    async (id, fields) => {
      const { error } = await supabase.from('debts').update(fields).eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  const settleDebt = useCallback(
    async (id) => {
      const { error } = await supabase
        .from('debts')
        .update({ settled_at: new Date().toISOString() })
        .eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  const removeDebt = useCallback(
    async (id) => {
      const { error } = await supabase.from('debts').delete().eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { debts, loading, addDebt, updateDebt, settleDebt, removeDebt, refresh }
}
