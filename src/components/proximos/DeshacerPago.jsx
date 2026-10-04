import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import { useRecentSettlements } from '../../hooks/useRecentSettlements'
import { useWallets } from '../../hooks/useWallets'
import { formatARS } from '../../lib/format'
import { monthLabel } from '../../lib/dates'

/**
 * Deshacer el cierre de una tarjeta marcada por error. Muestra lo que se
 * marcó como pagado en los últimos días: deshacerlo devuelve las compras a
 * pendientes, descobra las cuotas y le repone la plata a la billetera.
 */
export default function DeshacerPago() {
  const { settlements, undo } = useRecentSettlements()
  const { wallets } = useWallets()
  const banco = wallets.find((w) => w.type === 'bank')
  const [devolverBanco, setDevolverBanco] = useState(true)
  const [trabajando, setTrabajando] = useState(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  if (settlements.length === 0) return null

  const deshacer = async (s) => {
    if (
      !window.confirm(
        `¿La ${s.name} de ${monthLabel(s.month)} no estaba pagada? Vuelve a quedar pendiente.`
      )
    ) {
      return
    }
    setTrabajando(s.key)
    setError('')
    setOk('')
    const { error } = await undo(s, devolverBanco ? banco?.id : null)
    setTrabajando(null)
    if (error) return setError('No se pudo deshacer. Probá de nuevo.')
    setOk(`Listo: la ${s.name} volvió a quedar pendiente.`)
    setTimeout(() => setOk(''), 5000)
  }

  return (
    <SeccionPlegable
      id="deshacer-pago"
      titulo="Tarjetas marcadas como pagadas"
      icono={Undo2}
    >
      <p className="mt-1 text-base text-ink-soft">
        Lo que se marcó estos días. Si alguna fue por error, deshacela acá y
        vuelve a quedar pendiente.
      </p>

      <ul className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
        {settlements.map((s) => (
          <li key={s.key} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold">{s.name}</p>
              <p className="text-base text-ink-soft">
                Resumen de {monthLabel(s.month, { withYear: true })}
              </p>
            </div>
            <p className="money shrink-0 text-lg font-bold">{formatARS(s.total)}</p>
            <button
              type="button"
              onClick={() => deshacer(s)}
              disabled={trabajando !== null}
              className="tap flex shrink-0 items-center gap-2 rounded-xl border-2 border-line px-3 py-2 text-base font-bold text-ink-soft disabled:opacity-60"
            >
              <Undo2 size={18} aria-hidden="true" />
              {trabajando === s.key ? '…' : 'Deshacer'}
            </button>
          </li>
        ))}
      </ul>

      {banco && (
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            checked={devolverBanco}
            onChange={(e) => setDevolverBanco(e.target.checked)}
            className="h-6 w-6 accent-ink"
          />
          <span className="text-base font-medium">
            Devolverle la plata al {banco.name}
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-2 rounded-xl border-2 border-leaf bg-leaf/10 px-4 py-3 text-base font-medium text-leaf">
          {ok}
        </p>
      )}
    </SeccionPlegable>
  )
}
