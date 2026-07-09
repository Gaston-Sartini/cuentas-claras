import { useNextMonthProjection } from '../../hooks/useNextMonthProjection'
import { formatARS } from '../../lib/format'
import { nextMonthName } from '../../lib/dates'

export default function NextMonthBanner() {
  const { projection, loading } = useNextMonthProjection()

  return (
    <header className="sticky top-0 z-40">
      <div
        role="status"
        aria-live="polite"
        className="bg-alert text-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      >
        <div className="mx-auto flex w-full max-w-lg items-end justify-between gap-3">
          <div>
            <p className="text-[15px] font-medium uppercase tracking-wide text-white/85">
              A pagar en {nextMonthName()}
            </p>
            <p className="money font-display text-4xl font-bold leading-tight">
              {loading ? '· · ·' : formatARS(projection?.total)}
            </p>
          </div>
          <div className="money pb-1 text-right text-[14px] leading-snug text-white/85">
            <p>Tarjetas {loading ? '—' : formatARS(projection?.card_charges)}</p>
            <p>Cuotas {loading ? '—' : formatARS(projection?.installment_charges)}</p>
            <p>Fijos {loading ? '—' : formatARS(projection?.recurring_charges)}</p>
          </div>
        </div>
      </div>

      {/* Borde dentado tipo ticket: la firma visual del banner */}
      <svg className="block w-full" height="8" aria-hidden="true">
        <defs>
          <pattern id="ticket-zigzag" width="14" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 0 L7 8 L14 0 Z" fill="var(--color-alert)" />
          </pattern>
        </defs>
        <rect width="100%" height="8" fill="url(#ticket-zigzag)" />
      </svg>
    </header>
  )
}
