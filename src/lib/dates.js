export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export const nextMonthName = () => MESES[(new Date().getMonth() + 1) % 12]

// "2026-07-06" -> "6 jul" (parseo local, sin corrimiento de zona horaria)
export const formatShortDate = (isoDate) =>
  new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(
    new Date(`${isoDate}T00:00:00`)
  )

export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Primer día del mes en ISO ("2026-07-01"): la clave con la que billing_month,
// income_projections y las cuotas agrupan todo.
export const monthStartISO = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`
}

// "2026-07-01" + 2 -> "2026-09-01" (aritmética pura, sin Date ni zonas horarias)
export const addMonthsISO = (monthISO, n) => {
  const [y, m] = monthISO.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const pad = (v) => String(v).padStart(2, '0')
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}

// ¿Un mes cae dentro de la vigencia [start, end]? end null = sigue para siempre.
// Lo usan gastos fijos e ingresos, que comparten el mismo modelo de vigencia.
export const monthInRange = (startISO, endISO, monthISO) =>
  startISO <= monthISO && (!endISO || endISO >= monthISO)

// Meses entre dos primeros-de-mes: monthDiff("2026-07-01", "2026-09-01") = 2
export const monthDiff = (fromISO, toISO) => {
  const [fy, fm] = fromISO.split('-').map(Number)
  const [ty, tm] = toISO.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

// "2026-07-01" -> "julio 2026" / "julio" (si es del año en curso)
export const monthLabel = (monthISO, { withYear } = {}) => {
  const [y, m] = monthISO.split('-').map(Number)
  const showYear = withYear ?? y !== new Date().getFullYear()
  return `${MESES[m - 1]}${showYear ? ` ${y}` : ''}`
}
