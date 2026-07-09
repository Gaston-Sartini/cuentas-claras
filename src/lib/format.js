// Pesos redondos para el banner y los resúmenes: $ 1.234.567
export const formatARS = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n ?? 0)

// Con centavos, para el detalle de movimientos (paso 4 en adelante)
export const formatARSExact = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n ?? 0)

// "12.000" o "12000" o "12000,50" -> número. Punto = miles, coma = decimales.
export const parseARSInput = (str) => {
  if (!str) return 0
  const clean = String(str).replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number(clean)
  return Number.isFinite(n) ? n : 0
}
