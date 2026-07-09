import { Component } from 'react'

/**
 * Red de seguridad: si algo falla al renderizar, en vez de pantalla en blanco
 * mostramos un mensaje claro con un botón para recargar. Evita que un error
 * puntual deje la app inusable para la familia.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
        <div className="max-w-sm space-y-4">
          <p className="font-display text-3xl font-semibold">Uy, algo se rompió</p>
          <p className="text-lg text-ink-soft">
            Probá recargar. Si sigue pasando, avisanos.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="tap w-full rounded-2xl bg-ink px-6 py-4 text-xl font-bold text-white"
          >
            Recargar
          </button>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border-2 border-line bg-card p-3 text-left text-sm text-ink-soft">
            {String(this.state.error?.message || this.state.error)}
          </pre>
        </div>
      </div>
    )
  }
}
