import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { addMonthsISO } from '../lib/dates'

/**
 * Libro mayor de un mes contable: todos los movimientos cuyo billing_month
 * cae en el mes pedido (las compras con tarjeta aparecen en el mes en que se
 * pagan, no en el que se hicieron — misma regla que el banner rojo).
 * También trae el total de gastos del mes anterior para la comparativa.
 */
export function useMonthLedger(monthISO) {
  const { session } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [prevMonthTotal, setPrevMonthTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [{ data }, { data: prev }] = await Promise.all([
      supabase
        .from('transactions')
        .select(
          '*, categories(name, icon), payment_methods(name, kind, wallets(type)), profiles(full_name)'
        )
        .eq('billing_month', monthISO)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('transactions')
        .select('amount')
        .eq('billing_month', addMonthsISO(monthISO, -1))
        .eq('kind', 'expense'),
    ])
    setTransactions(data ?? [])
    setPrevMonthTotal((prev ?? []).reduce((sum, t) => sum + Number(t.amount), 0))
    setLoading(false)
  }, [monthISO])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`ledger-${monthISO}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh, monthISO])

  // Borrar un gasto devuelve la plata a la billetera (trigger en la DB).
  const removeTransaction = useCallback(
    async (id) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  // Editar un gasto: el trigger revierte el saldo viejo y aplica el nuevo.
  const updateTransaction = useCallback(
    async (id, fields) => {
      const { error } = await supabase.from('transactions').update(fields).eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return {
    transactions,
    prevMonthTotal,
    loading,
    removeTransaction,
    updateTransaction,
    refresh,
  }
}
