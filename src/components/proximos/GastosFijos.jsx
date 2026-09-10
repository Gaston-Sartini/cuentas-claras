import { useState } from 'react'
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import EditarInline from '../EditarInline'
import {
  BotonesForm, BotonIcono, CampoEntero, CampoMonto, CampoTexto, INPUT_CLS, MensajeError,
} from '../ui/FormPiezas'
import { useCategories } from '../../hooks/useCategories'
import { usePaymentMethods } from '../../hooks/usePaymentMethods'
import { recurringActiveInMonth, useRecurringExpenses } from '../../hooks/useRecurringExpenses'
import { formatARS, parseARSInput } from '../../lib/format'
import { monthStartISO } from '../../lib/dates'

function FormFijo({ onAdd, onClose }) {
  const { categories } = useCategories()
  const { methods } = usePaymentMethods()
  const [descripcion, setDescripcion] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [metodoId, setMetodoId] = useState('')
  const [diaStr, setDiaStr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const monto = parseARSInput(montoStr)
    const dia = diaStr ? Number(diaStr) : null
    if (!descripcion.trim()) return setError('Poné qué es (ej: Expensas).')
    if (!(monto > 0)) return setError('Poné cuánto viene por mes.')
    if (dia != null && !(dia >= 1 && dia <= 31))
      return setError('El día de vencimiento va de 1 a 31 (o dejalo vacío).')

    setGuardando(true)
    setError('')
    const { error } = await onAdd({
      description: descripcion,
      amount: monto,
      categoryId: categoriaId || null,
      methodId: metodoId || null,
      dueDay: dia,
    })
    setGuardando(false)
    if (error) return setError('No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <CampoTexto
        label="¿Qué es?"
        value={descripcion}
        onChange={setDescripcion}
        placeholder="Ej: Expensas, Alquiler, Luz"
      />
      <CampoMonto label="$ por mes" value={montoStr} onChange={setMontoStr} />
      <div className="grid grid-cols-2 gap-2">
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
          <span className="mb-1 block text-base font-bold">¿Cómo se paga?</span>
          <select
            className={INPUT_CLS}
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

      <CampoEntero
        label="¿Qué día vence? (opcional)"
        value={diaStr}
        onChange={setDiaStr}
        placeholder="Ej: 5"
        ayuda="Con el día cargado, el Inicio te avisa antes de que venza."
      />

      <MensajeError>{error}</MensajeError>

      <BotonesForm
        etiqueta="Guardar gasto fijo"
        guardando={guardando}
        onGuardar={guardar}
        onCancelar={onClose}
      />
    </div>
  )
}

/**
 * Radar de suscripciones: el costo anualizado de los fijos vigentes. Ver
 * "$49.000/mes" como "$588.000 al año" es lo que empuja a dar de baja lo
 * que ya no se usa.
 */
function RadarSuscripciones({ recurring }) {
  const mesActual = monthStartISO()
  const vigentes = recurring.filter((r) => recurringActiveInMonth(r, mesActual))
  const total = vigentes.reduce((sum, r) => sum + Number(r.amount), 0)
  if (total === 0) return null

  const servicios = vigentes
    .filter((r) => r.categories?.name === 'Servicios')
    .reduce((sum, r) => sum + Number(r.amount), 0)

  return (
    <div className="mt-3 rounded-2xl border-2 border-line bg-paper p-4 text-base">
      <p className="money font-bold">
        Todos los fijos juntos: {formatARS(total)}/mes → {formatARS(total * 12)} al año
      </p>
      {servicios > 0 && (
        <p className="money mt-1 text-ink-soft">
          Solo servicios y suscripciones: {formatARS(servicios)}/mes →{' '}
          <strong className="text-ink">{formatARS(servicios * 12)} al año</strong>.
          ¿Hay alguno que ya no usen?
        </p>
      )}
    </div>
  )
}

export default function GastosFijos() {
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
        <>
        <ul className="mt-3 divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
          {recurring.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{r.description}</p>
                  <p className="text-base text-ink-soft">
                    Todos los meses
                    {r.due_day && <> · vence el {r.due_day}</>}
                    {r.categories?.name && <> · {r.categories.name}</>}
                    {r.payment_methods?.name && <> · {r.payment_methods.name}</>}
                  </p>
                </div>
                <p className="money shrink-0 text-lg font-bold">{formatARS(r.amount)}</p>
                <BotonIcono
                  onClick={() => setEditando(editando === r.id ? null : r.id)}
                  label={`Editar ${r.description}`}
                >
                  <Pencil size={20} aria-hidden="true" />
                </BotonIcono>
                <BotonIcono
                  onClick={() => borrar(r)}
                  label={`Borrar gasto fijo ${r.description}`}
                >
                  <Trash2 size={20} aria-hidden="true" />
                </BotonIcono>
              </div>
              {editando === r.id && (
                <EditarInline
                  campos={[
                    { key: 'description', label: '¿Qué es?', tipo: 'texto', valor: r.description },
                    { key: 'amount', label: '$ por mes', tipo: 'monto', valor: Math.round(Number(r.amount)) },
                    { key: 'due_day', label: 'Día de vencimiento (1 a 31, vacío = sin aviso)', tipo: 'entero', opcional: true, min: 1, max: 31, valor: r.due_day },
                  ]}
                  onSave={(valores) => updateRecurring(r.id, valores)}
                  onClose={() => setEditando(null)}
                />
              )}
            </li>
          ))}
        </ul>
        <RadarSuscripciones recurring={recurring} />
        </>
      )}
    </SeccionPlegable>
  )
}
