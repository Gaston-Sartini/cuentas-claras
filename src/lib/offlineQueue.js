import { supabase } from './supabase'

// Cola de gastos cargados sin señal. Viven en localStorage hasta que hay
// internet y se insertan en Supabase. Pensada para el caso "estoy en el súper
// sin datos": el gasto se anota igual y sincroniza solo al volver la conexión.
const KEY = 'cc-pending-ops'
const listeners = new Set()

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

const write = (ops) => {
  localStorage.setItem(KEY, JSON.stringify(ops))
  listeners.forEach((fn) => fn(ops.length))
}

export const pendingCount = () => read().length

// Avisa cuando cambia la cantidad de pendientes (para el indicador)
export const subscribe = (fn) => {
  listeners.add(fn)
  fn(read().length)
  return () => listeners.delete(fn)
}

// Encola una inserción. table: 'transactions' | 'installments'
export const enqueue = (table, payload) => {
  const ops = read()
  ops.push({ id: crypto.randomUUID(), table, payload, ts: Date.now() })
  write(ops)
}

// Intenta vaciar la cola. Corta al primer fallo (probablemente sigue sin red)
// y reintenta en la próxima. Devuelve cuántas subió.
let flushing = false
export const flush = async () => {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let subidas = 0
  try {
    let ops = read()
    while (ops.length > 0) {
      const op = ops[0]
      const { error } = await supabase.from(op.table).insert(op.payload)
      // 23505 = duplicado (ya se había subido): lo damos por hecho y seguimos
      if (error && error.code !== '23505') break
      ops = ops.slice(1)
      write(ops)
      subidas += 1
    }
  } finally {
    flushing = false
  }
  return subidas
}
