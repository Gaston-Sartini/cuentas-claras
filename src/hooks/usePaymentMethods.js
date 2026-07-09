import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/**
 * Medios de pago de la familia. kind = 'credit' va a la cuenta del mes que
 * viene; kind = 'debit' descuenta al instante la billetera linkeada
 * (wallet_id), ej: "Visa débito Gasti" -> "BBVA Gasti".
 */
export function usePaymentMethods() {
  const { session, profile } = useAuth()
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('payment_methods')
      .select('*, wallets(name, type)')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    setMethods(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`payment-methods-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_methods' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  const createMethod = useCallback(
    async ({ name, kind, walletId = null }) => {
      const clean = name.trim()
      if (!clean) return { error: { message: 'Poné un nombre (ej: "Visa Gasti").' } }
      if (kind === 'debit' && !walletId)
        return { error: { message: 'Elegí de qué billetera descuenta.' } }

      const { data, error } = await supabase
        .from('payment_methods')
        .insert({
          org_id: profile?.org_id,
          name: clean,
          kind,
          wallet_id: kind === 'debit' ? walletId : null,
        })
        .select('*, wallets(name, type)')
        .single()

      if (error) {
        const message =
          error.code === '23505'
            ? 'Ya existe un medio de pago con ese nombre.'
            : 'No se pudo crear. Probá de nuevo.'
        return { error: { message } }
      }

      refresh()
      return { data }
    },
    [profile?.org_id, refresh]
  )

  const removeMethod = useCallback(
    async (id) => {
      const { error } = await supabase.from('payment_methods').delete().eq('id', id)
      if (error) {
        // El FK intenta poner en null los gastos que lo usan y el CHECK de
        // transactions lo impide: un gasto no puede quedar sin método.
        return {
          error: {
            message: 'No se puede borrar: hay gastos o cuotas cargados con este medio de pago.',
          },
        }
      }
      refresh()
      return { error: null }
    },
    [refresh]
  )

  return { methods, loading, createMethod, removeMethod, refresh }
}
