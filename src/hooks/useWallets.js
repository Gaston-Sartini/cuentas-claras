import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useWallets() {
  const { session, profile } = useAuth()
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('wallets').select('*').order('created_at')
    setWallets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`wallets-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  const setBalance = useCallback(
    async (id, value) => {
      const { error } = await supabase
        .from('wallets')
        .update({ current_balance: value })
        .eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  // Retiro de cajero (o transferencia entre billeteras): atómico en la DB.
  const transfer = useCallback(
    async (fromId, toId, amount, description = 'Retiro cajero') => {
      const { error } = await supabase.rpc('transfer_between_wallets', {
        p_from_wallet: fromId,
        p_to_wallet: toId,
        p_amount: amount,
        p_description: description,
      })
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  // Billeteras nuevas (ej: "BBVA Gasti") para poder linkearles tarjetas de débito
  const createWallet = useCallback(
    async ({ name, type = 'bank', balance = 0 }) => {
      const clean = name.trim()
      if (!clean) return { error: { message: 'Poné un nombre (ej: "BBVA Gasti").' } }

      const { data, error } = await supabase
        .from('wallets')
        .insert({ org_id: profile?.org_id, name: clean, type, current_balance: balance })
        .select()
        .single()

      if (error) {
        const message =
          error.code === '23505'
            ? 'Ya existe una billetera con ese nombre.'
            : 'No se pudo crear. Probá de nuevo.'
        return { error: { message } }
      }

      refresh()
      return { data }
    },
    [profile?.org_id, refresh]
  )

  const renameWallet = useCallback(
    async (id, name) => {
      const clean = name.trim()
      if (!clean) return { error: { message: 'Poné un nombre.' } }
      const { error } = await supabase.from('wallets').update({ name: clean }).eq('id', id)
      if (error) {
        return {
          error: {
            message:
              error.code === '23505'
                ? 'Ya existe una billetera con ese nombre.'
                : 'No se pudo guardar. Probá de nuevo.',
          },
        }
      }
      refresh()
      return {}
    },
    [refresh]
  )

  return { wallets, loading, setBalance, transfer, createWallet, renameWallet, refresh }
}
