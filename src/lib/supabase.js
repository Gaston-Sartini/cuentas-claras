import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[Cuentas Claras] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env. ' +
      'La app levanta igual, pero sin datos hasta que los completes.'
  )
}

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'public-anon-key'
)
