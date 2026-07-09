import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useCategories() {
  const { session, profile } = useAuth()
  const [categories, setCategories] = useState([])

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('is_custom', { ascending: true })
      .order('name', { ascending: true })
    setCategories(data ?? [])
  }, [])

  useEffect(() => {
    if (!session) return
    refresh()

    // Nombre único por instancia: dos componentes pueden montar este hook a la
    // vez y Supabase no permite reusar un canal ya suscripto.
    const channel = supabase
      .channel(`categories-live-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        refresh
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, refresh])

  const createCategory = useCallback(
    async (name, icon = 'tag') => {
      const clean = name.trim()
      if (!clean) return { error: { message: 'Poné un nombre para la categoría.' } }

      const { data, error } = await supabase
        .from('categories')
        .insert({ org_id: profile?.org_id, name: clean, icon })
        .select()
        .single()

      if (error) {
        const message =
          error.code === '23505'
            ? 'Ya existe una categoría con ese nombre.'
            : 'No se pudo crear la categoría. Probá de nuevo.'
        return { error: { message } }
      }

      refresh()
      return { data }
    },
    [profile?.org_id, refresh]
  )

  // Sólo categorías propias (RLS): las globales no se pueden tocar.
  const renameCategory = useCallback(
    async (id, name) => {
      const clean = name.trim()
      if (!clean) return { error: { message: 'Poné un nombre.' } }
      const { error } = await supabase.from('categories').update({ name: clean }).eq('id', id)
      if (error) {
        return {
          error: {
            message:
              error.code === '23505'
                ? 'Ya existe una categoría con ese nombre.'
                : 'No se pudo guardar. Probá de nuevo.',
          },
        }
      }
      refresh()
      return {}
    },
    [refresh]
  )

  // Sólo categorías propias: las globales son de todos. Los gastos que la
  // usaban quedan "Sin categoría" (FK con set null).
  const removeCategory = useCallback(
    async (id) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (!error) refresh()
      return { error }
    },
    [refresh]
  )

  return { categories, createCategory, renameCategory, removeCategory, refresh }
}
