import { useEffect, useRef } from 'react'

/**
 * Scroll infinito: devuelve un ref para poner en un elemento centinela al
 * final de la lista; cuando entra en pantalla dispara onReachEnd.
 *
 * @param {() => void} onReachEnd  pedir la próxima página
 * @param {boolean} enabled        false cuando no queda más para cargar
 */
export function useInfiniteScroll(onReachEnd, enabled = true) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !enabled) return

    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && onReachEnd(),
      { rootMargin: '200px' } // arranca a cargar un poco antes de llegar al final
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onReachEnd, enabled])

  return sentinelRef
}
