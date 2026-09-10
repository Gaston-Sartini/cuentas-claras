/**
 * Piezas compartidas por todos los mini-formularios de la app: campos de
 * texto y monto, mensaje de error y la botonera Guardar/Cancelar. Un solo
 * lugar para el estilo y el comportamiento (teclado numérico, filtrado de
 * caracteres) de cada tipo de campo.
 */

export const INPUT_CLS = 'tap w-full rounded-xl border-2 border-line bg-card px-3 py-2 text-lg'

export function CampoTexto({ label, value, onChange, placeholder, autoFocus }) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-bold">{label}</span>
      <input
        className={INPUT_CLS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </label>
  )
}

export function CampoMonto({ label, value, onChange, placeholder = '0', ayuda }) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-bold">{label}</span>
      <div className="flex items-center gap-1 rounded-xl border-2 border-line bg-card px-3">
        <span className="text-lg font-bold text-ink-soft">$</span>
        <input
          className="money tap w-full bg-transparent py-2 text-lg outline-none"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder={placeholder}
        />
      </div>
      {ayuda && <span className="mt-1 block text-sm text-ink-soft">{ayuda}</span>}
    </label>
  )
}

// Solo dígitos: cantidad de cuotas, número de cuota, etc.
export function CampoEntero({ label, value, onChange, placeholder, ayuda }) {
  return (
    <label className="block">
      <span className="mb-1 block text-base font-bold">{label}</span>
      <input
        className={`money ${INPUT_CLS}`}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
      />
      {ayuda && <span className="mt-1 block text-sm text-ink-soft">{ayuda}</span>}
    </label>
  )
}

export function MensajeError({ children }) {
  if (!children) return null
  return (
    <p
      role="alert"
      className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep"
    >
      {children}
    </p>
  )
}

export function BotonesForm({
  etiqueta = 'Guardar',
  guardando,
  onGuardar,
  onCancelar,
  tono = 'bg-leaf',
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onGuardar}
        disabled={guardando}
        className={`tap flex-1 rounded-xl ${tono} px-4 py-3 text-lg font-bold text-white disabled:opacity-60`}
      >
        {guardando ? 'Guardando…' : etiqueta}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="tap rounded-xl border-2 border-line px-4 py-3 text-lg font-bold text-ink-soft"
      >
        Cancelar
      </button>
    </div>
  )
}

// Botón cuadrado de ícono (editar/borrar) usado en todas las listas.
export function BotonIcono({ onClick, label, className = 'px-3', children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`tap grid shrink-0 place-items-center rounded-xl border-2 border-line text-ink-soft ${className}`}
    >
      {children}
    </button>
  )
}
