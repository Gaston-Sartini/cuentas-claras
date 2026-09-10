import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { categoryIcon } from '../../lib/icons'
import { formatARS } from '../../lib/format'
import { formatShortDate } from '../../lib/dates'

/**
 * Resumen del mes agrupado por categoría. Tocar una categoría la despliega y
 * muestra los movimientos que suman ese total (gastos y cuotas del mes).
 */
export default function ResumenPorCategoria({ gastos, comparativa, budgets, mostrarTopes }) {
  const [abierta, setAbierta] = useState(null) // key de la categoría desplegada

  const resumen = useMemo(() => {
    const porCat = new Map()
    let total = 0
    for (const t of gastos) {
      const key = t.category_id ?? 'sin'
      const item = porCat.get(key) ?? {
        key,
        categoryId: t.category_id ?? null,
        nombre: t.categories?.name ?? 'Sin categoría',
        icon: t.categories?.icon,
        monto: 0,
        items: [],
      }
      item.monto += Number(t.amount)
      item.items.push(t)
      total += Number(t.amount)
      porCat.set(key, item)
    }
    const filas = [...porCat.values()].sort((a, b) => b.monto - a.monto)
    // Adentro de cada categoría: primero los más caros, así se ve qué pesa
    for (const fila of filas) fila.items.sort((a, b) => Number(b.amount) - Number(a.amount))
    return { filas, total, max: filas[0]?.monto ?? 0 }
  }, [gastos])

  if (resumen.total === 0) return null

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Resumen del mes</h2>
        <p className="money font-display text-2xl font-bold">{formatARS(resumen.total)}</p>
      </div>
      {comparativa && (
        <p className={`money mt-1 text-base font-medium ${comparativa.color}`}>
          {comparativa.texto}
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {resumen.filas.map((fila) => {
          const Icon = categoryIcon(fila.icon)
          const pct = Math.round((fila.monto / resumen.total) * 100)
          const desplegada = abierta === fila.key
          // Con tope (y sólo en el mes actual): barra según consumo del tope,
          // coloreada verde/ámbar/rojo. Sin tope: barra relativa a la categoría
          // más grande del mes, en rojo, como referencia visual.
          const tope = mostrarTopes && fila.categoryId ? budgets[fila.categoryId] : undefined
          const pctTope = tope ? Math.round((fila.monto / tope) * 100) : null
          const color =
            pctTope == null
              ? 'bg-alert'
              : pctTope > 100
                ? 'bg-alert'
                : pctTope >= 80
                  ? 'bg-amber'
                  : 'bg-leaf'
          const ancho =
            tope
              ? Math.min((fila.monto / tope) * 100, 100)
              : (fila.monto / resumen.max) * 100
          return (
            <li key={fila.key}>
              <button
                type="button"
                onClick={() => setAbierta(desplegada ? null : fila.key)}
                aria-expanded={desplegada}
                aria-label={`Ver los movimientos de ${fila.nombre}`}
                className="tap block w-full text-left"
              >
                <div className="flex items-center justify-between gap-2 text-base">
                  <span className="flex min-w-0 items-center gap-2 font-bold">
                    <Icon size={18} aria-hidden="true" className="shrink-0 text-ink-soft" />
                    <span className="truncate">{fila.nombre}</span>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={`shrink-0 text-ink-soft transition-transform ${desplegada ? 'rotate-180' : ''}`}
                    />
                  </span>
                  <span className="money shrink-0 text-ink-soft">
                    {formatARS(fila.monto)} · {pct}%
                  </span>
                </div>
                <div
                  className="mt-1 h-3 w-full overflow-hidden rounded-full bg-paper"
                  role="img"
                  aria-label={
                    tope
                      ? `${fila.nombre}: ${formatARS(fila.monto)} de ${formatARS(tope)} de tope`
                      : `${fila.nombre}: ${pct}% del gasto del mes`
                  }
                >
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${Math.max(ancho, 4)}%` }}
                  />
                </div>
                {tope && (
                  <p
                    className={`money mt-0.5 text-sm font-medium ${
                      pctTope > 100 ? 'text-alert-deep' : 'text-ink-soft'
                    }`}
                  >
                    {pctTope > 100
                      ? `Te pasaste ${formatARS(fila.monto - tope)} del tope de ${formatARS(tope)}`
                      : `${formatARS(fila.monto)} de ${formatARS(tope)} · queda ${formatARS(tope - fila.monto)}`}
                  </p>
                )}
              </button>

              {/* Los movimientos que suman el total de la categoría */}
              {desplegada && (
                <ul className="mt-2 space-y-1 border-l-2 border-line pl-4">
                  {fila.items.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-baseline justify-between gap-2 text-base"
                    >
                      <span className="min-w-0 truncate text-ink-soft">
                        {t.esCuota
                          ? `${t.description} · ${t.cuotaLabel}`
                          : `${formatShortDate(t.date)} · ${t.description}`}
                      </span>
                      <span className="money shrink-0 font-medium">{formatARS(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
