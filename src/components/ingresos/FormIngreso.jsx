import { useState } from 'react'
import { BotonesForm, CampoMonto, CampoTexto, MensajeError } from '../ui/FormPiezas'
import { parseARSInput } from '../../lib/format'
import { monthLabel } from '../../lib/dates'

/**
 * Alta de un ingreso con nombre para un mes dado: monto y si se repite todos
 * los meses (sueldo) o cuenta solo ese mes (puntual). Lo usan la proyección
 * de Próximos y el "disponible por día" del Inicio.
 */
export default function FormIngreso({ mes, onAdd, onClose }) {
  const [descripcion, setDescripcion] = useState('')
  const [montoStr, setMontoStr] = useState('')
  const [repetir, setRepetir] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const monto = parseARSInput(montoStr)
    if (!descripcion.trim()) return setError('Poné de qué es el ingreso (ej: Sueldo Yami).')
    if (!(monto > 0)) return setError('Poné cuánta plata entra.')

    setGuardando(true)
    setError('')
    const { error } = await onAdd({
      description: descripcion,
      amount: monto,
      startMonth: mes,
      repeats: repetir,
    })
    setGuardando(false)
    if (error) return setError('No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <CampoTexto
        label="¿Qué ingreso es?"
        value={descripcion}
        onChange={setDescripcion}
        placeholder="Ej: Sueldo Yami, Plata que debía Nico"
        autoFocus
      />
      <CampoMonto
        label={`¿Cuánta plata entra en ${monthLabel(mes)}?`}
        value={montoStr}
        onChange={setMontoStr}
      />
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={repetir}
          onChange={(e) => setRepetir(e.target.checked)}
          className="h-6 w-6 accent-ink"
        />
        <span className="text-base font-medium">
          Se repite todos los meses (sueldo, jubilación…)
        </span>
      </label>
      {!repetir && (
        <p className="text-sm text-ink-soft">
          Va a contar solo en {monthLabel(mes, { withYear: true })}.
        </p>
      )}

      <MensajeError>{error}</MensajeError>

      <BotonesForm
        etiqueta="Guardar ingreso"
        guardando={guardando}
        onGuardar={guardar}
        onCancelar={onClose}
        tono="bg-ink"
      />
    </div>
  )
}
