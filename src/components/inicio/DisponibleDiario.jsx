import { useState } from 'react'
import { Plus } from 'lucide-react'
import SeccionPlegable from '../SeccionPlegable'
import FormIngreso from '../ingresos/FormIngreso'
import { BotonIcono } from '../ui/FormPiezas'
import {
  incomesForMonth,
  incomesTotal,
  useIncomeEntries,
} from '../../hooks/useIncomeEntries'
import { useCategorySpending } from '../../hooks/useCategorySpending'
import { formatARS } from '../../lib/format'
import { daysInMonth, monthLabel, monthStartISO, todayISO } from '../../lib/dates'

/**
 * ¿Cuánto se puede gastar por día hasta fin de mes? Convierte el "Faltan /
 * Quedan" abstracto en una decisión diaria: (ingresos − gastado) / días que
 * quedan. No descuenta los fijos que falten pagar (se avisa).
 *
 * Se puede plegar desde el título: hay días en los que uno no quiere ver el
 * número, y el estado queda guardado en el teléfono.
 */
export default function DisponibleDiario() {
  const mes = monthStartISO()
  const ingresos = useIncomeEntries()
  const gasto = useCategorySpending(mes)
  const [cargando, setCargando] = useState(false)

  if (ingresos.loading || gasto.loading) return null

  const entra = incomesTotal(incomesForMonth(ingresos.entries, mes))
  const hoy = todayISO()
  const diasRestantes = daysInMonth(mes) - Number(hoy.slice(8, 10)) + 1
  const disponible = entra - gasto.total
  const porDia = disponible / Math.max(diasRestantes, 1)
  const enRojo = entra > 0 && disponible < 0

  const botonIngreso = (
    <BotonIcono
      onClick={() => setCargando((v) => !v)}
      label={`Agregar un ingreso de ${monthLabel(mes)}`}
      className="px-2 py-1"
    >
      <Plus size={18} aria-hidden="true" />
    </BotonIcono>
  )

  const formIngreso = cargando && (
    <FormIngreso mes={mes} onAdd={ingresos.addEntry} onClose={() => setCargando(false)} />
  )

  // Sin ingresos del mes cargados no hay métrica: invitar a cargarlos acá.
  if (entra <= 0) {
    return (
      <SeccionPlegable
        id="disponible"
        titulo="¿Cuánto pueden gastar por día?"
        className="rounded-2xl border-2 border-line bg-card p-4"
      >
        <p className="mt-1 text-base text-ink-soft">
          Cargá cuánta plata entra en {monthLabel(mes)} y te lo digo.
        </p>
        {cargando ? (
          formIngreso
        ) : (
          <button
            type="button"
            onClick={() => setCargando(true)}
            className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-line bg-paper px-4 py-3 text-base font-bold text-ink-soft"
          >
            <Plus size={20} aria-hidden="true" />
            Cargar lo que entra este mes
          </button>
        )}
      </SeccionPlegable>
    )
  }

  return (
    <SeccionPlegable
      id="disponible"
      titulo={`Para gastar en ${monthLabel(mes)}`}
      accion={botonIngreso}
      className={`rounded-2xl border-2 p-4 ${enRojo ? 'border-alert bg-alert/10' : 'border-line bg-card'}`}
      tituloClass={enRojo ? 'text-alert-deep' : ''}
    >
      {enRojo ? (
        <>
          <p className="money mt-1 font-display text-3xl font-bold text-alert-deep">
            −{formatARS(-disponible)}
          </p>
          <p className="mt-1 text-base font-medium text-alert-deep">
            El mes ya está en rojo: entraron {formatARS(entra)} y salieron{' '}
            {formatARS(gasto.total)}. Frená lo que puedas.
          </p>
        </>
      ) : (
        <>
          <p className="money mt-1 font-display text-3xl font-bold text-leaf">
            {formatARS(disponible)}
          </p>
          <p className="money mt-1 text-base text-ink-soft">
            Son <strong className="text-ink">{formatARS(porDia)} por día</strong> hasta fin
            de mes ({diasRestantes} {diasRestantes === 1 ? 'día' : 'días'}).
          </p>
        </>
      )}

      <p className="money mt-1 text-sm text-ink-soft">
        Entró {formatARS(entra)} · salió {formatARS(gasto.total)} · no cuenta los fijos
        que falten pagar.
      </p>

      {formIngreso}
    </SeccionPlegable>
  )
}
