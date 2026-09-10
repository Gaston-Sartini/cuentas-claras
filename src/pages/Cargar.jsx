import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useWallets } from '../hooks/useWallets'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import NuevaCategoria from '../components/NuevaCategoria'
import AvisoTope from '../components/cargar/AvisoTope'
import { enqueue } from '../lib/offlineQueue'
import { categoryIcon, methodIcon, WALLET_ICONS } from '../lib/icons'
import { formatARS, parseARSInput } from '../lib/format'
import { addMonthsISO, monthStartISO, nextMonthName, todayISO } from '../lib/dates'

function NuevoMedioDePago({ wallets, onCreate, onClose }) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('credit')
  const [billeteraId, setBilleteraId] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    setGuardando(true)
    setError('')
    const { data, error } = await onCreate({
      name: nombre,
      kind: tipo,
      walletId: billeteraId,
    })
    setGuardando(false)
    if (error) return setError(error.message)
    onClose(data)
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <label className="block">
        <span className="mb-1 block text-base font-bold">Nombre</span>
        <input
          className="tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder='Ej: "Visa Gasti" o "Amex Yami"'
        />
      </label>

      <div>
        <span className="mb-1 block text-base font-bold">¿Qué tipo es?</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo('credit')}
            className={`tap rounded-xl border-2 px-3 py-3 text-base font-bold ${
              tipo === 'credit' ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'
            }`}
          >
            Crédito
          </button>
          <button
            type="button"
            onClick={() => setTipo('debit')}
            className={`tap rounded-xl border-2 px-3 py-3 text-base font-bold ${
              tipo === 'debit' ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'
            }`}
          >
            Débito
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {tipo === 'credit'
            ? 'Las compras van a la cuenta del mes que viene.'
            : 'Cada compra descuenta al instante la billetera que elijas.'}
        </p>
      </div>

      {tipo === 'debit' && (
        <div>
          <span className="mb-1 block text-base font-bold">¿De dónde descuenta?</span>
          <div className="grid grid-cols-2 gap-2">
            {wallets.map((w) => {
              const Icon = WALLET_ICONS[w.type] ?? WALLET_ICONS.other
              const activa = billeteraId === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setBilleteraId(w.id)}
                  className={`tap flex items-center justify-center gap-2 rounded-xl border-2 px-2 py-3 text-base font-bold ${
                    activa ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'
                  }`}
                >
                  <Icon size={20} aria-hidden="true" />
                  <span className="truncate">{w.name}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            ¿Falta el banco? Se agrega en la pestaña Billeteras.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={crear}
          disabled={guardando}
          className="tap flex-1 rounded-xl bg-ink px-4 py-2 text-lg font-bold text-white disabled:opacity-60"
        >
          {guardando ? 'Creando…' : 'Crear'}
        </button>
        <button
          type="button"
          onClick={() => onClose(null)}
          className="tap rounded-xl border-2 border-line px-4 py-2 text-lg font-bold text-ink-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default function Cargar() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { categories, createCategory } = useCategories()
  const { wallets } = useWallets()
  const { methods, createMethod } = usePaymentMethods()

  const [montoStr, setMontoStr] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoriaId, setCategoriaId] = useState(null)
  const [metodoId, setMetodoId] = useState(null)
  const [cuotasStr, setCuotasStr] = useState('1')
  const [fecha, setFecha] = useState(todayISO())
  const [nuevaCat, setNuevaCat] = useState(false)
  const [nuevoMetodo, setNuevoMetodo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const monto = parseARSInput(montoStr)
  const metodo = useMemo(
    () => methods.find((m) => m.id === metodoId) ?? null,
    [methods, metodoId]
  )
  const esCredito = metodo?.kind === 'credit'
  const cuotas = esCredito ? Math.max(1, Number(cuotasStr) || 1) : 1

  // Billetera que se descuenta si el método es de débito
  const billeteraAfectada = useMemo(() => {
    if (metodo?.kind !== 'debit') return null
    return wallets.find((w) => w.id === metodo.wallet_id) ?? null
  }, [metodo, wallets])

  const guardar = async () => {
    setError('')
    if (!(monto > 0)) return setError('Poné cuánto gastaste.')
    if (!metodo) return setError('Elegí cómo lo pagaste.')
    if (esCredito && !(cuotas >= 1 && cuotas <= 120))
      return setError('Las cuotas van de 1 a 120.')

    setGuardando(true)
    const categoria = categories.find((c) => c.id === categoriaId)
    const desc = descripcion.trim() || categoria?.name || 'Gasto'

    // Crédito en cuotas: no es un gasto de hoy, es un plan de cuotas que
    // arranca el mes que viene (cada mes suma su parte a la proyección).
    const table = cuotas > 1 ? 'installments' : 'transactions'
    const payload =
      cuotas > 1
        ? {
            org_id: profile.org_id,
            description: desc,
            total_installments: cuotas,
            current_installment: 1,
            amount_per_installment: Math.round((monto / cuotas) * 100) / 100,
            payment_method_id: metodo.id,
            category_id: categoriaId,
            start_date: addMonthsISO(monthStartISO(), 1),
          }
        : {
            org_id: profile.org_id,
            created_by: profile.id,
            date: fecha,
            description: desc,
            amount: monto,
            category_id: categoriaId,
            payment_method_id: metodo.id,
          }

    // Sin señal: se guarda en el teléfono y sube solo cuando vuelve internet.
    if (!navigator.onLine) {
      enqueue(table, payload)
      return navigate('/', { state: { savedOffline: true } })
    }

    const { error } = await supabase.from(table).insert(payload)

    if (error) {
      setGuardando(false)
      return setError('No se pudo guardar. Fijate la conexión y probá de nuevo.')
    }

    navigate('/', { state: { saved: true } })
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" aria-label="Volver al inicio" className="tap grid place-items-center rounded-xl border-2 border-line bg-card px-3">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="font-display text-3xl font-semibold">Cargar un gasto</h1>
      </div>

      {/* Monto */}
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Cuánto?</span>
        <div className="flex items-center gap-2 rounded-2xl border-2 border-line bg-card px-4 py-3">
          <span className="font-display text-3xl font-bold text-ink-soft">$</span>
          <input
            className="money w-full bg-transparent font-display text-3xl font-bold outline-none placeholder:text-ink-soft/40"
            inputMode="numeric"
            value={montoStr}
            onChange={(e) => setMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
            aria-label="Monto del gasto en pesos"
          />
        </div>
        {monto > 0 && (
          <p className="money mt-1 text-base text-ink-soft">{formatARS(monto)}</p>
        )}
      </label>

      {/* Descripción */}
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Qué fue?</span>
        <input
          className="tap w-full rounded-2xl border-2 border-line bg-card px-4 py-3 text-lg"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Verdulería"
        />
      </label>

      {/* Categoría */}
      <div>
        <span className="mb-1 block text-base font-bold">Categoría</span>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((c) => {
            const Icon = categoryIcon(c.icon)
            const activa = categoriaId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoriaId(activa ? null : c.id)}
                className={`tap flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-3 ${
                  activa
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-card text-ink'
                }`}
              >
                <Icon size={24} aria-hidden="true" />
                <span className="text-sm font-bold leading-tight">{c.name}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setNuevaCat((v) => !v)}
            className="tap flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-line bg-card px-1 py-3 text-ink-soft"
          >
            <Plus size={24} aria-hidden="true" />
            <span className="text-sm font-bold leading-tight">Nueva</span>
          </button>
        </div>

        {nuevaCat && (
          <NuevaCategoria
            onCreate={createCategory}
            onDone={(creada) => {
              setCategoriaId(creada.id)
              setNuevaCat(false)
            }}
          />
        )}

        {/* Freno de presupuesto: avisa antes de guardar si el tope se pasa */}
        <AvisoTope
          categoriaId={categoriaId}
          categoriaNombre={categories.find((c) => c.id === categoriaId)?.name}
          monto={monto}
        />
      </div>

      {/* Medio de pago */}
      <div>
        <span className="mb-1 block text-base font-bold">¿Cómo lo pagaste?</span>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((m) => {
            const Icon = methodIcon(m)
            const activo = metodoId === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetodoId(m.id)}
                className={`tap flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-4 text-lg font-bold ${
                  activo
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-card text-ink'
                }`}
              >
                <Icon size={22} aria-hidden="true" />
                <span className="truncate">{m.name}</span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setNuevoMetodo((v) => !v)}
            className="tap flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-card px-3 py-4 text-lg font-bold text-ink-soft"
          >
            <Plus size={22} aria-hidden="true" />
            Otro
          </button>
        </div>

        {nuevoMetodo && (
          <NuevoMedioDePago
            wallets={wallets}
            onCreate={createMethod}
            onClose={(creado) => {
              setNuevoMetodo(false)
              if (creado) setMetodoId(creado.id)
            }}
          />
        )}

        {esCredito && (
          <div className="mt-2">
            <label className="block">
              <span className="mb-1 block text-base font-bold">¿En cuántas cuotas?</span>
              <input
                className="money tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
                inputMode="numeric"
                value={cuotasStr}
                onChange={(e) => setCuotasStr(e.target.value.replace(/\D/g, ''))}
                placeholder="1"
              />
            </label>
            <p className="mt-2 rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
              {cuotas > 1 ? (
                <>
                  {cuotas} cuotas de <strong className="money">
                    {formatARS(monto > 0 ? monto / cuotas : 0)}
                  </strong>{' '}
                  por mes, la primera en <strong>{nextMonthName()}</strong>.
                </>
              ) : (
                <>
                  Va a la cuenta de <strong>{nextMonthName()}</strong>: hoy no
                  descuenta ninguna billetera.
                </>
              )}
            </p>
          </div>
        )}

        {billeteraAfectada && (
          <p className="money mt-2 rounded-xl border-2 border-leaf bg-leaf/10 px-4 py-3 text-base font-medium text-leaf">
            {billeteraAfectada.name}: {formatARS(billeteraAfectada.current_balance)}
            {monto > 0 && (
              <> → {formatARS(Number(billeteraAfectada.current_balance) - monto)}</>
            )}
          </p>
        )}
      </div>

      {/* Fecha */}
      <label className="block">
        <span className="mb-1 block text-base font-bold">Fecha</span>
        <input
          type="date"
          className="tap w-full rounded-2xl border-2 border-line bg-card px-4 py-3 text-lg"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="tap w-full rounded-2xl bg-leaf px-6 py-5 text-xl font-bold text-white disabled:opacity-60"
      >
        {guardando ? 'Guardando…' : cuotas > 1 ? 'Guardar cuotas' : 'Guardar gasto'}
      </button>
    </section>
  )
}
