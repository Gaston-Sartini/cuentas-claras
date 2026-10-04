import { useMemo, useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { CampoMonto, INPUT_CLS, MensajeError } from '../ui/FormPiezas'
import { formatARS, parseARSInput } from '../../lib/format'

/**
 * Pasar plata de una cuenta a otra: sacar del cajero (Banco -> Efectivo),
 * mandarse plata entre bancos, cargar la billetera virtual. Es un movimiento
 * neutro, no un gasto: la RPC transfer_between_wallets lo hace atómico y deja
 * anotado el movimiento.
 *
 * Arranca con Banco -> Efectivo porque es el caso de todos los días, pero
 * cualquier par se puede elegir.
 */
export default function TransferirPlata({ wallets, onTransfer }) {
  const sugeridoDesde = useMemo(
    () => wallets.find((w) => w.type === 'bank')?.id ?? wallets[0]?.id ?? '',
    [wallets]
  )
  const sugeridoHacia = useMemo(
    () => wallets.find((w) => w.type === 'cash')?.id ?? wallets[1]?.id ?? '',
    [wallets]
  )

  const [desdeElegido, setDesdeElegido] = useState(null)
  const [haciaElegido, setHaciaElegido] = useState(null)
  const desdeId = desdeElegido ?? sugeridoDesde
  const haciaId = haciaElegido ?? sugeridoHacia

  const [montoStr, setMontoStr] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const desde = wallets.find((w) => w.id === desdeId)
  const hacia = wallets.find((w) => w.id === haciaId)
  const monto = parseARSInput(montoStr)

  if (wallets.length < 2) return null

  const pasar = async () => {
    setError('')
    setOk('')
    if (!desde || !hacia) return setError('Elegí las dos cuentas.')
    if (desdeId === haciaId) return setError('Elegí dos cuentas distintas.')
    if (!(monto > 0)) return setError('Poné cuánto querés pasar.')

    setTrabajando(true)
    const { error } = await onTransfer(
      desdeId,
      haciaId,
      monto,
      `De ${desde.name} a ${hacia.name}`
    )
    setTrabajando(false)
    if (error) return setError('No se pudo registrar. Probá de nuevo.')

    setMontoStr('')
    setOk(`Listo: ${formatARS(monto)} pasaron de ${desde.name} a ${hacia.name}.`)
    setTimeout(() => setOk(''), 4000)
  }

  const opciones = (excluir) =>
    wallets.map((w) => (
      <option key={w.id} value={w.id} disabled={w.id === excluir}>
        {w.name}
      </option>
    ))

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <ArrowRightLeft size={24} aria-hidden="true" />
        <h2 className="text-lg font-bold">Pasar plata de una cuenta a otra</h2>
      </div>
      <p className="mt-1 text-base text-ink-soft">
        Sacaste del cajero, te pasaste plata entre cuentas o cargaste la billetera
        virtual. No cuenta como gasto: la plata sigue siendo tuya.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-base font-bold">De</span>
          <select
            className={INPUT_CLS}
            value={desdeId}
            onChange={(e) => setDesdeElegido(e.target.value)}
          >
            {opciones(haciaId)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-base font-bold">Para</span>
          <select
            className={INPUT_CLS}
            value={haciaId}
            onChange={(e) => setHaciaElegido(e.target.value)}
          >
            {opciones(desdeId)}
          </select>
        </label>
      </div>

      <div className="mt-2">
        <CampoMonto label="¿Cuánto?" value={montoStr} onChange={setMontoStr} />
      </div>

      {monto > 0 && desde && hacia && desdeId !== haciaId && (
        <p className="money mt-2 text-sm text-ink-soft">
          {desde.name}: {formatARS(desde.current_balance)} →{' '}
          {formatARS(Number(desde.current_balance) - monto)} · {hacia.name}:{' '}
          {formatARS(hacia.current_balance)} →{' '}
          {formatARS(Number(hacia.current_balance) + monto)}
        </p>
      )}

      <div className="mt-3">
        <MensajeError>{error}</MensajeError>
      </div>

      {ok && (
        <p
          role="status"
          className="mt-2 rounded-xl border-2 border-leaf bg-leaf/10 px-4 py-3 text-base font-medium text-leaf"
        >
          {ok}
        </p>
      )}

      {/* Un solo botón: el formulario está siempre a la vista, no hay nada
          que cancelar. */}
      <button
        type="button"
        onClick={pasar}
        disabled={trabajando}
        className="tap mt-3 w-full rounded-xl bg-ink px-4 py-3 text-lg font-bold text-white disabled:opacity-60"
      >
        {trabajando ? 'Registrando…' : 'Pasar la plata'}
      </button>
    </div>
  )
}
