import { useState } from 'react'
import { ChevronDown, CreditCard } from 'lucide-react'
import { useCardStatements } from '../../hooks/useCardStatements'
import { useWallets } from '../../hooks/useWallets'
import { formatARS } from '../../lib/format'
import { formatShortDate, monthLabel } from '../../lib/dates'

/* Un grupo del desglose: "Gastos $X" y abajo los movimientos que lo arman. */
function GrupoDetalle({ titulo, total, items, aclaracion, renderItem }) {
  if (items.length === 0) return null
  return (
    <div className="mt-2">
      <div className="money flex items-baseline justify-between gap-2 text-base font-bold">
        <span>{titulo}</span>
        <span>{formatARS(total)}</span>
      </div>
      {aclaracion && <p className="text-sm text-ink-soft">{aclaracion}</p>}
      <ul className="mt-1 space-y-1 border-l-2 border-line pl-3">
        {items.map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-2 text-base">
            <span className="min-w-0 truncate text-ink-soft">{renderItem(it)}</span>
            <span className="money shrink-0 font-medium">{formatARS(it.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* Una tarjeta: total arriba, y tocando el título se abre el detalle. */
function TarjetaResumen({ resumen, abierta, onAlternar, onPagar, pagando, banco }) {
  const sinCompras = resumen.gastos.total === 0

  return (
    <li className="rounded-xl border-2 border-alert/40 bg-card p-3">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="tap flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={`shrink-0 text-ink-soft transition-transform ${abierta ? '' : '-rotate-90'}`}
          />
          <span className="truncate">{resumen.name}</span>
        </span>
        <span className="money shrink-0 text-lg font-bold">{formatARS(resumen.total)}</span>
      </button>

      {abierta && (
        <div className="mt-1 pl-1">
          <GrupoDetalle
            titulo="Gastos"
            total={resumen.gastos.total}
            items={resumen.gastos.items}
            aclaracion={
              banco ? `Es lo que se descuenta del ${banco.name} al marcar la tarjeta.` : null
            }
            renderItem={(it) => `${formatShortDate(it.date)} · ${it.description}`}
          />
          <GrupoDetalle
            titulo="Cuotas"
            total={resumen.cuotas.total}
            items={resumen.cuotas.items}
            aclaracion="Vienen en el mismo resumen, pero no se descuentan al marcar."
            renderItem={(it) => `${it.description} · ${it.label}`}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onPagar}
        disabled={pagando !== null || !resumen.methodId || sinCompras}
        className="tap mt-2 w-full rounded-xl bg-ink px-4 py-2 text-base font-bold text-white disabled:opacity-60"
      >
        {pagando === resumen.key ? 'Registrando…' : `Ya pagué ${resumen.name}`}
      </button>

      {sinCompras && (
        <p className="mt-1 text-sm text-ink-soft">
          Este mes sólo tiene cuotas: no hay compras nuevas que marcar.
        </p>
      )}
      {!sinCompras && !resumen.methodId && (
        <p className="mt-1 text-sm text-ink-soft">
          Esta tarjeta viene de una carga vieja: se marca con el botón de abajo.
        </p>
      )}
    </li>
  )
}

/**
 * Cierre mensual: ¿pagaste el resumen de la tarjeta? Cada tarjeta muestra el
 * total que va a debitar el banco (compras + cuotas) y, abierta, el detalle
 * de cada parte. El botón marca las compras: las cuotas no tienen estado de
 * pagada, están para poder cuadrar contra el resumen de verdad.
 */
export default function PagoTarjeta() {
  const { statements, dueMonths, dueTotal, totalResumenes, settleDue } = useCardStatements()
  const { wallets } = useWallets()
  const banco = wallets.find((w) => w.type === 'bank')
  const [descontarBanco, setDescontarBanco] = useState(true)
  const [abierta, setAbierta] = useState(null) // key de la tarjeta desplegada
  const [pagando, setPagando] = useState(null) // key de la tarjeta, o 'todas'
  const [error, setError] = useState('')

  if (statements.length === 0) return null

  const pagar = async (resumen) => {
    setPagando(resumen?.key ?? 'todas')
    setError('')
    const { error } = await settleDue(descontarBanco ? banco?.id : null, {
      methodId: resumen?.methodId ?? null,
      months: resumen?.months ?? dueMonths,
    })
    setPagando(null)
    if (error) setError('No se pudo registrar el pago. Probá de nuevo.')
  }

  const unaSola = statements.length === 1

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
        {formatARS(totalResumenes)}
      </p>
      <p className="mt-1 text-base text-ink-soft">
        Es lo que te va a debitar el banco, contando cuotas. Tocá una tarjeta para
        ver el detalle, y marcala cuando la pagues.
      </p>

      <ul className="mt-3 space-y-2">
        {statements.map((resumen) => (
          <TarjetaResumen
            key={resumen.key}
            resumen={resumen}
            banco={banco}
            abierta={abierta === resumen.key}
            onAlternar={() => setAbierta(abierta === resumen.key ? null : resumen.key)}
            onPagar={() => pagar(resumen)}
            pagando={pagando}
          />
        ))}
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
            Descontar del {banco.name} las compras que marque como pagadas
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-2 text-base font-bold text-alert-deep">{error}</p>
      )}

      {!unaSola && dueTotal > 0 && (
        <button
          type="button"
          onClick={() => pagar(null)}
          disabled={pagando !== null}
          className="tap mt-3 w-full rounded-xl border-2 border-ink px-4 py-3 text-lg font-bold text-ink disabled:opacity-60"
        >
          {pagando === 'todas'
            ? 'Registrando…'
            : `Ya las pagué todas (${formatARS(dueTotal)} de compras)`}
        </button>
      )}
    </div>
  )
}
