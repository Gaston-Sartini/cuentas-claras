import { useMemo, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { useCardCharges } from '../../hooks/useCardCharges'
import { useWallets } from '../../hooks/useWallets'
import { installmentDueInMonth, useInstallments } from '../../hooks/useInstallments'
import { formatARS } from '../../lib/format'
import { monthLabel } from '../../lib/dates'

/**
 * Cierre mensual: ¿pagaste el resumen de la tarjeta? Una familia con varias
 * tarjetas paga un resumen hoy y el otro después, así que cada una tiene su
 * monto y su botón, y abajo queda el "pagué todas" para el caso simple.
 *
 * El monto de cada fila es lo que se marca como pagado (las compras). Las
 * cuotas que vencen el mismo mes vienen en el mismo resumen del banco pero
 * son proyección: se muestran al lado para poder cuadrar contra el resumen
 * de verdad, y no se tocan al marcar.
 */
export default function PagoTarjeta() {
  const { dueMonths, dueTotal, dueCards, settleDue } = useCardCharges()
  const { wallets } = useWallets()
  const { installments } = useInstallments()
  const banco = wallets.find((w) => w.type === 'bank')
  const [descontarBanco, setDescontarBanco] = useState(true)
  const [pagando, setPagando] = useState(null) // key de la tarjeta, o 'todas'
  const [error, setError] = useState('')

  // Cuotas que vencen en los mismos meses, por tarjeta (sólo informativo)
  const cuotasPorTarjeta = useMemo(() => {
    const acc = {}
    for (const inst of installments) {
      for (const mes of dueMonths) {
        if (!installmentDueInMonth(inst, mes)) continue
        const clave = inst.payment_method_id ?? `legacy:${inst.payment_method}`
        acc[clave] = (acc[clave] ?? 0) + Number(inst.amount_per_installment)
      }
    }
    return acc
  }, [installments, dueMonths])

  if (dueTotal <= 0) return null

  const pagar = async (card) => {
    setPagando(card?.key ?? 'todas')
    setError('')
    const { error } = await settleDue(descontarBanco ? banco?.id : null, {
      methodId: card?.methodId ?? null,
      months: card?.months ?? dueMonths,
    })
    setPagando(null)
    if (error) setError('No se pudo registrar el pago. Probá de nuevo.')
  }

  const unaSola = dueCards.length === 1

  return (
    <div className="rounded-2xl border-2 border-alert bg-alert/10 p-4">
      <div className="flex items-center gap-2">
        <CreditCard size={24} aria-hidden="true" className="text-alert-deep" />
        <h2 className="text-lg font-bold text-alert-deep">
          {unaSola ? 'Tarjeta' : 'Tarjetas'} de{' '}
          {dueMonths.map((m) => monthLabel(m)).join(' y ')}
        </h2>
      </div>
      <p className="money mt-1 font-display text-3xl font-bold text-alert-deep">
        {formatARS(dueTotal)}
      </p>
      <p className="mt-1 text-base text-ink-soft">
        {unaSola
          ? 'Es el resumen que vence este mes. Cuando lo pagues, marcalo acá.'
          : 'Son los resúmenes que vencen este mes. Marcá cada uno cuando lo pagues.'}
      </p>

      <ul className="mt-3 space-y-2">
        {dueCards.map((card) => {
          const cuotas = cuotasPorTarjeta[card.key] ?? 0
          const trabajando = pagando === card.key
          return (
            <li
              key={card.key}
              className="rounded-xl border-2 border-alert/40 bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-lg font-bold">{card.name}</p>
                <p className="money shrink-0 text-lg font-bold">{formatARS(card.total)}</p>
              </div>
              {cuotas > 0 && (
                <p className="money mt-0.5 text-sm text-ink-soft">
                  En el mismo resumen vienen {formatARS(cuotas)} de cuotas: el banco te
                  va a debitar {formatARS(card.total + cuotas)}.
                </p>
              )}
              <button
                type="button"
                onClick={() => pagar(card)}
                disabled={pagando !== null || !card.methodId}
                className="tap mt-2 w-full rounded-xl bg-ink px-4 py-2 text-base font-bold text-white disabled:opacity-60"
              >
                {trabajando ? 'Registrando…' : `Ya pagué ${card.name}`}
              </button>
              {!card.methodId && (
                <p className="mt-1 text-sm text-ink-soft">
                  Esta tarjeta es de una carga vieja: se marca con el botón de abajo.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {banco && (
        <label className="mt-3 flex items-center gap-3">
          <input
            type="checkbox"
            checked={descontarBanco}
            onChange={(e) => setDescontarBanco(e.target.checked)}
            className="h-6 w-6 accent-ink"
          />
          <span className="text-base font-medium">
            Descontar del {banco.name} lo que marque como pagado
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-2 text-base font-bold text-alert-deep">{error}</p>
      )}

      {!unaSola && (
        <button
          type="button"
          onClick={() => pagar(null)}
          disabled={pagando !== null}
          className="tap mt-3 w-full rounded-xl border-2 border-ink px-4 py-3 text-lg font-bold text-ink disabled:opacity-60"
        >
          {pagando === 'todas' ? 'Registrando…' : `Ya las pagué todas (${formatARS(dueTotal)})`}
        </button>
      )}
    </div>
  )
}
