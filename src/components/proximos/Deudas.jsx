import { useState } from 'react'
import { Check, HandCoins, Pencil, Plus } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import EditarInline from '../EditarInline'
import {
  BotonesForm, BotonIcono, CampoMonto, CampoTexto, INPUT_CLS, MensajeError,
} from '../ui/FormPiezas'
import { useDebts } from '../../hooks/useDebts'
import { etiquetaVencimiento } from '../../lib/vencimientos'
import { formatARS, parseARSInput } from '../../lib/format'
import { todayISO } from '../../lib/dates'

function FormDeuda({ onAdd, onClose }) {
  const [descripcion, setDescripcion] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [direccion, setDireccion] = useState('owed_to_us')
  const [vencimiento, setVencimiento] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const monto = parseARSInput(montoStr)
    if (!descripcion.trim()) return setError('Poné quién y qué (ej: "Nico – asado").')
    if (!(monto > 0)) return setError('Poné cuánta plata es.')

    setGuardando(true)
    setError('')
    const { error } = await onAdd({
      description: descripcion,
      amount: monto,
      direction: direccion,
      dueDate: vencimiento || null,
    })
    setGuardando(false)
    if (error) return setError('No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <div>
        <span className="mb-1 block text-base font-bold">¿Qué pasó?</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDireccion('owed_to_us')}
            className={`tap rounded-xl border-2 px-3 py-3 text-base font-bold ${
              direccion === 'owed_to_us'
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-card text-ink'
            }`}
          >
            Me deben
          </button>
          <button
            type="button"
            onClick={() => setDireccion('we_owe')}
            className={`tap rounded-xl border-2 px-3 py-3 text-base font-bold ${
              direccion === 'we_owe'
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-card text-ink'
            }`}
          >
            Debo
          </button>
        </div>
      </div>

      <CampoTexto
        label="¿Quién y qué?"
        value={descripcion}
        onChange={setDescripcion}
        placeholder='Ej: "Nico – plata del asado"'
      />
      <CampoMonto label="¿Cuánto?" value={montoStr} onChange={setMontoStr} />

      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Para cuándo? (opcional)</span>
        <input
          type="date"
          className={INPUT_CLS}
          value={vencimiento}
          onChange={(e) => setVencimiento(e.target.value)}
        />
        <span className="mt-1 block text-sm text-ink-soft">
          Con fecha cargada, el Inicio te lo recuerda antes de que venza.
        </span>
      </label>

      <MensajeError>{error}</MensajeError>

      <BotonesForm
        etiqueta="Guardar deuda"
        guardando={guardando}
        onGuardar={guardar}
        onCancelar={onClose}
      />
    </div>
  )
}

function FilaDeuda({ deuda, onUpdate, onSettle }) {
  const [editando, setEditando] = useState(false)
  const debemos = deuda.direction === 'we_owe'
  const vencida = deuda.due_date && deuda.due_date < todayISO()

  const saldar = () => {
    if (window.confirm(`¿"${deuda.description}" quedó saldada? Sale de la lista.`)) {
      onSettle(deuda.id)
    }
  }

  return (
    <li>
      <div className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{deuda.description}</p>
          <p className={`text-base ${vencida ? 'font-bold text-alert-deep' : 'text-ink-soft'}`}>
            {debemos ? 'Tenés que pagarla' : 'Te la deben'}
            {deuda.due_date && <> · {etiquetaVencimiento(deuda.due_date)}</>}
          </p>
        </div>
        <p className={`money shrink-0 text-lg font-bold ${debemos ? 'text-alert-deep' : 'text-leaf'}`}>
          {debemos ? '−' : '+'}{formatARS(deuda.amount)}
        </p>
        <BotonIcono onClick={saldar} label={`Marcar saldada ${deuda.description}`}>
          <Check size={20} aria-hidden="true" />
        </BotonIcono>
        <BotonIcono
          onClick={() => setEditando((v) => !v)}
          label={`Editar ${deuda.description}`}
        >
          <Pencil size={20} aria-hidden="true" />
        </BotonIcono>
      </div>
      {editando && (
        <EditarInline
          campos={[
            { key: 'description', label: '¿Quién y qué?', tipo: 'texto', valor: deuda.description },
            { key: 'amount', label: '¿Cuánto?', tipo: 'monto', valor: Math.round(Number(deuda.amount)) },
          ]}
          onSave={(valores) => onUpdate(deuda.id, valores)}
          onClose={() => setEditando(false)}
        />
      )}
    </li>
  )
}

/**
 * Deudas y préstamos con nombre: "me deben / debo", con vencimiento opcional.
 * El tilde la marca saldada (queda en la base, sale de la lista). No mueve
 * billeteras: cuando la plata se mueve de verdad, se carga el gasto o ingreso.
 */
export default function Deudas() {
  const { debts, loading, addDebt, updateDebt, settleDebt } = useDebts()
  const [agregando, setAgregando] = useState(false)

  const nosDeben = debts.filter((d) => d.direction === 'owed_to_us')
  const debemos = debts.filter((d) => d.direction === 'we_owe')
  const totalNosDeben = nosDeben.reduce((s, d) => s + Number(d.amount), 0)
  const totalDebemos = debemos.reduce((s, d) => s + Number(d.amount), 0)

  return (
    <SeccionPlegable
      id="deudas"
      titulo="Deudas y préstamos"
      icono={HandCoins}
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
      {agregando && <FormDeuda onAdd={addDebt} onClose={() => setAgregando(false)} />}

      {loading ? (
        <p className="mt-3 text-base text-ink-soft">Cargando…</p>
      ) : debts.length === 0 ? (
        !agregando && (
          <p className="mt-3 rounded-2xl border-2 border-dashed border-line bg-card px-4 py-6 text-center text-lg text-ink-soft">
            ¿Le prestaste plata a alguien o quedaste debiendo? Anotalo acá y no
            se pierde. Cuando se paga, la marcás con el tilde.
          </p>
        )
      ) : (
        <div className="mt-3 space-y-3">
          {nosDeben.length > 0 && (
            <div>
              <p className="money mb-1 text-base font-bold text-leaf">
                Te deben {formatARS(totalNosDeben)}
              </p>
              <ul className="divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
                {nosDeben.map((d) => (
                  <FilaDeuda key={d.id} deuda={d} onUpdate={updateDebt} onSettle={settleDebt} />
                ))}
              </ul>
            </div>
          )}
          {debemos.length > 0 && (
            <div>
              <p className="money mb-1 text-base font-bold text-alert-deep">
                Tenés que pagar {formatARS(totalDebemos)}
              </p>
              <ul className="divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
                {debemos.map((d) => (
                  <FilaDeuda key={d.id} deuda={d} onUpdate={updateDebt} onSettle={settleDebt} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SeccionPlegable>
  )
}
