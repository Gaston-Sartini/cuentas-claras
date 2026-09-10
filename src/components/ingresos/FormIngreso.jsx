import { useState } from 'react'
import {
  BotonesForm, CampoMonto, CampoTexto, INPUT_CLS, MensajeError,
} from '../ui/FormPiezas'
import { useWallets } from '../../hooks/useWallets'
import { parseARSInput } from '../../lib/format'
import { monthLabel } from '../../lib/dates'

// Sugerencia para el destino: la plata suele caer en el banco.
const billeteraSugerida = (wallets) =>
  wallets.find((w) => w.type === 'bank')?.id ?? wallets[0]?.id ?? ''

/**
 * Alta de un ingreso con nombre: monto, a qué billetera entra y si se repite
 * todos los meses (sueldo) o cuenta sólo ese mes (puntual). Lo usan la
 * proyección de Próximos y el "Para gastar" del Inicio.
 */
export default function FormIngreso({ mes, onAdd, onClose }) {
  const { wallets } = useWallets()
  const [descripcion, setDescripcion] = useState('')
  const [montoStr, setMontoStr] = useState('')
  // null = todavía no eligió: se muestra la sugerencia. Las billeteras pueden
  // llegar después del primer render, por eso se resuelve al vuelo.
  const [billeteraElegida, setBilleteraElegida] = useState(null)
  const billeteraId = billeteraElegida ?? billeteraSugerida(wallets)
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
      walletId: billeteraId || null,
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

      <label className="block">
        <span className="mb-1 block text-base font-bold">¿A qué cuenta entra?</span>
        <select
          className={INPUT_CLS}
          value={billeteraId}
          onChange={(e) => setBilleteraElegida(e.target.value)}
        >
          <option value="">Todavía no sé</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <span className="mt-1 block text-sm text-ink-soft">
          Cuando la plata entre, la marcás desde el Inicio y se suma sola a esa
          cuenta.
        </span>
      </label>

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
