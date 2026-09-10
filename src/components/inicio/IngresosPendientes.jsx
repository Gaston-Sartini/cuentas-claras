import { useState } from 'react'
import { Check, Pencil, Undo2 } from 'lucide-react'
import EditarInline from '../EditarInline'
import { BotonIcono } from '../ui/FormPiezas'
import { camposDeIngreso } from '../ingresos/camposIngreso'
import { formatARS } from '../../lib/format'

/**
 * Los ingresos del mes en curso, con el botón para marcar que ya entraron.
 * Marcar suma la plata a su billetera (lo hace un trigger en la base), así el
 * saldo real —que es el que manda en el "Para gastar"— queda al día.
 *
 * Acá también se editan: la proyección de Próximos arranca el mes que viene,
 * así que este es el único lugar desde donde se le asigna una cuenta a un
 * ingreso del mes actual.
 */
function FilaIngreso({ mes, entry, wallets, receipts, onUpdate }) {
  const [editando, setEditando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const recibo = receipts.receiptOf(entry.id, mes)

  const marcar = async () => {
    setEnCurso(true)
    await receipts.markReceived(entry, mes)
    setEnCurso(false)
  }

  const desmarcar = async () => {
    if (!window.confirm(`¿"${entry.description}" en realidad no entró? Se le resta la plata a la cuenta.`)) return
    setEnCurso(true)
    await receipts.undoReceived(recibo.id)
    setEnCurso(false)
  }

  return (
    <li>
      <div className="flex items-center justify-between gap-2 text-base">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{entry.description}</span>
          <span className="money block text-sm text-ink-soft">
            {formatARS(entry.amount)}
            {entry.wallets?.name ? ` → ${entry.wallets.name}` : ' · sin cuenta asignada'}
          </span>
        </span>

        <BotonIcono
          onClick={() => setEditando((v) => !v)}
          label={`Editar ingreso ${entry.description}`}
          className="px-2 py-2"
        >
          <Pencil size={16} aria-hidden="true" />
        </BotonIcono>

        {recibo ? (
          <button
            type="button"
            onClick={desmarcar}
            disabled={enCurso}
            className="tap flex shrink-0 items-center gap-1 rounded-xl border-2 border-line px-3 py-2 text-sm font-bold text-leaf disabled:opacity-60"
          >
            <Check size={16} aria-hidden="true" />
            Entró
            <Undo2 size={14} aria-hidden="true" className="text-ink-soft" />
          </button>
        ) : (
          <button
            type="button"
            onClick={marcar}
            disabled={enCurso}
            className="tap shrink-0 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {enCurso ? '…' : 'Ya entró'}
          </button>
        )}
      </div>

      {editando && (
        <div className="mt-2">
          <EditarInline
            campos={camposDeIngreso(entry, wallets)}
            onSave={(valores) => onUpdate(entry.id, valores)}
            onClose={() => setEditando(false)}
          />
        </div>
      )}
    </li>
  )
}

export default function IngresosPendientes({ mes, entradas, wallets, receipts, onUpdate }) {
  if (entradas.length === 0) return null

  return (
    <ul className="mt-3 space-y-2 border-t-2 border-line pt-3">
      {entradas.map((e) => (
        <FilaIngreso
          key={e.id}
          mes={mes}
          entry={e}
          wallets={wallets}
          receipts={receipts}
          onUpdate={onUpdate}
        />
      ))}
    </ul>
  )
}
