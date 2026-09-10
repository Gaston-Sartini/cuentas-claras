import { useState } from 'react'
import { Plus } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import FormIngreso from '../ingresos/FormIngreso'
import IngresosPendientes from './IngresosPendientes'
import { BotonIcono } from '../ui/FormPiezas'
import { incomesForMonth, incomesTotal, useIncomeEntries } from '../../hooks/useIncomeEntries'
import { useIncomeReceipts } from '../../hooks/useIncomeReceipts'
import { useCategorySpending } from '../../hooks/useCategorySpending'
import { useWallets } from '../../hooks/useWallets'
import { formatARS } from '../../lib/format'
import { daysInMonth, monthLabel, monthStartISO, todayISO } from '../../lib/dates'

// Diferencias de menos de un peso son redondeo, no un problema para avisar.
const DIFERENCIA_MINIMA = 1

/**
 * Cuánto queda para gastar y cuánto es por día. El número que manda es el
 * REAL: la suma de lo que hay hoy en las billeteras. Así cualquier movimiento
 * de verdad (un gasto, un ajuste de saldo, un ingreso que entró) lo recalcula
 * solo, sin depender de que la proyección esté perfecta.
 *
 * Aparte se compara contra lo proyectado y, si no coinciden, se avisa la
 * diferencia con las causas típicas: casi siempre es un ingreso que todavía
 * no se marcó como entrado o un gasto sin anotar.
 */
export default function DisponibleDiario() {
  const mes = monthStartISO()
  const ingresos = useIncomeEntries()
  const receipts = useIncomeReceipts()
  const gasto = useCategorySpending(mes)
  const { wallets, loading: cargandoWallets } = useWallets()
  const [cargando, setCargando] = useState(false)

  if (ingresos.loading || gasto.loading || cargandoWallets || receipts.loading) return null

  // Lo real: lo que hay hoy en las cuentas
  const real = wallets.reduce((sum, w) => sum + Number(w.current_balance), 0)
  const hoy = todayISO()
  const diasRestantes = daysInMonth(mes) - Number(hoy.slice(8, 10)) + 1
  const porDia = real / Math.max(diasRestantes, 1)
  const enRojo = real < 0

  // Lo proyectado, para contrastar
  const delMes = incomesForMonth(ingresos.entries, mes)
  const proyectado = incomesTotal(delMes)
  const esperado = proyectado - gasto.total
  const diferencia = real - esperado
  const hayProyeccion = delMes.length > 0
  const avisarDiferencia = hayProyeccion && Math.abs(diferencia) >= DIFERENCIA_MINIMA

  const pendientes = delMes.filter((e) => !receipts.receiptOf(e.id, mes))
  const faltaEntrar = incomesTotal(pendientes)

  return (
    <SeccionPlegable
      id="disponible"
      titulo={`Para gastar en ${monthLabel(mes)}`}
      accion={
        <BotonIcono
          onClick={() => setCargando((v) => !v)}
          label={`Agregar un ingreso de ${monthLabel(mes)}`}
          className="px-2 py-1"
        >
          <Plus size={18} aria-hidden="true" />
        </BotonIcono>
      }
      className={`rounded-2xl border-2 p-4 ${enRojo ? 'border-alert bg-alert/10' : 'border-line bg-card'}`}
      tituloClass={enRojo ? 'text-alert-deep' : ''}
    >
      <p className={`money mt-1 font-display text-3xl font-bold ${enRojo ? 'text-alert-deep' : 'text-leaf'}`}>
        {enRojo ? `−${formatARS(-real)}` : formatARS(real)}
      </p>

      {enRojo ? (
        <p className="mt-1 text-base font-medium text-alert-deep">
          Las cuentas están en rojo. Antes que nada, hay que cubrir eso.
        </p>
      ) : (
        <p className="money mt-1 text-base text-ink-soft">
          Son <strong className="text-ink">{formatARS(porDia)} por día</strong> hasta fin
          de mes ({diasRestantes} {diasRestantes === 1 ? 'día' : 'días'}).
        </p>
      )}

      <p className="money mt-1 text-sm text-ink-soft">
        Es la plata que hay hoy en las cuentas: {wallets.map((w) => w.name).join(' + ')}.
      </p>

      {/* Lo accionable primero: si falta que entre plata, cuánto va a quedar */}
      {faltaEntrar > 0 && (
        <p className="money mt-2 rounded-xl border-2 border-amber bg-amber/10 px-4 py-3 text-base font-medium text-amber">
          Todavía no entraron <strong>{formatARS(faltaEntrar)}</strong> de ingresos
          anotados. Cuando entren van a ser {formatARS(real + faltaEntrar)} (
          {formatARS((real + faltaEntrar) / Math.max(diasRestantes, 1))} por día).
          Marcalos acá abajo cuando caigan.
        </p>
      )}

      {/* Y el control contra la proyección, en voz baja: casi siempre la
          diferencia es plata que venía de antes, no un error. */}
      {avisarDiferencia && (
        <p className="money mt-2 text-sm text-ink-soft">
          Por lo anotado de este mes deberían quedar {formatARS(esperado)} y en las
          cuentas hay {formatARS(real)}: {formatARS(Math.abs(diferencia))}{' '}
          {diferencia > 0 ? 'de más' : 'de menos'}. Puede ser plata que venía de
          antes, un ingreso sin marcar o un gasto sin anotar.
        </p>
      )}

      {hayProyeccion && (
        <IngresosPendientes
          mes={mes}
          entradas={delMes}
          wallets={wallets}
          receipts={receipts}
          onUpdate={ingresos.updateEntry}
        />
      )}

      {!hayProyeccion && !cargando && (
        <button
          type="button"
          onClick={() => setCargando(true)}
          className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-line bg-paper px-4 py-3 text-base font-bold text-ink-soft"
        >
          <Plus size={20} aria-hidden="true" />
          Cargar lo que entra este mes
        </button>
      )}

      {cargando && (
        <FormIngreso mes={mes} onAdd={ingresos.addEntry} onClose={() => setCargando(false)} />
      )}
    </SeccionPlegable>
  )
}
