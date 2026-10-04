import { useMemo } from 'react'
import { useCardCharges } from './useCardCharges'
import { installmentDueInMonth, useInstallments } from './useInstallments'

/**
 * El resumen de cada tarjeta que vence: lo que el banco va a debitar, que son
 * las compras del período MÁS las cuotas que caen en esos mismos meses.
 *
 * Vive acá, componiendo los dos hooks, para que el Inicio y Próximos muestren
 * exactamente el mismo total y el mismo desglose.
 *
 * Ojo con una distinción que importa: `gastos` es lo que el cierre marca como
 * pagado y descuenta de la billetera; `cuotas` son proyección (no tienen
 * estado de pagada) y van al total sólo para poder cuadrar contra el resumen
 * de verdad.
 */
export function useCardStatements() {
  const { dueCards, dueMonths, dueTotal, settleDue, loading } = useCardCharges()
  const { installments } = useInstallments()

  const statements = useMemo(() => {
    // Cuotas que vencen en los meses que se están pagando, por tarjeta
    const cuotasPorTarjeta = new Map()
    for (const inst of installments) {
      for (const mes of dueMonths) {
        const k = installmentDueInMonth(inst, mes)
        if (!k) continue
        const clave = inst.payment_method_id ?? `legacy:${inst.payment_method}`
        const actual = cuotasPorTarjeta.get(clave) ?? { total: 0, items: [] }
        actual.total += Number(inst.amount_per_installment)
        actual.items.push({
          id: `${inst.id}-${mes}`,
          description: inst.description,
          label: `Cuota ${k} de ${inst.total_installments}`,
          amount: Number(inst.amount_per_installment),
        })
        cuotasPorTarjeta.set(clave, actual)
      }
    }

    // Una tarjeta puede tener sólo cuotas este mes (ninguna compra nueva):
    // igual tiene que aparecer, porque el banco la va a debitar.
    const claves = new Set([...dueCards.map((c) => c.key), ...cuotasPorTarjeta.keys()])

    return [...claves]
      .map((clave) => {
        const compras = dueCards.find((c) => c.key === clave)
        const cuotas = cuotasPorTarjeta.get(clave) ?? { total: 0, items: [] }
        const nombreDeCuota = cuotasPorTarjeta.has(clave)
          ? installments.find(
              (i) => (i.payment_method_id ?? `legacy:${i.payment_method}`) === clave
            )?.payment_methods?.name
          : null

        return {
          key: clave,
          methodId: compras?.methodId ?? (clave.startsWith('legacy:') ? null : clave),
          name: compras?.name ?? nombreDeCuota ?? 'Tarjeta',
          months: compras?.months ?? dueMonths,
          gastos: { total: compras?.total ?? 0, items: compras?.items ?? [] },
          cuotas: { ...cuotas, items: [...cuotas.items].sort((a, b) => b.amount - a.amount) },
          total: (compras?.total ?? 0) + cuotas.total,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [dueCards, dueMonths, installments])

  // Lo que el banco va a debitar en total, contando cuotas
  const totalResumenes = statements.reduce((sum, s) => sum + s.total, 0)

  return { statements, dueMonths, dueTotal, totalResumenes, settleDue, loading }
}
