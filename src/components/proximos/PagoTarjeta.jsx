import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { useCardCharges } from '../../hooks/useCardCharges'
import { useWallets } from '../../hooks/useWallets'
import { formatARS } from '../../lib/format'
import { monthLabel } from '../../lib/dates'

/* Cierre mensual: ¿pagaste el resumen de la tarjeta? */
export default function PagoTarjeta() {
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
