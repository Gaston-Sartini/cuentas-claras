import { useMemo, useState } from 'react'
import { CalendarClock, ChevronDown, CreditCard, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import EditarInline from '../components/EditarInline'
import { useWallets } from '../hooks/useWallets'
import { useCardCharges } from '../hooks/useCardCharges'
import { useIncomeProjections } from '../hooks/useIncomeProjections'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import { useCategories } from '../hooks/useCategories'
import {
  recurringActiveInMonth,
  useRecurringExpenses,
} from '../hooks/useRecurringExpenses'
import {
  installmentDueInMonth,
  installmentLastMonth,
  useInstallments,
} from '../hooks/useInstallments'
import { methodLabel } from '../lib/icons'
import { formatARS, parseARSInput } from '../lib/format'
import { addMonthsISO, monthLabel, monthStartISO, nextMonthName } from '../lib/dates'

const MESES_PROYECTADOS = 6

/**
 * Sección con título tocable para plegar/desplegar. El estado queda guardado
 * en el teléfono (localStorage), así cada uno arma su pantalla de Próximos.
 */
function SeccionPlegable({ id, titulo, icono: Icono, accion, children }) {
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

/* --- Cierre mensual: ¿pagaste el resumen de la tarjeta? --- */
function PagoTarjeta() {
  const { dueMonths, dueTotal, settleDue } = useCardCharges()
  const { wallets } = useWallets()
  const banco = wallets.find((w) => w.type === 'bank')
  const [descontarBanco, setDescontarBanco] = useState(true)
  const [pagando, setPagando] = useState(false)
  const [error, setError] = useState('')

  if (dueTotal <= 0) return null

  const pagar = async () => {
    setPagando(true)
    setError('')
    const { error } = await settleDue(descontarBanco ? banco?.id : null)
    setPagando(false)
    if (error) setError('No se pudo registrar el pago. Probá de nuevo.')
  }

  return (
    <div className="rounded-2xl border-2 border-alert bg-alert/10 p-4">
      <div className="flex items-center gap-2">
        <CreditCard size={24} aria-hidden="true" className="text-alert-deep" />
        <h2 className="text-lg font-bold text-alert-deep">
          Tarjeta de {dueMonths.map((m) => monthLabel(m)).join(' y ')}
        </h2>
      </div>
      <p className="money mt-1 font-display text-3xl font-bold text-alert-deep">
        {formatARS(dueTotal)}
      </p>
      <p className="mt-1 text-base text-ink-soft">
        Es el resumen que vence este mes. Cuando lo pagues, marcalo acá.
      </p>

      {banco && (
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            checked={descontarBanco}
            onChange={(e) => setDescontarBanco(e.target.checked)}
            className="h-6 w-6 accent-ink"
          />
          <span className="text-base font-medium">
            Descontar {formatARS(dueTotal)} del Banco
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-2 text-base font-bold text-alert-deep">{error}</p>
      )}

      <button
        type="button"
        onClick={pagar}
        disabled={pagando}
        className="tap mt-3 w-full rounded-xl bg-ink px-4 py-3 text-lg font-bold text-white disabled:opacity-60"
      >
        {pagando ? 'Registrando…' : 'Ya la pagué'}
      </button>
    </div>
  )
}

/* --- Cuotas --- */
function FormCuotas({ creditMethods, onAdd, onClose }) {
  const { categories } = useCategories()
  const [descripcion, setDescripcion] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [total, setTotal] = useState('')
  const [proxima, setProxima] = useState('1')
  const [metodoId, setMetodoId] = useState(creditMethods[0]?.id ?? null)
  const [categoriaId, setCategoriaId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const monto = parseARSInput(montoStr)
    const nTotal = Number(total)
    const nProx = Number(proxima)
    if (!descripcion.trim()) return setError('Poné qué compraste.')
    if (!(monto > 0)) return setError('Poné cuánto sale cada cuota.')
    if (!(nTotal >= 1 && nTotal <= 120)) return setError('¿En cuántas cuotas? (1 a 120)')
    if (!(nProx >= 1 && nProx <= nTotal)) return setError(`La próxima cuota va de 1 a ${nTotal}.`)
    if (!metodoId) return setError('Elegí con qué tarjeta es.')

    setGuardando(true)
    setError('')
    const { error } = await onAdd({
      description: descripcion,
      amountPer: monto,
      total: nTotal,
      dueNextMonth: nProx,
      methodId: metodoId,
      categoryId: categoriaId || null,
    })
    setGuardando(false)
    if (error) return setError('No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Qué compraste?</span>
        <input
          className="tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Heladera"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-base font-bold">$ por cuota</span>
          <input
            className="money tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
            inputMode="numeric"
            value={montoStr}
            onChange={(e) => setMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-base font-bold">¿Cuántas cuotas?</span>
          <input
            className="money tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value.replace(/\D/g, ''))}
            placeholder="6"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-base font-bold">
          ¿Qué cuota te llega en {nextMonthName()}?
        </span>
        <input
          className="money tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
          inputMode="numeric"
          value={proxima}
          onChange={(e) => setProxima(e.target.value.replace(/\D/g, ''))}
        />
        <span className="mt-1 block text-sm text-ink-soft">
          Si es una compra nueva, dejá 1.
        </span>
      </label>

      <div>
        <span className="mb-1 block text-base font-bold">¿Con qué tarjeta?</span>
        <div className="grid grid-cols-2 gap-2">
          {creditMethods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetodoId(m.id)}
              className={`tap rounded-xl border-2 px-3 py-3 text-base font-bold ${
                metodoId === m.id ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'
              }`}
            >
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          ¿Falta una tarjeta? Se agrega desde "Cargar un gasto" → Otro.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-base font-bold">Categoría</span>
        <select
          className="tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
        >
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
          className="tap flex-1 rounded-xl bg-leaf px-4 py-3 text-lg font-bold text-white disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar cuotas'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="tap rounded-xl border-2 border-line px-4 py-3 text-lg font-bold text-ink-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Cuotas() {
  const { installments, loading, addInstallment, updateInstallment, removeInstallment } =
    useInstallments()
  const { methods } = usePaymentMethods()
  const creditMethods = useMemo(() => methods.filter((m) => m.kind === 'credit'), [methods])
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState(null) // id en edición
  const proximoMes = addMonthsISO(monthStartISO(), 1)

  // Activos = todavía queda alguna cuota por pagar desde el mes que viene.
  const activos = useMemo(
    () => installments.filter((i) => installmentLastMonth(i) >= proximoMes),
    [installments, proximoMes]
  )

  const borrar = async (inst) => {
    if (window.confirm(`¿Sacar "${inst.description}" de las cuotas?`)) {
      await removeInstallment(inst.id)
    }
  }

  return (
    <SeccionPlegable
      id="cuotas"
      titulo="Cuotas"
      accion={
        !agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="tap flex items-center gap-2 rounded-xl border-2 border-line bg-card px-4 py-2 text-base font-bold text-ink-soft"
          >
            <Plus size={20} aria-hidden="true" />
            Agregar
          </button>
        )
      }
    >
      {agregando && (
        <FormCuotas
          creditMethods={creditMethods}
          onAdd={addInstallment}
          onClose={() => setAgregando(false)}
        />
      )}

      {loading ? (
        <p className="mt-3 text-base text-ink-soft">Cargando…</p>
      ) : activos.length === 0 ? (
        !agregando && (
          <p className="mt-3 rounded-2xl border-2 border-dashed border-line bg-card px-4 py-6 text-center text-lg text-ink-soft">
            No hay cuotas activas. Si compraste algo en cuotas, cargalo con “Agregar”.
          </p>
        )
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
          {activos.map((inst) => {
            const k = installmentDueInMonth(inst, proximoMes)
            return (
              <li key={inst.id}>
                <div className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{inst.description}</p>
                    <p className="text-base text-ink-soft">
                      {k
                        ? `Cuota ${k} de ${inst.total_installments} en ${nextMonthName()}`
                        : `Arranca en ${monthLabel(monthStartISO(new Date(`${inst.start_date}T00:00:00`)))}`}
                      {methodLabel(inst) && <>{' · '}{methodLabel(inst)}</>}
                    </p>
                  </div>
                  <p className="money shrink-0 text-lg font-bold">
                    {formatARS(inst.amount_per_installment)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditando(editando === inst.id ? null : inst.id)}
                    aria-label={`Editar ${inst.description}`}
                    className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                  >
                    <Pencil size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(inst)}
                    aria-label={`Borrar cuotas de ${inst.description}`}
                    className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </button>
                </div>
                {editando === inst.id && (
                  <EditarInline
                    campos={[
                      { key: 'description', label: '¿Qué es?', tipo: 'texto', valor: inst.description },
                      { key: 'amount_per_installment', label: '$ por cuota', tipo: 'monto', valor: Math.round(Number(inst.amount_per_installment)) },
                    ]}
                    onSave={(valores) => updateInstallment(inst.id, valores)}
                    onClose={() => setEditando(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SeccionPlegable>
  )
}

/* --- Gastos fijos mensuales (alquiler, expensas, luz...) --- */
function FormFijo({ onAdd, onClose }) {
  const { categories } = useCategories()
  const { methods } = usePaymentMethods()
  const [descripcion, setDescripcion] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [metodoId, setMetodoId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const selectCls = 'tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg'

  const guardar = async () => {
    const monto = parseARSInput(montoStr)
    if (!descripcion.trim()) return setError('Poné qué es (ej: Expensas).')
    if (!(monto > 0)) return setError('Poné cuánto viene por mes.')

    setGuardando(true)
    setError('')
    const { error } = await onAdd({
      description: descripcion,
      amount: monto,
      categoryId: categoriaId || null,
      methodId: metodoId || null,
    })
    setGuardando(false)
    if (error) return setError('No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Qué es?</span>
        <input
          className={selectCls}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Expensas, Alquiler, Luz"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-base font-bold">$ por mes</span>
        <input
          className={`money ${selectCls}`}
          inputMode="numeric"
          value={montoStr}
          onChange={(e) => setMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="0"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
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
          <span className="mb-1 block text-base font-bold">¿Cómo se paga?</span>
          <select
            className={selectCls}
            value={metodoId}
            onChange={(e) => setMetodoId(e.target.value)}
          >
            <option value="">No sé aún</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
      </div>

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
          className="tap flex-1 rounded-xl bg-leaf px-4 py-3 text-lg font-bold text-white disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar gasto fijo'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="tap rounded-xl border-2 border-line px-4 py-3 text-lg font-bold text-ink-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function GastosFijos() {
  const { recurring, loading, addRecurring, updateRecurring, removeRecurring } =
    useRecurringExpenses()
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState(null) // id en edición

  const borrar = async (r) => {
    if (window.confirm(`¿Sacar "${r.description}" de los gastos fijos?`)) {
      await removeRecurring(r.id)
    }
  }

  return (
    <SeccionPlegable
      id="fijos"
      titulo="Gastos fijos de todos los meses"
      icono={Repeat}
      accion={
        !agregando && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="tap flex items-center gap-2 rounded-xl border-2 border-line bg-card px-4 py-2 text-base font-bold text-ink-soft"
          >
            <Plus size={20} aria-hidden="true" />
            Agregar
          </button>
        )
      }
    >
      {agregando && <FormFijo onAdd={addRecurring} onClose={() => setAgregando(false)} />}

      {loading ? (
        <p className="mt-3 text-base text-ink-soft">Cargando…</p>
      ) : recurring.length === 0 ? (
        !agregando && (
          <p className="mt-3 rounded-2xl border-2 border-dashed border-line bg-card px-4 py-6 text-center text-lg text-ink-soft">
            Expensas, alquiler, luz… lo que viene todos los meses. Cargalo y la
            proyección lo cuenta solo.
          </p>
        )
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
          {recurring.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{r.description}</p>
                  <p className="text-base text-ink-soft">
                    Todos los meses
                    {r.categories?.name && <> · {r.categories.name}</>}
                    {r.payment_methods?.name && <> · {r.payment_methods.name}</>}
                  </p>
                </div>
                <p className="money shrink-0 text-lg font-bold">{formatARS(r.amount)}</p>
                <button
                  type="button"
                  onClick={() => setEditando(editando === r.id ? null : r.id)}
                  aria-label={`Editar ${r.description}`}
                  className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                >
                  <Pencil size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => borrar(r)}
                  aria-label={`Borrar gasto fijo ${r.description}`}
                  className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                >
                  <Trash2 size={20} aria-hidden="true" />
                </button>
              </div>
              {editando === r.id && (
                <EditarInline
                  campos={[
                    { key: 'description', label: '¿Qué es?', tipo: 'texto', valor: r.description },
                    { key: 'amount', label: '$ por mes', tipo: 'monto', valor: Math.round(Number(r.amount)) },
                  ]}
                  onSave={(valores) => updateRecurring(r.id, valores)}
                  onClose={() => setEditando(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </SeccionPlegable>
  )
}

/* --- Ingresos + proyección mes a mes --- */
function EditarIngreso({ mes, actual, onSave, onClose }) {
  const [montoStr, setMontoStr] = useState(actual > 0 ? String(Math.round(actual)) : '')
  const [repetir, setRepetir] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    await onSave(mes, parseARSInput(montoStr), {
      replicateMonths: repetir ? MESES_PROYECTADOS - 1 : 0,
    })
    setGuardando(false)
    onClose()
  }

  return (
    <div className="mt-3 space-y-3 border-t-2 border-line pt-3">
      <label className="block">
        <span className="mb-1 block text-base font-bold">
          ¿Cuánta plata entra en {monthLabel(mes)}?
        </span>
        <div className="flex items-center gap-1 rounded-xl border-2 border-line bg-card px-3">
          <span className="text-lg font-bold text-ink-soft">$</span>
          <input
            className="money tap w-full bg-transparent py-2 text-lg outline-none"
            inputMode="numeric"
            value={montoStr}
            onChange={(e) => setMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
            autoFocus
          />
        </div>
      </label>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={repetir}
          onChange={(e) => setRepetir(e.target.checked)}
          className="h-6 w-6 accent-ink"
        />
        <span className="text-base font-medium">Repetir en los meses que siguen</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="tap flex-1 rounded-xl bg-ink px-4 py-2 text-lg font-bold text-white disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
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

function Proyeccion() {
  const { installments } = useInstallments()
  const { recurring } = useRecurringExpenses()
  const { byMonthCard } = useCardCharges()
  const { incomes, saveIncome } = useIncomeProjections()
  const [editando, setEditando] = useState(null) // mes en edición

  const meses = useMemo(() => {
    const inicio = addMonthsISO(monthStartISO(), 1)
    return Array.from({ length: MESES_PROYECTADOS }, (_, i) => {
      const mes = addMonthsISO(inicio, i)
      // Lo que viene de cada tarjeta ese mes: compras imputadas + cuotas que vencen
      const tarjetas = { ...(byMonthCard[mes] ?? {}) }
      for (const inst of installments) {
        if (!installmentDueInMonth(inst, mes)) continue
        const card = methodLabel(inst) ?? 'Tarjeta'
        tarjetas[card] = (tarjetas[card] ?? 0) + Number(inst.amount_per_installment)
      }
      const detalle = Object.entries(tarjetas).sort((a, b) => b[1] - a[1])
      // Más los gastos fijos vigentes ese mes, ítem por ítem
      for (const r of recurring) {
        if (recurringActiveInMonth(r, mes)) detalle.push([r.description, Number(r.amount)])
      }
      const sale = detalle.reduce((sum, [, v]) => sum + v, 0)
      const entra = incomes[mes] ?? 0
      return { mes, entra, detalle, sale }
    })
  }, [installments, recurring, byMonthCard, incomes])

  return (
    <SeccionPlegable id="proyeccion" titulo="Los próximos meses" icono={CalendarClock}>
      <p className="mt-1 text-base text-ink-soft">
        Lo que ya se sabe de cada mes: la plata que entra y los pagos que vencen.
        Tocá el lápiz para cargar el ingreso.
      </p>

      <ul className="mt-3 space-y-3">
        {meses.map(({ mes, entra, detalle, sale }) => {
          const balance = entra - sale
          return (
            <li key={mes} className="rounded-2xl border-2 border-line bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold capitalize">{monthLabel(mes, { withYear: true })}</h3>
                {entra > 0 && (
                  <p className={`money text-lg font-bold ${balance >= 0 ? 'text-leaf' : 'text-alert-deep'}`}>
                    {balance >= 0 ? 'Quedan' : 'Faltan'} {formatARS(Math.abs(balance))}
                  </p>
                )}
              </div>

              <dl className="money mt-2 space-y-1 text-base">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-soft">Entra</dt>
                  <dd className="flex items-center gap-2 font-bold">
                    {entra > 0 ? formatARS(entra) : <span className="font-medium text-ink-soft">sin cargar</span>}
                    <button
                      type="button"
                      onClick={() => setEditando(editando === mes ? null : mes)}
                      aria-label={`Editar ingreso de ${monthLabel(mes, { withYear: true })}`}
                      className="tap grid place-items-center rounded-xl border-2 border-line px-2 text-ink-soft"
                    >
                      <Pencil size={18} aria-hidden="true" />
                    </button>
                  </dd>
                </div>
                {detalle.map(([card, monto]) => (
                  <div key={card} className="flex justify-between gap-3">
                    <dt className="truncate text-ink-soft">{card}</dt>
                    <dd className="shrink-0 font-bold">−{formatARS(monto)}</dd>
                  </div>
                ))}
                {sale === 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Pagos anotados</dt>
                    <dd className="font-medium text-ink-soft">ninguno</dd>
                  </div>
                )}
              </dl>

              {editando === mes && (
                <EditarIngreso
                  mes={mes}
                  actual={entra}
                  onSave={saveIncome}
                  onClose={() => setEditando(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </SeccionPlegable>
  )
}

export default function Proximos() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Próximos</h1>
      <PagoTarjeta />
      <GastosFijos />
      <Cuotas />
      <Proyeccion />
    </section>
  )
}
