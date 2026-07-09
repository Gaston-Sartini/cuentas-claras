import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useRecentTransactions(limit = 5) {
  const { session } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name, icon), payment_methods(name)')
      .order('created_at', { ascending: false })
      .limit(limit)
    setTransactions(data ?? [])
    setLoading(false)
  }, [limit])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`recent-transactions-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  return { transactions, loading, refresh }
}
