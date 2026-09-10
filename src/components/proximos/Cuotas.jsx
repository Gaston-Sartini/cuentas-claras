import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import EditarInline from '../EditarInline'
import {
  BotonesForm, BotonIcono, CampoEntero, CampoMonto, CampoTexto, INPUT_CLS, MensajeError,
} from '../ui/FormPiezas'
import { useCategories } from '../../hooks/useCategories'
import { usePaymentMethods } from '../../hooks/usePaymentMethods'
import {
  installmentDueInMonth,
  installmentLastMonth,
  useInstallments,
} from '../../hooks/useInstallments'
import { methodLabel } from '../../lib/icons'
import { formatARS, parseARSInput } from '../../lib/format'
import { addMonthsISO, monthLabel, monthStartISO, nextMonthName } from '../../lib/dates'

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
      <CampoTexto
        label="¿Qué compraste?"
        value={descripcion}
        onChange={setDescripcion}
        placeholder="Ej: Heladera"
      />

      <div className="grid grid-cols-2 gap-2">
        <CampoMonto label="$ por cuota" value={montoStr} onChange={setMontoStr} />
        <CampoEntero
          label="¿Cuántas cuotas?"
          value={total}
          onChange={setTotal}
          placeholder="6"
        />
      </div>

      <CampoEntero
        label={`¿Qué cuota te llega en ${nextMonthName()}?`}
        value={proxima}
        onChange={setProxima}
        ayuda="Si es una compra nueva, dejá 1."
      />

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

      <MensajeError>{error}</MensajeError>

      <BotonesForm
        etiqueta="Guardar cuotas"
        guardando={guardando}
        onGuardar={guardar}
        onCancelar={onClose}
      />
    </div>
  )
}

export default function Cuotas() {
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
                  <BotonIcono
                    onClick={() => setEditando(editando === inst.id ? null : inst.id)}
                    label={`Editar ${inst.description}`}
                  >
                    <Pencil size={20} aria-hidden="true" />
                  </BotonIcono>
                  <BotonIcono
                    onClick={() => borrar(inst)}
                    label={`Borrar cuotas de ${inst.description}`}
                  >
                    <Trash2 size={20} aria-hidden="true" />
                  </BotonIcono>
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
