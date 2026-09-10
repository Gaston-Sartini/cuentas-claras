import { useCallback, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useSupabaseLive } from './useSupabaseLive'

/**
 * Historial completo de movimientos, del más nuevo al más viejo, de a páginas:
 * los "Últimos movimientos" de Inicio arrancan con la primera página y
 * loadMore() va trayendo el resto a medida que se scrollea.
 *
 * Ante un cambio en vivo (Realtime) se recarga todo lo ya mostrado, así los
 * movimientos nuevos de la familia aparecen arriba sin duplicar la lista.
 */
export function useTransactionsFeed(pageSize = 10) {
  const { session } = useAuth()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const shownRef = useRef(pageSize) // cuántos hay en pantalla (para recargar en vivo)

  const fetchRange = useCallback(
    (from, to) =>
      supabase
        .from('transactions')
        .select('*, categories(name, icon), payment_methods(name)')
        .order('created_at', { ascending: false })
        .range(from, to),
    []
  )

  const refresh = useCallback(async () => {
    const visible = Math.max(shownRef.current, pageSize)
    const { data } = await fetchRange(0, visible - 1)
    const rows = data ?? []
    shownRef.current = rows.length
    setTransactions(rows)
    setHasMore(rows.length >= visible) // vino la página llena: puede haber más
    setLoading(false)
  }, [fetchRange, pageSize])

  useSupabaseLive('transactions', refresh, !!session)

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    const from = shownRef.current
    const { data } = await fetchRange(from, from + pageSize - 1)
    const nuevos = data ?? []
    shownRef.current = from + nuevos.length
    setTransactions((prev) => [...prev, ...nuevos])
    setHasMore(nuevos.length === pageSize)
    setLoadingMore(false)
  }, [fetchRange, pageSize, loadingMore])

  return { transactions, loading, loadingMore, hasMore, loadMore }
}
