import {
  addDaysISO,
  addMonthsISO,
  dayDiff,
  daysInMonth,
  formatShortDate,
  monthInRange,
  todayISO,
} from './dates'

/**
 * Qué vence pronto: gastos fijos con día de vencimiento y deudas con fecha.
 * Devuelve ítems normalizados para la tarjeta de Vencimientos del Inicio y
 * para los avisos de la PWA. Lógica pura, sin React ni Supabase.
 */

const DIAS_AVISO = 7

// Fecha real del próximo vencimiento de un día-de-mes: "vence el 31" en un
// mes de 30 cae el último día. Si el día ya pasó este mes, va al que viene.
export const proximoVencimientoDeDia = (dueDay, hoy = todayISO()) => {
  const fechaEnMes = (mesISO) => {
    const dia = Math.min(dueDay, daysInMonth(mesISO))
    return `${mesISO.slice(0, 8)}${String(dia).padStart(2, '0')}`
  }
  const esteMes = fechaEnMes(`${hoy.slice(0, 7)}-01`)
  return esteMes >= hoy ? esteMes : fechaEnMes(addMonthsISO(`${hoy.slice(0, 7)}-01`, 1))
}

/**
 * Ítems que vencen dentro de `dias` días (los fijos solo hacia adelante:
 * si el día ya pasó no sabemos si se pagó; las deudas sí muestran vencidas,
 * porque siguen activas hasta que alguien las marca saldadas).
 */
export const vencimientosProximos = ({
  fijos = [],
  deudas = [],
  hoy = todayISO(),
  dias = DIAS_AVISO,
}) => {
  const limite = addDaysISO(hoy, dias)
  const items = []

  for (const f of fijos) {
    if (!f.due_day) continue
    const fecha = proximoVencimientoDeDia(f.due_day, hoy)
    if (fecha > limite) continue
    if (!monthInRange(f.start_month, f.end_month, `${fecha.slice(0, 7)}-01`)) continue
    items.push({
      id: `fijo-${f.id}`,
      titulo: f.description,
      monto: Number(f.amount),
      fecha,
      vencida: false,
    })
  }

  for (const d of deudas) {
    if (!d.due_date || d.settled_at) continue
    if (d.due_date > limite) continue
    items.push({
      id: `deuda-${d.id}`,
      titulo:
        d.direction === 'we_owe' ? `Pagar: ${d.description}` : `Cobrar: ${d.description}`,
      monto: Number(d.amount),
      fecha: d.due_date,
      vencida: d.due_date < hoy,
    })
  }

  return items.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// "vence hoy" / "vence mañana" / "vence el 15 sept" / "venció hace 3 días"
export const etiquetaVencimiento = (fechaISO, hoy = todayISO()) => {
  const d = dayDiff(hoy, fechaISO)
  if (d < -1) return `venció hace ${-d} días`
  if (d === -1) return 'venció ayer'
  if (d === 0) return 'vence hoy'
  if (d === 1) return 'vence mañana'
  return `vence el ${formatShortDate(fechaISO)}`
}
