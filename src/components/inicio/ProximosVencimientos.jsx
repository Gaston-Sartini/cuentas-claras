import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CalendarClock, CreditCard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useRecurringExpenses } from '../../hooks/useRecurringExpenses'
import { useDebts } from '../../hooks/useDebts'
import { useCardCharges } from '../../hooks/useCardCharges'
import { etiquetaVencimiento, vencimientosProximos } from '../../lib/vencimientos'
import {
  activarAvisos,
  avisosActivos,
  avisosRechazados,
  avisosSoportados,
  notificarVencimientos,
} from '../../lib/notifications'
import { pushActivo, suscribirPush } from '../../lib/push'
import { formatARS } from '../../lib/format'
import { monthLabel } from '../../lib/dates'

/**
 * Qué vence en los próximos días: fijos con día de vencimiento, deudas con
 * fecha y el resumen de tarjeta pendiente. Con "Avisarme" el navegador se
 * suscribe a Web Push (el servidor avisa cada mañana, app cerrada); si el
 * push no está disponible, al abrir la app salta el aviso local.
 */
export default function ProximosVencimientos() {
  const { profile } = useAuth()
  const { recurring } = useRecurringExpenses()
  const { debts } = useDebts()
  const { dueMonths, dueTotal } = useCardCharges()
  const [avisos, setAvisos] = useState(() => avisosActivos())
  const [conPush, setConPush] = useState(() => pushActivo())

  const activar = async () => {
    const ok = await activarAvisos()
    setAvisos(ok)
    if (ok) setConPush(await suscribirPush(profile))
  }

  // Permiso dado en otra sesión pero navegador sin suscribir aún: completarla
  useEffect(() => {
    if (avisos && !conPush && profile?.org_id) {
      suscribirPush(profile).then((ok) => ok && setConPush(true))
    }
  }, [avisos, conPush, profile])

  const items = useMemo(
    () => vencimientosProximos({ fijos: recurring, deudas: debts }),
    [recurring, debts]
  )

  // Al abrir la app: notificar lo que vence ya (el dedupe evita repetir)
  useEffect(() => {
    notificarVencimientos(items)
  }, [items])

  if (items.length === 0 && dueTotal <= 0) return null

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <CalendarClock size={22} aria-hidden="true" className="shrink-0" />
          Vencimientos
        </h2>
        {avisosSoportados() &&
          (avisos ? (
            <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-leaf">
              <BellRing size={16} aria-hidden="true" />
              avisos activados
            </span>
          ) : avisosRechazados() ? null : (
            <button
              type="button"
              onClick={activar}
              className="tap shrink-0 rounded-full border-2 border-line bg-paper px-4 py-2 text-sm font-bold text-ink-soft"
            >
              🔔 Avisarme
            </button>
          ))}
      </div>

      <ul className="mt-2 space-y-2 text-base">
        {dueTotal > 0 && (
          <li>
            <Link to="/proximos" className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 font-bold text-alert-deep">
                <CreditCard size={18} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0">
                  Tarjeta de {dueMonths.map((m) => monthLabel(m)).join(' y ')} — está para
                  pagar
                </span>
              </span>
              <span className="money shrink-0 font-bold text-alert-deep">
                {formatARS(dueTotal)}
              </span>
            </Link>
          </li>
        )}
        {items.map((it) => (
          <li key={it.id} className="flex items-baseline justify-between gap-3">
            <span
              className={`min-w-0 truncate ${
                it.vencida ? 'font-bold text-alert-deep' : 'text-ink'
              }`}
            >
              {it.titulo}{' '}
              <span className={it.vencida ? '' : 'text-ink-soft'}>
                · {etiquetaVencimiento(it.fecha)}
              </span>
            </span>
            <span className="money shrink-0 font-bold">{formatARS(it.monto)}</span>
          </li>
        ))}
      </ul>

      {avisos && (
        <p className="mt-2 text-sm text-ink-soft">
          {conPush
            ? 'Los avisos llegan al teléfono cada mañana, aunque la app esté cerrada.'
            : 'Los avisos saltan al abrir la app, hasta 2 días antes de cada vencimiento.'}
        </p>
      )}
    </div>
  )
}
