import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, CalendarClock, CreditCard } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useRecurringExpenses } from '../../hooks/useRecurringExpenses'
import { useDebts } from '../../hooks/useDebts'
import { useCardStatements } from '../../hooks/useCardStatements'
import {
  etiquetaVencimiento,
  proximoVencimientoDeDia,
  vencimientosDeTarjetas,
  vencimientosProximos,
} from '../../lib/vencimientos'
import {
  activarAvisos,
  avisosActivos,
  avisosRechazados,
  avisosSoportados,
  notificarVencimientos,
} from '../../lib/notifications'
import { pushActivo, probarPush, suscribirPush } from '../../lib/push'
import { formatARS } from '../../lib/format'

/* Avisos: activarlos, y una vez activos poder comprobar que llegan. */
function Avisos({ activos, conPush, onActivar }) {
  const [probando, setProbando] = useState(false)
  const [mensaje, setMensaje] = useState(null) // { ok, texto }

  const probar = async () => {
    setProbando(true)
    setMensaje(null)
    const { error, enviados } = await probarPush()
    setProbando(false)
    setMensaje(
      error
        ? { ok: false, texto: error }
        : {
            ok: true,
            texto: `Aviso de prueba mandado a ${enviados === 1 ? 'este teléfono' : `${enviados} teléfonos`}. Si no te llega, revisá las notificaciones de la app en el celular.`,
          }
    )
    setTimeout(() => setMensaje(null), 12000)
  }

  if (!avisosSoportados()) return null

  if (!activos) {
    if (avisosRechazados()) return null
    return (
      <button
        type="button"
        onClick={onActivar}
        className="tap shrink-0 rounded-full border-2 border-line bg-paper px-4 py-2 text-sm font-bold text-ink-soft"
      >
        🔔 Avisarme
      </button>
    )
  }

  return (
    <>
      <span className="flex shrink-0 items-center gap-2">
        <span className="flex items-center gap-1 text-sm font-medium text-leaf">
          <BellRing size={16} aria-hidden="true" />
          avisos activados
        </span>
        {conPush && (
          <button
            type="button"
            onClick={probar}
            disabled={probando}
            className="tap rounded-full border-2 border-line bg-paper px-3 py-1 text-sm font-bold text-ink-soft disabled:opacity-60"
          >
            {probando ? 'Mandando…' : 'Probar'}
          </button>
        )}
      </span>
      {mensaje && (
        <p
          role="status"
          className={`mt-2 w-full rounded-xl border-2 px-4 py-3 text-base font-medium ${
            mensaje.ok
              ? 'border-leaf bg-leaf/10 text-leaf'
              : 'border-alert bg-alert/10 text-alert-deep'
          }`}
        >
          {mensaje.texto}
        </p>
      )}
    </>
  )
}

/**
 * Qué vence en los próximos días: fijos con día de vencimiento, deudas con
 * fecha y el resumen de cada tarjeta (con su día de vencimiento, si está
 * cargado). Con "Avisarme" el navegador se suscribe a Web Push (el servidor
 * avisa cada mañana, app cerrada); si el push no está disponible, al abrir la
 * app salta el aviso local.
 */
export default function ProximosVencimientos() {
  const { profile } = useAuth()
  const { recurring } = useRecurringExpenses()
  const { debts } = useDebts()
  const { statements, totalResumenes } = useCardStatements()
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

  // Las tarjetas van en su propia lista arriba (son los montos grandes), pero
  // para el aviso local son un vencimiento más.
  const itemsTarjeta = useMemo(
    () => vencimientosDeTarjetas({ tarjetas: statements }),
    [statements]
  )

  // Al abrir la app: notificar lo que vence ya (el dedupe evita repetir)
  useEffect(() => {
    notificarVencimientos([...itemsTarjeta, ...items])
  }, [itemsTarjeta, items])

  if (items.length === 0 && statements.length === 0) return null

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold">
          <CalendarClock size={22} aria-hidden="true" className="shrink-0" />
          Vencimientos
        </h2>
        <Avisos activos={avisos} conPush={conPush} onActivar={activar} />
      </div>

      <ul className="mt-2 space-y-2 text-base">
        {/* Una línea por tarjeta: con varias, hay que saber cuánto es cada
            resumen y cuándo vence para decidir cuál se paga primero. */}
        {statements.map((card) => (
          <li key={card.key}>
            <Link to="/proximos" className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 font-bold text-alert-deep">
                <CreditCard size={18} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0 truncate">
                  {card.name}
                  <span className="font-medium">
                    {card.dueDay
                      ? ` · ${etiquetaVencimiento(proximoVencimientoDeDia(card.dueDay))}`
                      : ' — está para pagar'}
                  </span>
                </span>
              </span>
              <span className="money shrink-0 font-bold text-alert-deep">
                {formatARS(card.total)}
              </span>
            </Link>
          </li>
        ))}
        {statements.length > 1 && (
          <li className="money flex justify-between gap-3 text-sm text-ink-soft">
            <span>Las {statements.length} tarjetas juntas</span>
            <span className="font-bold">{formatARS(totalResumenes)}</span>
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
            ? 'Los avisos llegan al teléfono cada mañana, aunque la app esté cerrada: las tarjetas 5, 3 y 1 día antes (y el día que vencen), el resto 2 días antes.'
            : 'Los avisos saltan al abrir la app, hasta 2 días antes de cada vencimiento.'}
        </p>
      )}

      {/* Una tarjeta sin día de vencimiento no puede avisar: hay que ponérselo */}
      {avisos && statements.some((c) => !c.dueDay) && (
        <p className="mt-1 text-sm text-ink-soft">
          Sin día de vencimiento no hay aviso.{' '}
          <Link to="/billeteras" className="font-bold underline">
            Ponele el día a tus tarjetas
          </Link>
          .
        </p>
      )}
    </div>
  )
}
