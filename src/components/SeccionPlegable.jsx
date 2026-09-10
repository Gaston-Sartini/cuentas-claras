import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Sección con título tocable para plegar/desplegar. El estado queda guardado
 * en el teléfono (localStorage), así cada uno arma su pantalla a gusto.
 */
export default function SeccionPlegable({ id, titulo, icono: Icono, accion, children }) {
  const [abierta, setAbierta] = useState(
    () => localStorage.getItem(`cc-seccion-${id}`) !== '0'
  )

  const alternar = () =>
    setAbierta((v) => {
      localStorage.setItem(`cc-seccion-${id}`, v ? '0' : '1')
      return !v
    })

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierta}
          className="tap flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={22}
            aria-hidden="true"
            className={`shrink-0 text-ink-soft transition-transform ${abierta ? '' : '-rotate-90'}`}
          />
          {Icono && <Icono size={22} aria-hidden="true" className="shrink-0" />}
          <h2 className="truncate text-lg font-bold">{titulo}</h2>
        </button>
        {abierta && accion}
      </div>
      {abierta && children}
    </div>
  )
}
