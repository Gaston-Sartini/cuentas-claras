import { useMemo, useState } from 'react'
import { ChevronDown, Coins } from 'lucide-react'
import { formatARS } from '../../lib/format'
import { formatShortDate } from '../../lib/dates'

// Umbral "hormiga": 2% del total del mes, redondeado a miles (mínimo $1.000).
const umbralHormiga = (totalMes) =>
  Math.max(Math.round((totalMes * 0.02) / 1000) * 1000, 1000)

const MINIMO_PARA_MOSTRAR = 5

/**
 * Los gastos chicos que en conjunto pesan: muchos movimientos por debajo del
 * 2% del total del mes (delivery, kiosco, farmacia...). Individualmente
 * parecen nada; acá se ve cuánto suman. Excluye cuotas: son compromisos,
 * no impulsos.
 */
export default function GastosHormiga({ gastos }) {
  const [abierta, setAbierta] = useState(false)

  const hormiga = useMemo(() => {
    const totalMes = gastos.reduce((sum, t) => sum + Number(t.amount), 0)
    if (totalMes <= 0) return null
    const umbral = umbralHormiga(totalMes)
    const items = gastos
      .filter((t) => !t.esCuota && Number(t.amount) < umbral)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
    const suma = items.reduce((sum, t) => sum + Number(t.amount), 0)
    return { items, umbral, suma, pct: Math.round((suma / totalMes) * 100) }
  }, [gastos])

  if (!hormiga || hormiga.items.length < MINIMO_PARA_MOSTRAR) return null

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="tap block w-full text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold">
            <Coins size={22} aria-hidden="true" className="shrink-0" />
            Gastos hormiga
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`shrink-0 text-ink-soft transition-transform ${abierta ? 'rotate-180' : ''}`}
            />
          </h2>
          <p className="money shrink-0 font-display text-2xl font-bold">
            {formatARS(hormiga.suma)}
          </p>
        </div>
        <p className="money mt-1 text-base text-ink-soft">
          {hormiga.items.length} gastos de menos de {formatARS(hormiga.umbral)} que
          juntos son el {hormiga.pct}% del mes. Acá suele estar la plata que "se
          esfuma".
        </p>
      </button>

      {abierta && (
        <ul className="mt-2 space-y-1 border-l-2 border-line pl-4">
          {hormiga.items.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-2 text-base">
              <span className="min-w-0 truncate text-ink-soft">
                {formatShortDate(t.date)} · {t.description}
              </span>
              <span className="money shrink-0 font-medium">{formatARS(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
