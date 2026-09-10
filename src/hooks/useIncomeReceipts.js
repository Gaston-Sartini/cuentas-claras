import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Ingresos que ya entraron de verdad, uno por (ingreso, mes). Marcarlos suma
 * la plata a la billetera y desmarcarlos la devuelve — eso lo hace un trigger
 * en la base, así el saldo real queda consistente venga de donde venga.
 *
 * La proyección (cuánto se espera) vive en useIncomeEntries; acá está sólo lo
 * que pasó de verdad.
 */
export function useIncomeReceipts() {
  const { session, profile } = useAuth()
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('income_receipts').select('*')
    setReceipts(data ?? [])
    setLoading(false)
  }, [])

  // El saldo de las billeteras lo mueve el trigger: si cambia un cobro, la
  // pantalla de billeteras tiene que enterarse igual que esta.
  useSupabaseLive('income_receipts', refresh, !!session)

  // Búsqueda directa por (ingreso, mes), que es como lo consulta la UI
  const porClave = useMemo(
    () => new Map(receipts.map((r) => [`${r.income_entry_id}|${r.month_year}`, r])),
    [receipts]
  )

  const receiptOf = useCallback(
    (entryId, monthISO) => porClave.get(`${entryId}|${monthISO}`) ?? null,
    [porClave]
  )

  // Total que entró de verdad en un mes (para comparar contra lo proyectado)
  const receivedTotal = useCallback(
    (monthISO) =>
      receipts
        .filter((r) => r.month_year === monthISO)
        .reduce((sum, r) => sum + Number(r.amount), 0),
    [receipts]
  )

  const markReceived = useCallback(
    async (entry, monthISO) => {
      const { error } = await supabase.from('income_receipts').insert({
        org_id: profile?.org_id,
        income_entry_id: entry.id,
        month_year: monthISO,
        amount: entry.amount,
        wallet_id: entry.wallet_id,
        created_by: profile?.id,
      })
      if (!error) refresh()
      return { error }
    },
    [profile?.org_id, profile?.id, refresh]
  )

  const undoReceived = useCallback(
    async (receiptId) => {
      const { error } = await supabase.from('income_receipts').delete().eq('id', receiptId)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { receipts, loading, receiptOf, receivedTotal, markReceived, undoReceived, refresh }
}
