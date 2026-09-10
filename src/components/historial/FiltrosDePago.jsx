import { FILTROS_POR_TIPO, metodosDelTipo } from '../../lib/paymentFilters'

/**
 * Filtros en dos niveles: arriba el tipo de pago, en una grilla pareja; abajo,
 * sólo si ese tipo tiene más de un medio cargado, un desplegable para elegir
 * la tarjeta o billetera puntual.
 *
 * El desplegable (en vez de otra hilera de chips) es lo que mantiene esto
 * prolijo en una familia con seis o siete tarjetas: ocupa siempre un renglón,
 * no importa cuántas haya.
 */
export default function FiltrosDePago({ filtro, onChange, methods }) {
  const metodos = metodosDelTipo(methods, filtro.tipo)

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="group"
        aria-label="Filtrar por tipo de pago"
      >
        {FILTROS_POR_TIPO.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange({ tipo: f.id, metodo: null })}
            aria-pressed={filtro.tipo === f.id}
            className={`tap rounded-xl border-2 px-2 py-3 text-base font-bold ${
              filtro.tipo === f.id
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-card text-ink-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {metodos.length > 0 && (
        <label className="flex items-center gap-2 rounded-xl border-2 border-line bg-card px-3">
          <span className="shrink-0 text-base font-bold text-ink-soft">¿Cuál?</span>
          <select
            className="tap w-full bg-transparent py-2 text-base font-bold outline-none"
            value={filtro.metodo ?? ''}
            onChange={(e) => onChange({ ...filtro, metodo: e.target.value || null })}
          >
            <option value="">Todas</option>
            {metodos.map((m) => (
              <option key={m.id} value={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
