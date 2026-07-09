import { useState } from 'react'
import { CATEGORY_ICON_NAMES, categoryIcon } from '../lib/icons'

/**
 * Alta de categoría con elección de ícono. Se usa igual en el form de carga
 * y en la pestaña Billeteras: nombre + grilla de íconos + Crear.
 */
export default function NuevaCategoria({ onCreate, onDone }) {
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState('tag')
  const [error, setError] = useState('')

  const crear = async () => {
    setError('')
    const { data, error } = await onCreate(nombre, icono)
    if (error) return setError(error.message)
    setNombre('')
    setIcono('tag')
    onDone?.(data)
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <input
          className="tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la categoría"
        />
        <button
          type="button"
          onClick={crear}
          className="tap rounded-xl bg-ink px-4 font-bold text-white"
        >
          Crear
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Elegí un ícono">
        {CATEGORY_ICON_NAMES.map((name) => {
          const Icon = categoryIcon(name)
          const activo = icono === name
          return (
            <button
              key={name}
              type="button"
              onClick={() => setIcono(name)}
              aria-label={`Ícono ${name}`}
              aria-pressed={activo}
              className={`tap grid place-items-center rounded-xl border-2 px-3 ${
                activo ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-soft'
              }`}
            >
              <Icon size={22} aria-hidden="true" />
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}
    </div>
  )
}
