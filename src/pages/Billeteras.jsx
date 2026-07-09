import { useMemo, useState } from 'react'
import { Banknote, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useWallets } from '../hooks/useWallets'
import { useCategories } from '../hooks/useCategories'
import { useCategoryBudgets } from '../hooks/useCategoryBudgets'
import { usePaymentMethods } from '../hooks/usePaymentMethods'
import NuevaCategoria from '../components/NuevaCategoria'
import EditarInline from '../components/EditarInline'
import { categoryIcon, methodIcon, WALLET_ICONS } from '../lib/icons'
import { formatARS, parseARSInput } from '../lib/format'

const TIPOS_BILLETERA = [
  { id: 'bank', label: 'Banco' },
  { id: 'mercadopago', label: 'Billetera virtual' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'other', label: 'Otra' },
]

function NuevaBilletera({ onCreate }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('bank')
  const [saldoStr, setSaldoStr] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    setGuardando(true)
    setError('')
    const { error } = await onCreate({
      name: nombre,
      type: tipo,
      balance: parseARSInput(saldoStr),
    })
    setGuardando(false)
    if (error) return setError(error.message)
    setAbierto(false)
    setNombre('')
    setSaldoStr('')
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="tap flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-card px-4 py-3 text-lg font-bold text-ink-soft"
      >
        <Plus size={22} aria-hidden="true" />
        Agregar una billetera
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-line bg-card p-4">
      <label className="block">
        <span className="mb-1 block text-base font-bold">Nombre</span>
        <input
          className="tap w-full rounded-xl border-2 border-line px-3 py-2 text-lg"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder='Ej: "BBVA Gasti"'
        />
      </label>
      <div>
        <span className="mb-1 block text-base font-bold">Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS_BILLETERA.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              className={`tap rounded-xl border-2 px-2 py-2 text-base font-bold ${
                tipo === t.id ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-base font-bold">¿Cuánto hay hoy?</span>
        <div className="flex items-center gap-1 rounded-xl border-2 border-line px-3">
          <span className="text-lg font-bold text-ink-soft">$</span>
          <input
            className="money tap w-full bg-transparent py-2 text-lg outline-none"
            inputMode="numeric"
            value={saldoStr}
            onChange={(e) => setSaldoStr(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0"
          />
        </div>
      </label>
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
          {guardando ? 'Creando…' : 'Crear billetera'}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="tap rounded-xl border-2 border-line px-4 py-2 text-lg font-bold text-ink-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function MediosDePago() {
  const { methods, removeMethod, renameMethod } = usePaymentMethods()
  const [editando, setEditando] = useState(null) // id en edición
  const [error, setError] = useState('')

  const borrar = async (m) => {
    if (!window.confirm(`¿Sacar "${m.name}" de los medios de pago?`)) return
    setError('')
    const { error } = await removeMethod(m.id)
    if (error) setError(error.message)
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Medios de pago</h2>
      <ul className="divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
        {methods.map((m) => {
          const Icon = methodIcon(m)
          return (
            <li key={m.id}>
              <div className="flex items-center gap-3 py-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paper">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{m.name}</p>
                  <p className="text-base text-ink-soft">
                    {m.kind === 'credit'
                      ? 'Crédito · paga el mes que viene'
                      : `Débito · descuenta de ${m.wallets?.name ?? 'la billetera'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditando(editando === m.id ? null : m.id)}
                  aria-label={`Cambiar el nombre de ${m.name}`}
                  className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                >
                  <Pencil size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => borrar(m)}
                  aria-label={`Borrar ${m.name}`}
                  className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                >
                  <Trash2 size={20} aria-hidden="true" />
                </button>
              </div>
              {editando === m.id && (
                <EditarInline
                  campos={[{ key: 'name', label: 'Nombre', tipo: 'texto', valor: m.name }]}
                  onSave={({ name }) => renameMethod(m.id, name)}
                  onClose={() => setEditando(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-1 text-sm text-ink-soft">
        Las tarjetas nuevas se agregan al cargar un gasto, tocando "Otro".
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}
    </div>
  )
}

function Categorias() {
  const { categories, createCategory, renameCategory, removeCategory } = useCategories()
  const [editando, setEditando] = useState(null) // id en edición
  const [error, setError] = useState('')

  const borrar = async (c) => {
    if (!window.confirm(`¿Borrar la categoría "${c.name}"? Los gastos quedan como "Sin categoría".`)) return
    const { error } = await removeCategory(c.id)
    if (error) setError('No se pudo borrar. Probá de nuevo.')
  }

  return (
    <div>
      <h2 className="mb-2 text-lg font-bold">Categorías</h2>
      <NuevaCategoria onCreate={createCategory} />
      {error && (
        <p role="alert" className="mt-2 rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}
      <ul className="mt-2 divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
        {categories.map((c) => {
          const Icon = categoryIcon(c.icon)
          return (
            <li key={c.id}>
              <div className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 truncate text-lg font-bold">{c.name}</p>
                {c.org_id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditando(editando === c.id ? null : c.id)}
                      aria-label={`Cambiar el nombre de ${c.name}`}
                      className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                    >
                      <Pencil size={20} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(c)}
                      aria-label={`Borrar categoría ${c.name}`}
                      className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                    >
                      <Trash2 size={20} aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <span className="text-sm font-medium text-ink-soft">de la app</span>
                )}
              </div>
              {editando === c.id && (
                <EditarInline
                  campos={[{ key: 'name', label: 'Nombre', tipo: 'texto', valor: c.name }]}
                  onSave={({ name }) => renameCategory(c.id, name)}
                  onClose={() => setEditando(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TarjetaBilletera({ wallet, onSetBalance, onRename }) {
  const [editando, setEditando] = useState(false)
  const [renombrando, setRenombrando] = useState(false)
  const [valorStr, setValorStr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const Icon = WALLET_ICONS[wallet.type] ?? WALLET_ICONS.other

  const guardar = async () => {
    setGuardando(true)
    await onSetBalance(wallet.id, parseARSInput(valorStr))
    setGuardando(false)
    setEditando(false)
    setValorStr('')
  }

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-paper">
          <Icon size={26} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-ink-soft">{wallet.name}</p>
          <p className="money font-display text-3xl font-bold">
            {formatARS(wallet.current_balance)}
          </p>
        </div>
        {!editando && !renombrando && (
          <>
            <button
              type="button"
              onClick={() => setRenombrando(true)}
              aria-label={`Cambiar el nombre de ${wallet.name}`}
              className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
            >
              <Pencil size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="tap rounded-xl border-2 border-line px-4 py-2 text-base font-bold text-ink-soft"
            >
              Ajustar
            </button>
          </>
        )}
      </div>

      {renombrando && (
        <div className="mt-3">
          <EditarInline
            campos={[{ key: 'name', label: 'Nombre de la billetera', tipo: 'texto', valor: wallet.name }]}
            onSave={({ name }) => onRename(wallet.id, name)}
            onClose={() => setRenombrando(false)}
          />
        </div>
      )}

      {editando && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-base font-medium text-ink-soft">
              Saldo real de {wallet.name} (lo que hay hoy)
            </span>
            <input
              className="tap w-full rounded-xl border-2 border-line px-3 py-2 text-lg"
              inputMode="numeric"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder={String(wallet.current_balance)}
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="tap flex-1 rounded-xl bg-ink px-4 py-2 text-lg font-bold text-white disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(false)
                setValorStr('')
              }}
              className="tap flex-1 rounded-xl border-2 border-line px-4 py-2 text-lg font-bold text-ink-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Presupuestos() {
  const { categories } = useCategories()
  const { budgets, setBudget, removeBudget } = useCategoryBudgets()
  const [agregando, setAgregando] = useState(false)
  const [nuevaCatId, setNuevaCatId] = useState('')
  const [nuevoMontoStr, setNuevoMontoStr] = useState('')

  // Categorías que ya tienen tope, y las que quedan libres para agregar uno
  const conTope = categories.filter((c) => budgets[c.id] != null)
  const sinTope = categories.filter((c) => budgets[c.id] == null)

  const agregar = async () => {
    const monto = parseARSInput(nuevoMontoStr)
    if (!nuevaCatId || !(monto > 0)) return
    await setBudget(nuevaCatId, monto)
    setNuevaCatId('')
    setNuevoMontoStr('')
    setAgregando(false)
  }

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <Target size={22} aria-hidden="true" />
        Topes por categoría
      </h2>
      <p className="mb-2 text-base text-ink-soft">
        Ponele un límite mensual a lo que quieras cuidar. En el Historial vas a
        ver cuánto te queda, y la barra se pone roja si te pasás.
      </p>

      {conTope.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border-2 border-line bg-card px-4">
          {conTope.map((c) => {
            const Icon = categoryIcon(c.icon)
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-paper">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 truncate text-lg font-bold">{c.name}</p>
                <p className="money shrink-0 text-lg font-bold">{formatARS(budgets[c.id])}</p>
                <button
                  type="button"
                  onClick={() => removeBudget(c.id)}
                  aria-label={`Sacar el tope de ${c.name}`}
                  className="tap grid shrink-0 place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
                >
                  <Trash2 size={20} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {agregando ? (
        <div className="mt-2 space-y-2 rounded-2xl border-2 border-line bg-card p-4">
          <label className="block">
            <span className="mb-1 block text-base font-bold">Categoría</span>
            <select
              className="tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
              value={nuevaCatId}
              onChange={(e) => setNuevaCatId(e.target.value)}
            >
              <option value="" disabled>Elegí…</option>
              {sinTope.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-base font-bold">Tope por mes</span>
            <div className="flex items-center gap-1 rounded-xl border-2 border-line px-3">
              <span className="text-lg font-bold text-ink-soft">$</span>
              <input
                className="money tap w-full bg-transparent py-2 text-lg outline-none"
                inputMode="numeric"
                value={nuevoMontoStr}
                onChange={(e) => setNuevoMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="0"
              />
            </div>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={agregar}
              className="tap flex-1 rounded-xl bg-ink px-4 py-2 text-lg font-bold text-white"
            >
              Guardar tope
            </button>
            <button
              type="button"
              onClick={() => setAgregando(false)}
              className="tap rounded-xl border-2 border-line px-4 py-2 text-lg font-bold text-ink-soft"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        sinTope.length > 0 && (
          <button
            type="button"
            onClick={() => setAgregando(true)}
            className="tap mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-card px-4 py-3 text-lg font-bold text-ink-soft"
          >
            <Plus size={22} aria-hidden="true" />
            Poner un tope
          </button>
        )
      )}
    </div>
  )
}

export default function Billeteras() {
  const { wallets, loading, setBalance, transfer, createWallet, renameWallet } = useWallets()
  const [montoStr, setMontoStr] = useState('')
  const [retirando, setRetirando] = useState(false)
  const [msg, setMsg] = useState(null) // { tipo: 'ok' | 'error', texto }

  const banco = useMemo(() => wallets.find((w) => w.type === 'bank'), [wallets])
  const efectivo = useMemo(() => wallets.find((w) => w.type === 'cash'), [wallets])

  const retirar = async () => {
    const monto = parseARSInput(montoStr)
    if (!(monto > 0)) {
      setMsg({ tipo: 'error', texto: 'Poné cuánto sacaste.' })
      return
    }
    setRetirando(true)
    setMsg(null)
    const { error } = await transfer(banco.id, efectivo.id, monto, 'Retiro cajero')
    setRetirando(false)
    if (error) {
      setMsg({ tipo: 'error', texto: 'No se pudo registrar el retiro. Probá de nuevo.' })
    } else {
      setMontoStr('')
      setMsg({ tipo: 'ok', texto: `Listo: ${formatARS(monto)} pasaron de Banco a Efectivo.` })
      setTimeout(() => setMsg(null), 4000)
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Billeteras</h1>

      {loading ? (
        <p className="text-base text-ink-soft">Cargando…</p>
      ) : (
        <div className="space-y-3">
          {wallets.map((w) => (
            <TarjetaBilletera key={w.id} wallet={w} onSetBalance={setBalance} onRename={renameWallet} />
          ))}
          <NuevaBilletera onCreate={createWallet} />
        </div>
      )}

      {banco && efectivo && (
        <div className="rounded-2xl border-2 border-line bg-card p-4">
          <div className="flex items-center gap-2">
            <Banknote size={24} aria-hidden="true" />
            <h2 className="text-lg font-bold">¿Sacaste plata del cajero?</h2>
          </div>
          <p className="mt-1 text-base text-ink-soft">
            Pasa el monto de Banco a Efectivo. No cuenta como gasto.
          </p>
          <div className="mt-3 flex gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-xl border-2 border-line px-3">
              <span className="text-lg font-bold text-ink-soft">$</span>
              <input
                className="money tap w-full bg-transparent py-2 text-lg outline-none"
                inputMode="numeric"
                value={montoStr}
                onChange={(e) => setMontoStr(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="0"
                aria-label="Monto retirado del cajero"
              />
            </div>
            <button
              type="button"
              onClick={retirar}
              disabled={retirando}
              className="tap rounded-xl bg-ink px-5 py-2 text-lg font-bold text-white disabled:opacity-60"
            >
              {retirando ? '…' : 'Registrar'}
            </button>
          </div>
          {msg && (
            <p
              role={msg.tipo === 'error' ? 'alert' : 'status'}
              className={`mt-2 rounded-xl border-2 px-4 py-3 text-base font-medium ${
                msg.tipo === 'error'
                  ? 'border-alert bg-alert/10 text-alert-deep'
                  : 'border-leaf bg-leaf/10 text-leaf'
              }`}
            >
              {msg.texto}
            </p>
          )}
        </div>
      )}

      <MediosDePago />

      <Presupuestos />

      <Categorias />
    </section>
  )
}
