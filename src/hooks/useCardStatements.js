import { useMemo } from 'react'
import { useCardCharges } from './useCardCharges'
import { useInstallments } from './useInstallments'
import { useInstallmentPayments } from './useInstallmentPayments'
import { usePaymentMethods } from './usePaymentMethods'
import { addMonthsISO, monthStartISO } from '../lib/dates'

/**
 * El resumen de cada tarjeta que vence: lo que el banco va a debitar, que son
 * las compras del período MÁS las cuotas que caen en esos mismos meses.
 *
 * Vive acá, componiendo los dos hooks, para que el Inicio y Próximos muestren
 * exactamente el mismo total y el mismo desglose.
 *
 * `gastos` y `cuotas` son las dos patas del mismo resumen, y el cierre
 * descuenta las dos: las compras pasan a 'settled' y las cuotas quedan
 * registradas en installment_payments, que es lo que evita cobrarlas dos
 * veces y lo que las saca de acá.
 *
 * `dueDay` viene del medio de pago: es el día del mes en que vence ese
 * resumen, y con eso la pantalla muestra "vence el 12" y el aviso diario
 * sabe cuándo recordarlo.
 *
 * El total que sale de acá tiene su espejo en SQL (la vista
 * v_card_statements, que usa el aviso del servidor): si cambia la regla de
 * un lado, hay que cambiarla del otro.
 */

/**
 * Meses, hasta el actual, en los que este plan tiene una cuota que todavía no
 * se cobró, con el número de cuota que cae en cada uno.
 */
const cuotasImpagas = (inst, isPaid, hasta) => {
  const primero = monthStartISO(new Date(`${inst.start_date}T00:00:00`))
  const pendientes = []
  for (let i = 0; i < inst.total_installments; i++) {
    const mes = addMonthsISO(primero, i)
    if (mes > hasta) break
    if (!isPaid(inst.id, mes)) pendientes.push({ mes, numero: i + 1 })
  }
  return pendientes
}

export function useCardStatements() {
  const { dueCards, dueMonths: mesesConCompras, settleDue, loading } = useCardCharges()
  const { installments } = useInstallments()
  const { isPaid } = useInstallmentPayments()
  const { methods } = usePaymentMethods()

  const { statements, dueMonths } = useMemo(() => {
    const hasta = monthStartISO()

    // Las cuotas se miran por su cuenta y no sólo en los meses que tienen
    // compras sin pagar. Es la diferencia entre ver y no ver una tarjeta cuyo
    // resumen es puras cuotas: al pagar las otras tarjetas ya no quedaban
    // meses con compras pendientes y esa tarjeta se caía de la lista sin que
    // nadie la hubiera pagado.
    const cuotasPorTarjeta = new Map()
    const meses = new Set(mesesConCompras)

    for (const inst of installments) {
      for (const { mes, numero } of cuotasImpagas(inst, isPaid, hasta)) {
        const clave = inst.payment_method_id ?? `legacy:${inst.payment_method}`
        const actual = cuotasPorTarjeta.get(clave) ?? {
          total: 0,
          items: [],
          months: new Set(),
        }
        actual.total += Number(inst.amount_per_installment)
        actual.items.push({
          id: `${inst.id}-${mes}`,
          description: inst.description,
          label: `Cuota ${numero} de ${inst.total_installments}`,
          amount: Number(inst.amount_per_installment),
        })
        actual.months.add(mes)
        cuotasPorTarjeta.set(clave, actual)
        meses.add(mes)
      }
    }

    // Una tarjeta puede tener sólo cuotas este mes (ninguna compra nueva):
    // igual tiene que aparecer, porque el banco la va a debitar.
    const claves = new Set([...dueCards.map((c) => c.key), ...cuotasPorTarjeta.keys()])

    const lista = [...claves]
      .map((clave) => {
        const compras = dueCards.find((c) => c.key === clave)
        const cuotas = cuotasPorTarjeta.get(clave) ?? { total: 0, items: [], months: new Set() }
        const nombreDeCuota = cuotasPorTarjeta.has(clave)
          ? installments.find(
              (i) => (i.payment_method_id ?? `legacy:${i.payment_method}`) === clave
            )?.payment_methods?.name
          : null
        const methodId = compras?.methodId ?? (clave.startsWith('legacy:') ? null : clave)

        return {
          key: clave,
          methodId,
          name: compras?.name ?? nombreDeCuota ?? 'Tarjeta',
          dueDay: methods.find((m) => m.id === methodId)?.due_day ?? null,
          // Los meses de ESTA tarjeta: los que debe por compras y los que debe
          // sólo por cuotas. El cierre recorre esta lista, así no pide meses
          // que son de otra tarjeta.
          months: [...new Set([...(compras?.months ?? []), ...cuotas.months])].sort(),
          gastos: { total: compras?.total ?? 0, items: compras?.items ?? [] },
          cuotas: { ...cuotas, items: [...cuotas.items].sort((a, b) => b.amount - a.amount) },
          total: (compras?.total ?? 0) + cuotas.total,
        }
      })
      .sort((a, b) => b.total - a.total)

    return { statements: lista, dueMonths: [...meses].sort() }
  }, [dueCards, mesesConCompras, installments, isPaid, methods])

  // Lo que el banco va a debitar en total, contando cuotas
  const totalResumenes = statements.reduce((sum, s) => sum + s.total, 0)

  return { statements, dueMonths, totalResumenes, settleDue, loading }
}
