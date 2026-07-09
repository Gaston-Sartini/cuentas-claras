import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Copy, LogOut, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Familia() {
  const { org, profile, signOut, refreshProfile } = useAuth()
  const [miembros, setMiembros] = useState([])
  const [copiado, setCopiado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(org?.name ?? '')

  useEffect(() => {
    setNombre(org?.name ?? '')
  }, [org?.name])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('created_at')
      .then(({ data }) => setMiembros(data ?? []))
  }, [])

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(org?.invite_code ?? '')
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      // Si el portapapeles falla, el código queda visible para copiar a mano.
    }
  }

  const guardarNombre = async () => {
    const limpio = nombre.trim()
    if (!limpio || limpio === org?.name) {
      setEditando(false)
      return
    }
    await supabase.from('organizations').update({ name: limpio }).eq('id', org.id)
    await refreshProfile()
    setEditando(false)
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" aria-label="Volver al inicio" className="tap grid place-items-center rounded-xl border-2 border-line bg-card px-3">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="font-display text-3xl font-semibold">La familia</h1>
      </div>

      {/* Nombre de la familia */}
      <div className="rounded-2xl border-2 border-line bg-card p-4">
        <p className="text-base font-bold text-ink-soft">Nombre</p>
        {editando ? (
          <div className="mt-2 flex gap-2">
            <input
              className="tap w-full rounded-xl border-2 border-line px-3 py-2 text-lg"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <button
              type="button"
              onClick={guardarNombre}
              className="tap rounded-xl bg-ink px-4 font-bold text-white"
            >
              Guardar
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="font-display text-2xl font-semibold">{org?.name}</p>
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label="Cambiar el nombre de la familia"
              className="tap grid place-items-center rounded-xl border-2 border-line px-3 text-ink-soft"
            >
              <Pencil size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Código de invitación */}
      <div className="rounded-2xl border-2 border-dashed border-alert bg-card p-4">
        <p className="text-base font-bold text-ink-soft">Código para invitar</p>
        <p className="money mt-1 font-display text-4xl font-bold tracking-[0.2em]">
          {org?.invite_code}
        </p>
        <p className="mt-2 text-base text-ink-soft">
          Compartilo con la familia: lo cargan al crear su cuenta y ven todo lo
          de acá, al instante.
        </p>
        <button
          type="button"
          onClick={copiarCodigo}
          className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-lg font-bold text-white"
        >
          {copiado ? <Check size={22} /> : <Copy size={22} />}
          {copiado ? 'Copiado' : 'Copiar código'}
        </button>
      </div>

      {/* Miembros */}
      <div className="rounded-2xl border-2 border-line bg-card p-4">
        <p className="text-base font-bold text-ink-soft">Quiénes están</p>
        <ul className="mt-2 divide-y divide-line">
          {miembros.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-lg font-bold">
                  {m.full_name ?? m.email}
                  {m.id === profile?.id && (
                    <span className="text-ink-soft"> (vos)</span>
                  )}
                </p>
                <p className="text-base text-ink-soft">{m.email}</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-sm font-bold text-ink-soft">
                {m.role === 'owner' ? 'Dueño' : 'Miembro'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={signOut}
        className="tap flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-alert px-6 py-4 text-lg font-bold text-alert-deep"
      >
        <LogOut size={22} />
        Cerrar sesión
      </button>

      {/* Sello de build: si coincide con el último deploy, la app está al día */}
      <p className="money pt-2 text-center text-sm text-ink-soft/70">{__APP_INFO__}</p>
    </section>
  )
}
