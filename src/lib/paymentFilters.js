import { methodLabel } from './icons'

/**
 * Filtros del Historial en dos niveles, para que no queden diez chips
 * amontonados: arriba el tipo de pago (una fila fija de cuatro) y, sólo si
 * ese tipo tiene más de un medio cargado, abajo los medios concretos
 * ("Visa Yami", "Mastercard"…).
 *
 * El filtro es { tipo, metodo }: metodo null = todos los de ese tipo.
 */

export const FILTRO_TODOS = 'todos'

export const FILTRO_INICIAL = { tipo: FILTRO_TODOS, metodo: null }

export const FILTROS_POR_TIPO = [
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
 * Medios de pago de la familia que caen dentro de un tipo. Con uno solo no
 * hace falta la segunda fila: el chip del tipo ya alcanza.
 * Reusa tipoDeMetodo envolviendo el método como si fuera un movimiento, así
 * la clasificación vive en un solo lugar.
 */
export const metodosDelTipo = (methods, tipo) => {
  if (tipo === FILTRO_TODOS) return []
  const enTipo = methods.filter((m) => tipoDeMetodo({ payment_methods: m }) === tipo)
  return enTipo.length > 1 ? enTipo : []
}

/**
 * ¿El movimiento pasa el filtro? El medio concreto compara por nombre
 * (methodLabel) para cubrir también las filas viejas que sólo tienen el enum
 * legacy (visa/mastercard/…).
 */
export const cumpleFiltro = (t, { tipo, metodo }) => {
  if (tipo !== FILTRO_TODOS && tipoDeMetodo(t) !== tipo) return false
  if (metodo && methodLabel(t) !== metodo) return false
  return true
}
