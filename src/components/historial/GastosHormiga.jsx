import { useMemo, useState } from 'react'
import { ChevronDown, Coins, Pencil } from 'lucide-react'
import { BotonesForm, BotonIcono, CampoMonto, MensajeError } from '../ui/FormPiezas'
import { useLocalPref } from '../../hooks/useLocalPref'
import { formatARS, parseARSInput } from '../../lib/format'
import { formatShortDate } from '../../lib/dates'

// Umbral automático: 2% del total del mes, redondeado a miles (mínimo $1.000).
// Se ajusta solo con la inflación, sin tener que tocar nada.
const umbralAutomatico = (totalMes) =>
  Math.max(Math.round((totalMes * 0.02) / 1000) * 1000, 1000)

const PREF_UMBRAL = 'cc-hormiga-umbral' // '' = automático

/* Formulario del umbral: desde qué monto para abajo cuenta como hormiga. */
function EditarUmbral({ actual, esManual, onGuardar, onAutomatico, onClose }) {
  const [montoStr, setMontoStr] = useState(esManual ? String(actual) : '')
  const [error, setError] = useState('')

  const guardar = () => {
    const monto = parseARSInput(montoStr)
    if (!(monto > 0)) return setError('Poné un monto mayor a cero.')
    onGuardar(monto)
    onClose()
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border-2 border-line bg-paper p-4">
      <CampoMonto
        label="Contar como hormiga los gastos de menos de…"
        value={montoStr}
        onChange={setMontoStr}
        placeholder={String(actual)}
        ayuda="Cambiá el monto y se recalcula todo: la lista, el total y el porcentaje."
      />

      <MensajeError>{error}</MensajeError>

      <BotonesForm
        etiqueta="Usar este monto"
        onGuardar={guardar}
        onCancelar={onClose}
        tono="bg-ink"
      />

      {esManual && (
        <button
          type="button"
          onClick={() => {
            onAutomatico()
            onClose()
          }}
          className="tap w-full rounded-xl border-2 border-line px-4 py-2 text-base font-bold text-ink-soft"
        >
          Volver al monto automático
        </button>
      )}
    </div>
  )
}

/**
 * Los gastos chicos que en conjunto pesan: delivery, kiosco, farmacia…
 * Individualmente parecen nada; acá se ve cuánto suman. El monto desde el que
 * un gasto cuenta como hormiga lo elige la familia (queda guardado en el
 * teléfono); si no lo tocan, se calcula solo. Excluye cuotas: son
 * compromisos, no impulsos.
 */
export default function GastosHormiga({ gastos }) {
  const [abierta, setAbierta] = useState(false)
  const [editando, setEditando] = useState(false)
  const [umbralGuardado, setUmbralGuardado] = useLocalPref(PREF_UMBRAL, '')

  const esManual = umbralGuardado !== '' && Number(umbralGuardado) > 0

  const hormiga = useMemo(() => {
    const totalMes = gastos.reduce((sum, t) => sum + Number(t.amount), 0)
    if (totalMes <= 0) return null
    const umbral = esManual ? Number(umbralGuardado) : umbralAutomatico(totalMes)
    const items = gastos
      .filter((t) => !t.esCuota && Number(t.amount) < umbral)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
    const suma = items.reduce((sum, t) => sum + Number(t.amount), 0)
    return { items, umbral, suma, pct: Math.round((suma / totalMes) * 100) }
  }, [gastos, esManual, umbralGuardado])

  // Si el mes no tiene gastos no hay nada que contar; con gastos la tarjeta
  // se muestra siempre, aunque no caiga ninguno: es el único lugar desde
  // donde se cambia el monto que decide qué es "hormiga".
  if (!hormiga) return null

  return (
    <div className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="tap min-w-0 flex-1 text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold">
              <Coins size={22} aria-hidden="true" className="shrink-0" />
              Gastos hormiga
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={`shrink-0 text-ink-soft transition-transform ${abierta ? 'rotate-180' : ''}`}
              />
            </h2>
            <p className="money shrink-0 font-display text-2xl font-bold">
              {formatARS(hormiga.suma)}
            </p>
          </div>
          <p className="money mt-1 text-base text-ink-soft">
            {hormiga.items.length === 0
              ? `Ningún gasto de menos de ${formatARS(hormiga.umbral)} este mes.`
              : `${hormiga.items.length} ${hormiga.items.length === 1 ? 'gasto' : 'gastos'} de menos de ${formatARS(hormiga.umbral)} que ${hormiga.items.length === 1 ? 'es' : 'juntos son'} el ${hormiga.pct}% del mes. Acá suele estar la plata que "se esfuma".`}
          </p>
        </button>

        <BotonIcono
          onClick={() => setEditando((v) => !v)}
          label="Cambiar desde qué monto es un gasto hormiga"
          className="px-2 py-2"
        >
          <Pencil size={18} aria-hidden="true" />
        </BotonIcono>
      </div>

      {editando && (
        <EditarUmbral
          actual={hormiga.umbral}
          esManual={esManual}
          onGuardar={(monto) => setUmbralGuardado(String(monto))}
          onAutomatico={() => setUmbralGuardado('')}
          onClose={() => setEditando(false)}
        />
      )}

      {abierta && hormiga.items.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-line pl-4">
          {hormiga.items.map((t) => (
            <li key={t.id} className="flex items-baseline justify-between gap-2 text-base">
              <span className="min-w-0 truncate text-ink-soft">
                {formatShortDate(t.date)} · {t.description}
              </span>
              <span className="money shrink-0 font-medium">{formatARS(t.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
