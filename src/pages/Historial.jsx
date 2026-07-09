import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowRightLeft, CalendarClock, ChevronLeft, ChevronRight, Download, Pencil, Search, Trash2,
} from 'lucide-react'
import { useMonthLedger } from '../hooks/useMonthLedger'
import { installmentDueInMonth, useInstallments } from '../hooks/useInstallments'
import { useCategories } from '../hooks/useCategories'
import { useCategoryBudgets } from '../hooks/useCategoryBudgets'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import { categoryIcon, methodLabel } from '../lib/icons'
import { formatARS, parseARSInput } from '../lib/format'
import { addMonthsISO, formatShortDate, monthLabel, monthStartISO } from '../lib/dates'
import { downloadCSV } from '../lib/csv'

const FILTROS = [
  { id: 'todos', label: 'Todo' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'tarjeta', label: 'Tarjetas' },
]

// Clasifica el movimiento por su método (tabla nueva o enum legacy)
const tipoDeMetodo = (t) => {
  if (t.esCuota) return 'tarjeta'
  if (t.payment_methods) {
    if (t.payment_methods.kind === 'credit') return 'tarjeta'
    return t.payment_methods.wallets?.type === 'cash' ? 'cash' : 'debito'
  }
  if (t.payment_method === 'mastercard' || t.payment_method === 'visa') return 'tarjeta'
  if (t.payment_method === 'cash') return 'cash'
  if (t.payment_method === 'mercadopago') return 'debito'
  return null
}

// Tipo (crédito/débito) del método actual de un gasto, para saber si al
// editarlo hay que re-enrutar el mes contable.
const kindDelGasto = (t) =>
  t.payment_methods?.kind ??
  (t.payment_method === 'mastercard' || t.payment_method === 'visa' ? 'credit' : 'debit')

function ResumenPorCategoria({ gastos, comparativa, budgets, mostrarTopes }) {
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
      }
      item.monto += Number(t.amount)
      total += Number(t.amount)
      porCat.set(key, item)
    }
    const filas = [...porCat.values()].sort((a, b) => b.monto - a.monto)
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
              <div className="flex items-center justify-between gap-2 text-base">
                <span className="flex min-w-0 items-center gap-2 font-bold">
                  <Icon size={18} aria-hidden="true" className="shrink-0 text-ink-soft" />
                  <span className="truncate">{fila.nombre}</span>
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function EditarGasto({ t, onSave, onClose }) {
  const { categories } = useCategories()
  const { methods } = usePaymentMethods()
  const [montoStr, setMontoStr] = useState(String(Math.round(Number(t.amount))))
  const [descripcion, setDescripcion] = useState(t.description)
  const [fecha, setFecha] = useState(t.date)
  const [categoriaId, setCategoriaId] = useState(t.category_id ?? '')
  const [metodoId, setMetodoId] = useState(t.payment_method_id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const monto = parseARSInput(montoStr)
    if (!(monto > 0)) return setError('Poné cuánto fue.')
    if (!metodoId) return setError('Elegí el medio de pago.')

    const metodoNuevo = methods.find((m) => m.id === metodoId)
    const kindViejo = kindDelGasto(t)
    const kindNuevo = metodoNuevo?.kind ?? kindViejo
    const cambioKind = kindNuevo !== kindViejo

    // Mes contable: si cambia el tipo (contado <-> crédito) o la fecha, se
    // recalcula con la misma regla del alta; si no, se respeta el existente.
    const status = cambioKind ? (kindNuevo === 'credit' ? 'next_month' : 'settled') : t.status
    let billing = t.billing_month
    if (cambioKind || fecha !== t.date) {
      const mesFecha = `${fecha.slice(0, 7)}-01`
      billing =
        status === 'next_month'
          ? addMonthsISO(mesFecha, 1)
          : kindNuevo === 'credit'
            ? t.billing_month // tarjeta ya pagada: sigue imputando al mes en que se pagó
            : mesFecha
    }

    setGuardando(true)
    setError('')
    const { error } = await onSave(t.id, {
      amount: monto,
      description: descripcion.trim() || t.description,
      date: fecha,
      category_id: categoriaId || null,
      payment_method_id: metodoId,
      payment_method: null, // el enum legacy deja de aplicar al editar
      status,
      billing_month: billing,
    })
    setGuardando(false)
    if (error) return setError('No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  const selectCls = 'tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg'

  return (
    <div className="mb-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-base font-bold">¿Cuánto?</span>
          <input
            className={`money ${selectCls}`}
            inputMode="numeric"
            value={montoStr}
            onChange={(e) => setMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-base font-bold">Fecha</span>
          <input
            type="date"
            className={selectCls}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Qué fue?</span>
        <input
          className={selectCls}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-base font-bold">Categoría</span>
        <select
          className={selectCls}
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Cómo se pagó?</span>
        <select
          className={selectCls}
          value={metodoId}
          onChange={(e) => setMetodoId(e.target.value)}
        >
          <option value="" disabled>Elegí…</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="tap flex-1 rounded-xl bg-ink px-4 py-2 text-lg font-bold text-white disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="tap rounded-xl border-2 border-line px-4 py-2 text-lg font-bold text-ink-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Movimiento({ t, onDelete, onUpdate, abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const ref = useRef(null)
  const esTransfer = t.kind === 'transfer'

  // Si venimos de Inicio con este movimiento elegido, traerlo a la vista
  useEffect(() => {
    if (abiertoInicial) ref.current?.scrollIntoView({ block: 'center' })
  }, [abiertoInicial])
  const Icon = t.esCuota
    ? CalendarClock
    : esTransfer
      ? ArrowRightLeft
      : categoryIcon(t.categories?.icon)

  const borrar = async () => {
    setBorrando(true)
    await onDelete(t.id)
  }

  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paper">
          <Icon size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{t.description}</p>
          <p className="text-base text-ink-soft">
            {t.esCuota
              ? t.cuotaLabel
              : formatShortDate(t.date)}
            {esTransfer
              ? ' · Transferencia'
              : methodLabel(t) && <> · {methodLabel(t)}</>}
          </p>
        </div>
        <p className={`money text-lg font-bold ${esTransfer ? 'text-ink-soft' : ''}`}>
          {esTransfer ? '' : '−'}{formatARS(t.amount)}
        </p>
      </button>

      {abierto && !editando && (
        <div className="flex items-center justify-between gap-3 pb-3 pl-14">
          <p className="min-w-0 text-base text-ink-soft">
            {t.esCuota
              ? 'Se maneja desde Próximos.'
              : esTransfer
                ? 'Movimiento entre billeteras: no cuenta como gasto.'
                : (
                  <>
                    {t.categories?.name ?? 'Sin categoría'}
                    {t.profiles?.full_name && <> · Cargó {t.profiles.full_name}</>}
                  </>
                )}
          </p>
          {!esTransfer && !t.esCuota && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setEditando(true)}
                aria-label={`Editar ${t.description}`}
                className="tap flex items-center gap-2 rounded-xl border-2 border-line px-4 py-2 text-base font-bold text-ink-soft"
              >
                <Pencil size={18} aria-hidden="true" />
                Editar
              </button>
              <button
                type="button"
                onClick={borrar}
                disabled={borrando}
                className="tap flex items-center gap-2 rounded-xl border-2 border-alert px-4 py-2 text-base font-bold text-alert-deep disabled:opacity-60"
              >
                <Trash2 size={18} aria-hidden="true" />
                {borrando ? '…' : 'Borrar'}
              </button>
            </div>
          )}
        </div>
      )}

      {editando && (
        <EditarGasto
          t={t}
          onSave={onUpdate}
          onClose={() => setEditando(false)}
        />
      )}
    </li>
  )
}

export default function Historial() {
  const mesActual = monthStartISO()
  // Si venimos de Inicio con un movimiento elegido, arrancar en su mes contable
  const { state } = useLocation()
  const abrirId = state?.abrir ?? null
  const [mes, setMes] = useState(state?.mes ?? mesActual)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const { transactions, prevMonthTotal, loading, removeTransaction, updateTransaction } =
    useMonthLedger(mes)
  const { installments } = useInstallments()
  const { budgets } = useCategoryBudgets()

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
      if (filtro !== 'todos' && tipoDeMetodo(t) !== filtro) return false
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
          {FILTROS.map((f) => (
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

      {/* Movimientos */}
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
