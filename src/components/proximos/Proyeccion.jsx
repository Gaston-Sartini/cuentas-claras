import { useMemo, useState } from 'react'
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import EditarInline from '../EditarInline'
import FormIngreso from '../ingresos/FormIngreso'
import { camposDeIngreso } from '../ingresos/camposIngreso'
import { BotonIcono } from '../ui/FormPiezas'
import { installmentDueInMonth, useInstallments } from '../../hooks/useInstallments'
import { recurringActiveInMonth, useRecurringExpenses } from '../../hooks/useRecurringExpenses'
import { useCardCharges } from '../../hooks/useCardCharges'
import { useWallets } from '../../hooks/useWallets'
import {
  incomeIsOneOff,
  incomesForMonth,
  incomesTotal,
  useIncomeEntries,
} from '../../hooks/useIncomeEntries'
import { methodLabel } from '../../lib/icons'
import { formatARS } from '../../lib/format'
import { addMonthsISO, monthLabel, monthStartISO } from '../../lib/dates'

const MESES_PROYECTADOS = 6

/* Fila de un ingreso: nombre, a qué cuenta entra, monto y editar/borrar. */
function IngresoItem({ entry, wallets, onUpdate, onRemove }) {
  const [editando, setEditando] = useState(false)
  const puntual = incomeIsOneOff(entry)

  const borrar = () => {
    const aviso = puntual
      ? `¿Sacar "${entry.description}"?`
      : `¿Sacar "${entry.description}"? Deja de contar en todos los meses.`
    if (window.confirm(aviso)) onRemove(entry.id)
  }

  return (
    <li className="pl-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-ink-soft">
          {entry.description}
          {puntual && <span className="text-sm"> · solo este mes</span>}
          <span className="text-sm">
            {entry.wallets?.name ? ` → ${entry.wallets.name}` : ' · sin cuenta'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="font-bold text-leaf">+{formatARS(entry.amount)}</span>
          <BotonIcono
            onClick={() => setEditando((v) => !v)}
            label={`Editar ingreso ${entry.description}`}
            className="px-2 py-1"
          >
            <Pencil size={16} aria-hidden="true" />
          </BotonIcono>
          <BotonIcono
            onClick={borrar}
            label={`Borrar ingreso ${entry.description}`}
            className="px-2 py-1"
          >
            <Trash2 size={16} aria-hidden="true" />
          </BotonIcono>
        </span>
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

/* Tarjeta de un mes: lo que entra (ítem por ítem) y lo que sale. */
function MesProyectado({ mes, entradas, detalle, sale, ingresos, wallets }) {
  const [agregando, setAgregando] = useState(false)
  const entra = incomesTotal(entradas)
  const balance = entra - sale

  return (
    <li className="rounded-2xl border-2 border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold capitalize">{monthLabel(mes, { withYear: true })}</h3>
        {entra > 0 && (
          <p className={`money text-lg font-bold ${balance >= 0 ? 'text-leaf' : 'text-alert-deep'}`}>
            {balance >= 0 ? 'Quedan' : 'Faltan'} {formatARS(Math.abs(balance))}
          </p>
        )}
      </div>

      <div className="money mt-2 space-y-1 text-base">
        {/* Entra: la suma y el detalle ingreso por ingreso */}
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold text-ink-soft">Entra</p>
          <p className="flex items-center gap-2 font-bold">
            {entra > 0 ? (
              formatARS(entra)
            ) : (
              <span className="font-medium text-ink-soft">sin cargar</span>
            )}
            <BotonIcono
              onClick={() => setAgregando((v) => !v)}
              label={`Agregar ingreso en ${monthLabel(mes, { withYear: true })}`}
              className="px-2 py-1"
            >
              <Plus size={18} aria-hidden="true" />
            </BotonIcono>
          </p>
        </div>
        {entradas.length > 0 && (
          <ul className="space-y-1">
            {entradas.map((e) => (
              <IngresoItem
                key={e.id}
                entry={e}
                wallets={wallets}
                onUpdate={ingresos.updateEntry}
                onRemove={ingresos.removeEntry}
              />
            ))}
          </ul>
        )}
        {agregando && (
          <FormIngreso mes={mes} onAdd={ingresos.addEntry} onClose={() => setAgregando(false)} />
        )}

        {/* Sale: tarjetas, cuotas y fijos del mes */}
        {sale > 0 && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="font-bold text-ink-soft">Sale</p>
            <p className="font-bold">−{formatARS(sale)}</p>
          </div>
        )}
        {detalle.map(([concepto, monto], i) => (
          <div key={`${concepto}-${i}`} className="flex justify-between gap-3 pl-3">
            <p className="truncate text-ink-soft">{concepto}</p>
            <p className="shrink-0 font-bold">−{formatARS(monto)}</p>
          </div>
        ))}
        {sale === 0 && (
          <div className="flex justify-between gap-3">
            <p className="text-ink-soft">Pagos anotados</p>
            <p className="font-medium text-ink-soft">ninguno</p>
          </div>
        )}
      </div>
    </li>
  )
}

/* Proyección mes a mes: ingresos con nombre + pagos ya conocidos. */
export default function Proyeccion() {
  const { installments } = useInstallments()
  const { recurring } = useRecurringExpenses()
  const { byMonthCard } = useCardCharges()
  const ingresos = useIncomeEntries()
  const { wallets } = useWallets()

  const meses = useMemo(() => {
    const inicio = addMonthsISO(monthStartISO(), 1)
    return Array.from({ length: MESES_PROYECTADOS }, (_, i) => {
      const mes = addMonthsISO(inicio, i)
      // Lo que viene de cada tarjeta ese mes: compras imputadas + cuotas que vencen
      const tarjetas = { ...(byMonthCard[mes] ?? {}) }
      for (const inst of installments) {
        if (!installmentDueInMonth(inst, mes)) continue
        const card = methodLabel(inst) ?? 'Tarjeta'
        tarjetas[card] = (tarjetas[card] ?? 0) + Number(inst.amount_per_installment)
      }
      const detalle = Object.entries(tarjetas).sort((a, b) => b[1] - a[1])
      // Más los gastos fijos vigentes ese mes, ítem por ítem
      for (const r of recurring) {
        if (recurringActiveInMonth(r, mes)) detalle.push([r.description, Number(r.amount)])
      }
      const sale = detalle.reduce((sum, [, v]) => sum + v, 0)
      const entradas = incomesForMonth(ingresos.entries, mes)
      return { mes, entradas, detalle, sale }
    })
  }, [installments, recurring, byMonthCard, ingresos.entries])

  return (
    <SeccionPlegable id="proyeccion" titulo="Los próximos meses" icono={CalendarClock}>
      <p className="mt-1 text-base text-ink-soft">
        Lo que ya se sabe de cada mes: los ingresos con nombre (a qué cuenta
        entra cada uno) y los pagos que vencen. Tocá el + para cargar un
        ingreso; cuando llegue el mes, lo marcás como entrado desde el Inicio.
      </p>

      <ul className="mt-3 space-y-3">
        {meses.map(({ mes, entradas, detalle, sale }) => (
          <MesProyectado
            key={mes}
            mes={mes}
            entradas={entradas}
            detalle={detalle}
            sale={sale}
            ingresos={ingresos}
            wallets={wallets}
          />
        ))}
      </ul>
    </SeccionPlegable>
  )
}
