import { useCategoryBudgets } from '../../hooks/useCategoryBudgets'
import { useCategorySpending } from '../../hooks/useCategorySpending'
import { formatARS } from '../../lib/format'
import { monthStartISO } from '../../lib/dates'

/**
 * Freno de presupuesto ANTES de guardar: si la categoría elegida tiene tope,
 * avisa en vivo cuánto va consumido este mes y si este gasto se pasa.
 * Verde (queda margen) → ámbar (80% o más) → rojo (se pasa).
 */
export default function AvisoTope({ categoriaId, categoriaNombre, monto }) {
  const { budgets } = useCategoryBudgets()
  const { porCategoria } = useCategorySpending(monthStartISO())

  const tope = categoriaId ? budgets[categoriaId] : undefined
  if (!tope || !(monto > 0)) return null

  const gastado = porCategoria[categoriaId] ?? 0
  const nuevo = gastado + monto
  const pct = Math.round((nuevo / tope) * 100)

  if (nuevo > tope) {
    return (
      <p
        role="alert"
        className="money mt-2 rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep"
      >
        Ojo: con este gasto te pasás <strong>{formatARS(nuevo - tope)}</strong> del
        tope de {categoriaNombre} ({formatARS(tope)} por mes). Ya iban {formatARS(gastado)}.
      </p>
    )
  }

  if (pct >= 80) {
    return (
      <p className="money mt-2 rounded-xl border-2 border-amber bg-amber/10 px-4 py-3 text-base font-medium text-amber">
        Con este gasto vas al {pct}% del tope de {categoriaNombre}: quedan{' '}
        {formatARS(tope - nuevo)} para el resto del mes.
      </p>
    )
  }

  return (
    <p className="money mt-2 text-base font-medium text-leaf">
      Tope de {categoriaNombre}: con este gasto quedan {formatARS(tope - nuevo)}.
    </p>
  )
}
