import { useState } from 'react'
import { parseARSInput } from '../lib/format'

/**
 * Mini-form de edición inline reutilizable: campos de texto, monto o entero,
 * Guardar y Cancelar. Lo usan billeteras, medios de pago, categorías, gastos
 * fijos, cuotas, ingresos y deudas para editar sin salir de la lista.
 *
 * campos: [{ key, label, tipo: 'texto' | 'monto' | 'entero', valor,
 *            opcional?, min?, max? }]  (opcional/min/max solo para 'entero')
 * onSave(valores) => { error? }  — valores ya parseados (números como número,
 * entero opcional vacío como null)
 */
export default function EditarInline({ campos, onSave, onClose }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(campos.map((c) => [c.key, String(c.valor ?? '')]))
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    const parseados = {}
    for (const c of campos) {
      if (c.tipo === 'monto') {
        const n = parseARSInput(valores[c.key])
        if (!(n > 0)) return setError(`Poné un monto válido en "${c.label}".`)
        parseados[c.key] = n
      } else if (c.tipo === 'entero') {
        const s = valores[c.key].trim()
        if (!s) {
          if (!c.opcional) return setError(`Poné un valor en "${c.label}".`)
          parseados[c.key] = null
          continue
        }
        const n = Number(s)
        const min = c.min ?? 1
        const max = c.max ?? Number.MAX_SAFE_INTEGER
        if (!Number.isInteger(n) || n < min || n > max)
          return setError(`"${c.label}" va de ${min} a ${max}.`)
        parseados[c.key] = n
      } else {
        const s = valores[c.key].trim()
        if (!s) return setError(`Poné un valor en "${c.label}".`)
        parseados[c.key] = s
      }
    }

    setGuardando(true)
    setError('')
    const { error } = await onSave(parseados)
    setGuardando(false)
    if (error) return setError(error.message ?? 'No se pudo guardar. Probá de nuevo.')
    onClose()
  }

  return (
    <div className="w-full space-y-2 pb-3">
      {campos.map((c) => (
        <label key={c.key} className="block">
          <span className="mb-1 block text-base font-bold">{c.label}</span>
          {c.tipo === 'monto' ? (
            <div className="flex items-center gap-1 rounded-xl border-2 border-line bg-card px-3">
              <span className="text-lg font-bold text-ink-soft">$</span>
              <input
                className="money tap w-full bg-transparent py-2 text-lg outline-none"
                inputMode="numeric"
                value={valores[c.key]}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [c.key]: e.target.value.replace(/[^\d.,]/g, '') }))
                }
                autoFocus={campos[0].key === c.key}
              />
            </div>
          ) : c.tipo === 'entero' ? (
            <input
              className="money tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
              inputMode="numeric"
              value={valores[c.key]}
              onChange={(e) =>
                setValores((v) => ({ ...v, [c.key]: e.target.value.replace(/\D/g, '') }))
              }
              autoFocus={campos[0].key === c.key}
            />
          ) : (
            <input
              className="tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg"
              value={valores[c.key]}
              onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))}
              autoFocus={campos[0].key === c.key}
            />
          )}
        </label>
      ))}

      {error && (
        <p role="alert" className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
          {error}
        </p>
      )}

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
          onClick={onClose}
          className="tap rounded-xl border-2 border-line px-4 py-2 text-lg font-bold text-ink-soft"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
