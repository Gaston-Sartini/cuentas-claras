import { useCallback, useState } from 'react'

/**
 * Preferencia de pantalla guardada en el teléfono (localStorage): qué está
 * plegado, desde qué monto contar un gasto hormiga… Cosas de cada aparato,
 * no de la familia: por eso no van a la base.
 *
 * El acceso va con try/catch porque en modo incógnito o con las cookies
 * bloqueadas hasta leer localStorage puede tirar excepción.
 */
export function useLocalPref(key, valorPorDefecto = '') {
  const [valor, setValor] = useState(() => {
    try {
      return localStorage.getItem(key) ?? valorPorDefecto
    } catch {
      return valorPorDefecto
    }
  })

  const guardar = useCallback(
    (nuevo) => {
      setValor(nuevo)
      try {
        localStorage.setItem(key, nuevo)
      } catch {
        /* sin storage la preferencia dura lo que dura la pantalla */
      }
    },
    [key]
  )

  return [valor, guardar]
}
