import { useEffect, useRef, useState } from 'react'
import { ArrowRightLeft, CalendarClock, Pencil, Trash2 } from 'lucide-react'
import { BotonesForm, CampoMonto, CampoTexto, INPUT_CLS, MensajeError } from '../ui/FormPiezas'
import { useCategories } from '../../hooks/useCategories'
import { usePaymentMethods } from '../../hooks/usePaymentMethods'
import { categoryIcon, methodLabel } from '../../lib/icons'
import { formatARS, parseARSInput } from '../../lib/format'
import { addMonthsISO, formatShortDate } from '../../lib/dates'

// Tipo (crédito/débito) del método actual de un gasto, para saber si al
// editarlo hay que re-enrutar el mes contable.
const kindDelGasto = (t) =>
  t.payment_methods?.kind ??
  (t.payment_method === 'mastercard' || t.payment_method === 'visa' ? 'credit' : 'debit')

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

  return (
    <div className="mb-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <div className="grid grid-cols-2 gap-2">
        <CampoMonto label="¿Cuánto?" value={montoStr} onChange={setMontoStr} />
        <label className="block">
          <span className="mb-1 block text-base font-bold">Fecha</span>
          <input
            type="date"
            className={INPUT_CLS}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
      </div>
      <CampoTexto label="¿Qué fue?" value={descripcion} onChange={setDescripcion} />
      <label className="block">
        <span className="mb-1 block text-base font-bold">Categoría</span>
        <select
          className={INPUT_CLS}
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
          className={INPUT_CLS}
          value={metodoId}
          onChange={(e) => setMetodoId(e.target.value)}
        >
          <option value="" disabled>Elegí…</option>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      <MensajeError>{error}</MensajeError>

      <BotonesForm
        etiqueta="Guardar cambios"
        guardando={guardando}
        onGuardar={guardar}
        onCancelar={onClose}
        tono="bg-ink"
      />
    </div>
  )
}

/**
 * Un movimiento del Historial: fila tocable que abre el detalle con
 * Editar / Borrar (gastos) o la aclaración (cuotas y transferencias).
 */
export default function Movimiento({ t, onDelete, onUpdate, abiertoInicial = false }) {
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
