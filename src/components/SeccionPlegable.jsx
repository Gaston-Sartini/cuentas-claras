import { ChevronDown } from 'lucide-react'
import { useLocalPref } from '../hooks/useLocalPref'

/**
 * Sección con título tocable para plegar/desplegar. El estado queda guardado
 * en el teléfono, así cada uno arma su pantalla a gusto.
 *
 * `className` y `tituloClass` dejan que la use también una tarjeta con borde
 * y color propios (el cartel de "Para gastar" del Inicio) sin duplicar el
 * plegado.
 */
export default function SeccionPlegable({
  id,
  titulo,
  icono: Icono,
  accion,
  className = '',
  tituloClass = '',
  children,
}) {
  const [guardado, guardar] = useLocalPref(`cc-seccion-${id}`, '1')
  const abierta = guardado !== '0'

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => guardar(abierta ? '0' : '1')}
          aria-expanded={abierta}
          className="tap flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            size={22}
            aria-hidden="true"
            className={`shrink-0 text-ink-soft transition-transform ${abierta ? '' : '-rotate-90'}`}
          />
          {Icono && <Icono size={22} aria-hidden="true" className="shrink-0" />}
          {/* Sin truncar: en un celular angosto los títulos largos se cortaban
              a la mitad, y acá la claridad vale más que una línea prolija. */}
          <h2 className={`min-w-0 text-lg font-bold ${tituloClass}`}>{titulo}</h2>
        </button>
        {abierta && accion}
      </div>
      {abierta && children}
    </div>
  )
}
