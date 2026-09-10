import { methodLabel } from './icons'

/**
 * Filtros del Historial: los fijos por tipo de pago + un chip por cada medio
 * de pago real de la familia ("Visa Gasti", "Amex Yami", ...), así se puede
 * ver qué se cargó a cada tarjeta puntual.
 */

export const FILTRO_TODOS = 'todos'
const PREFIJO_METODO = 'metodo:'

const FILTROS_POR_TIPO = [
  { id: FILTRO_TODOS, label: 'Todo' },
  { id: 'cash', label: 'Efectivo' },
  { id: 'debito', label: 'Débito' },
  { id: 'tarjeta', label: 'Tarjetas' },
]

// Clasifica el movimiento por su método (tabla nueva o enum legacy)
export const tipoDeMetodo = (t) => {
  if (t.esCuota) return 'tarjeta'
  if (t.payment_methods) {
    if (t.payment_methods.kind === 'credit') return 'tarjeta'
    return t.payment_methods.wallets?.type === 'cash' ? 'cash' : 'debito'
  }
  if (t.payment_method === 'mastercard' || t.payment_method === 'visa') return 'tarjeta'
  if (t.payment_method === 'cash') return 'cash'
  if (t.payment_method === 'mercadopago') return 'debito'
  return null
}

/**
 * Chips a mostrar: tipos + cada medio de pago por nombre. "Efectivo" ya tiene
 * su chip de tipo, así que el método homónimo no se repite.
 */
export const buildFiltros = (methods) => [
  ...FILTROS_POR_TIPO,
  ...methods
    .filter((m) => m.name.toLowerCase() !== 'efectivo')
    .map((m) => ({ id: `${PREFIJO_METODO}${m.name}`, label: m.name })),
]

/**
 * ¿El movimiento pasa el filtro elegido? Los chips de método comparan por
 * nombre (methodLabel) para cubrir también las filas legacy que solo tienen
 * el enum viejo (visa/mastercard/...).
 */
export const cumpleFiltro = (t, filtroId) => {
  if (filtroId === FILTRO_TODOS) return true
  if (filtroId.startsWith(PREFIJO_METODO))
    return methodLabel(t) === filtroId.slice(PREFIJO_METODO.length)
  return tipoDeMetodo(t) === filtroId
}
