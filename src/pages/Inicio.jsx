import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRightLeft, Plus, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import InstallBanner from '../components/InstallBanner'
import { useRecentTransactions } from '../hooks/useRecentTransactions'
import { categoryIcon, methodLabel } from '../lib/icons'
import { formatARS } from '../lib/format'
import { formatShortDate } from '../lib/dates'

export default function Inicio() {
  const { profile, org } = useAuth()
  const { transactions, loading } = useRecentTransactions(5)
  const location = useLocation()
  const navigate = useNavigate()
  const [guardado, setGuardado] = useState(null) // 'ok' | 'offline' | null

  useEffect(() => {
    if (location.state?.saved || location.state?.savedOffline) {
      setGuardado(location.state.savedOffline ? 'offline' : 'ok')
      navigate(location.pathname, { replace: true, state: null })
      const t = setTimeout(() => setGuardado(null), 4000)
      return () => clearTimeout(t)
    }
  }, [location.state, location.pathname, navigate])

  const nombre = profile?.full_name?.split(' ')[0] ?? ''

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">
          Hola{nombre ? `, ${nombre}` : ''}
        </h1>
        <Link
          to="/familia"
          className="tap flex items-center gap-2 rounded-full border-2 border-line bg-card px-4 py-2 text-base font-bold text-ink-soft"
        >
          <Users size={20} aria-hidden="true" />
          {org?.name ?? 'La familia'}
        </Link>
      </div>

      {guardado === 'ok' && (
        <p role="status" className="rounded-xl border-2 border-leaf bg-leaf/10 px-4 py-3 text-base font-bold text-leaf">
          Gasto guardado ✓
        </p>
      )}
      {guardado === 'offline' && (
        <p role="status" className="rounded-xl border-2 border-line bg-card px-4 py-3 text-base font-bold text-ink-soft">
          Guardado en el teléfono ✓ Se sube cuando vuelva internet.
        </p>
      )}

      <Link
        to="/cargar"
        className="tap flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-6 py-5 text-xl font-bold text-white"
      >
        <Plus size={26} aria-hidden="true" />
        Cargar un gasto
      </Link>

      <InstallBanner />

      <div>
        <h2 className="mb-2 text-base font-bold text-ink-soft">Últimos movimientos</h2>

        {loading ? (
          <p className="text-base text-ink-soft">Cargando…</p>
        ) : transactions.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-line bg-card px-4 py-6 text-center text-lg text-ink-soft">
            Todavía no hay gastos cargados. Arrancá con el botón de arriba.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
            {transactions.map((t) => {
              const esTransfer = t.kind === 'transfer'
              const Icon = esTransfer
                ? ArrowRightLeft
                : categoryIcon(t.categories?.icon)
              return (
                <li key={t.id}>
                  {/* Tocar un movimiento abre el Historial en el mes del gasto,
                      con ese movimiento expandido para editarlo o borrarlo */}
                  <Link
                    to="/historial"
                    state={{ abrir: t.id, mes: t.billing_month }}
                    className="flex items-center gap-3 py-3"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paper">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold">{t.description}</p>
                      <p className="text-base text-ink-soft">
                        {formatShortDate(t.date)}
                        {!esTransfer && methodLabel(t) && <> · {methodLabel(t)}</>}
                      </p>
                    </div>
                    <p className={`money text-lg font-bold ${esTransfer ? 'text-ink-soft' : ''}`}>
                      {esTransfer ? '' : '−'}{formatARS(t.amount)}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
