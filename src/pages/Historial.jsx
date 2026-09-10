import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import ResumenPorCategoria from '../components/historial/ResumenPorCategoria'
import GastosHormiga from '../components/historial/GastosHormiga'
import Movimiento from '../components/historial/Movimiento'
import { useMonthLedger } from '../hooks/useMonthLedger'
import { installmentDueInMonth, useInstallments } from '../hooks/useInstallments'
import { useCategoryBudgets } from '../hooks/useCategoryBudgets'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import { buildFiltros, cumpleFiltro, FILTRO_TODOS } from '../lib/paymentFilters'
import { methodLabel } from '../lib/icons'
import { formatARS } from '../lib/format'
import { addMonthsISO, monthLabel, monthStartISO } from '../lib/dates'
import { downloadCSV } from '../lib/csv'

export default function Historial() {
  const mesActual = monthStartISO()
  // Si venimos de Inicio con un movimiento elegido, arrancar en su mes contable
  const { state } = useLocation()
  const abrirId = state?.abrir ?? null
  const [mes, setMes] = useState(state?.mes ?? mesActual)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState(FILTRO_TODOS)
  const { transactions, prevMonthTotal, loading, removeTransaction, updateTransaction } =
    useMonthLedger(mes)
  const { installments } = useInstallments()
  const { budgets } = useCategoryBudgets()
  const { methods } = usePaymentMethods()

  // Chips de filtro: por tipo + cada tarjeta/medio de pago de la familia
  const filtros = useMemo(() => buildFiltros(methods), [methods])

  // Cuotas que vencen en el mes visto: entran al resumen y a la lista
  const cuotasDelMes = useMemo(
    () =>
      installments
        .map((inst) => {
          const k = installmentDueInMonth(inst, mes)
          return k
            ? {
                ...inst,
                esCuota: true,
                amount: inst.amount_per_installment,
                cuotaLabel: `Cuota ${k} de ${inst.total_installments}`,
              }
            : null
        })
        .filter(Boolean),
    [installments, mes]
  )

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return [...cuotasDelMes, ...transactions].filter((t) => {
      if (!cumpleFiltro(t, filtro)) return false
      if (!q) return true
      return (
        t.description.toLowerCase().includes(q) ||
        (t.categories?.name ?? '').toLowerCase().includes(q) ||
        (methodLabel(t) ?? '').toLowerCase().includes(q)
      )
    })
  }, [cuotasDelMes, transactions, busqueda, filtro])

  const gastos = useMemo(
    () => visibles.filter((t) => t.esCuota || t.kind === 'expense'),
    [visibles]
  )

  // Todos los gastos del mes (sin filtro ni búsqueda), para el reporte hormiga
  const gastosDelMes = useMemo(
    () => [...cuotasDelMes, ...transactions.filter((t) => t.kind === 'expense')],
    [cuotasDelMes, transactions]
  )

  // Baja el mes completo (todos los movimientos, sin importar filtro/búsqueda)
  const exportar = () => {
    const filas = [...cuotasDelMes, ...transactions].map((t) => {
      const tipo = t.esCuota ? 'Cuota' : t.kind === 'transfer' ? 'Transferencia' : 'Gasto'
      const fecha = t.esCuota ? t.cuotaLabel : t.date
      return [
        fecha,
        t.description,
        t.categories?.name ?? '',
        methodLabel(t) ?? '',
        tipo,
        Number(t.amount).toFixed(2).replace('.', ','),
      ]
    })
    downloadCSV(
      `cuentas-claras-${mes.slice(0, 7)}.csv`,
      ['Fecha', 'Descripción', 'Categoría', 'Medio de pago', 'Tipo', 'Monto'],
      filas
    )
  }

  // Comparativa contra el mes anterior (gastos + cuotas de cada mes)
  const comparativa = useMemo(() => {
    const mesPrevio = addMonthsISO(mes, -1)
    const cuotasPrevias = installments.reduce(
      (sum, inst) =>
        installmentDueInMonth(inst, mesPrevio)
          ? sum + Number(inst.amount_per_installment)
          : sum,
      0
    )
    const totalPrevio = prevMonthTotal + cuotasPrevias
    const totalActual =
      transactions
        .filter((t) => t.kind === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0) +
      cuotasDelMes.reduce((sum, c) => sum + Number(c.amount), 0)

    if (!(totalPrevio > 0) || !(totalActual > 0)) return null
    const pct = Math.round(((totalActual - totalPrevio) / totalPrevio) * 100)
    if (pct === 0) return { texto: `Igual que en ${monthLabel(mesPrevio)}`, color: 'text-ink-soft' }
    return pct > 0
      ? { texto: `${pct}% más que en ${monthLabel(mesPrevio)}`, color: 'text-alert-deep' }
      : { texto: `${-pct}% menos que en ${monthLabel(mesPrevio)}`, color: 'text-leaf' }
  }, [mes, installments, prevMonthTotal, transactions, cuotasDelMes])

  return (
    <section className="space-y-5">
      <h1 className="font-display text-3xl font-semibold">Historial</h1>

      {/* Navegación de meses: el archivo mensual vive acá */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-line bg-card p-2">
        <button
          type="button"
          onClick={() => setMes((m) => addMonthsISO(m, -1))}
          aria-label="Mes anterior"
          className="tap grid place-items-center rounded-xl border-2 border-line px-3"
        >
          <ChevronLeft size={24} />
        </button>
        <p className="text-center text-lg font-bold capitalize">
          {monthLabel(mes, { withYear: true })}
          {mes === mesActual && <span className="block text-sm font-medium text-ink-soft">mes actual</span>}
        </p>
        <button
          type="button"
          onClick={() => setMes((m) => addMonthsISO(m, 1))}
          aria-label="Mes siguiente"
          className="tap grid place-items-center rounded-xl border-2 border-line px-3"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      <ResumenPorCategoria
        gastos={gastos}
        comparativa={comparativa}
        budgets={budgets}
        mostrarTopes={mes === mesActual}
      />

      <GastosHormiga gastos={gastosDelMes} />

      {/* Búsqueda y filtros */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 rounded-2xl border-2 border-line bg-card px-4">
          <Search size={22} aria-hidden="true" className="shrink-0 text-ink-soft" />
          <input
            type="search"
            className="tap w-full bg-transparent py-3 text-lg outline-none"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un gasto…"
            aria-label="Buscar en los movimientos del mes"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por medio de pago">
          {filtros.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`tap rounded-full border-2 px-4 py-2 text-base font-bold ${
                filtro === f.id ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-soft'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Movimientos del mes contable visto */}
      <div>
        <h2 className="text-lg font-bold">Movimientos de {monthLabel(mes, { withYear: true })}</h2>
        <p className="text-sm text-ink-soft">
          La cuenta de este mes: los gastos pagados en el mes, más las cuotas y
          compras con tarjeta que vencen acá. Cambiá de mes con las flechas de
          arriba.
        </p>
      </div>

      {loading ? (
        <p className="text-base text-ink-soft">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line bg-card px-4 py-6 text-center text-lg text-ink-soft">
          {transactions.length === 0 && cuotasDelMes.length === 0
            ? `Nada anotado en ${monthLabel(mes)}.`
            : 'Ningún movimiento coincide con la búsqueda.'}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
          {visibles.map((t) => (
            <Movimiento
              key={t.id}
              t={t}
              onDelete={removeTransaction}
              onUpdate={updateTransaction}
              abiertoInicial={t.id === abrirId}
            />
          ))}
        </ul>
      )}

      {(transactions.length > 0 || cuotasDelMes.length > 0) && (
        <button
          type="button"
          onClick={exportar}
          className="tap flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-4 py-3 text-base font-bold text-ink-soft"
        >
          <Download size={20} aria-hidden="true" />
          Bajar el mes a Excel (CSV)
        </button>
      )}
    </section>
  )
}
