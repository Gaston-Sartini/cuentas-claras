import { useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const DISMISS_KEY = 'cc-install-dismissed'

/**
 * Tarjeta "Instalar la app": aparece hasta que la app quede instalada o el
 * usuario la cierre (queda cerrada, guardado en el teléfono). En Android
 * dispara el diálogo nativo de Chrome; en iPhone muestra los dos toques
 * que hay que dar en Safari.
 */
export default function InstallBanner() {
  const { puedeInstalar, esIOS, instalar } = useInstallPrompt()
  const [cerrado, setCerrado] = useState(
    () => localStorage.getItem(DISMISS_KEY) === '1'
  )

  if (cerrado || (!puedeInstalar && !esIOS)) return null

  const cerrar = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setCerrado(true)
  }

  return (
    <div className="relative rounded-2xl border-2 border-leaf bg-leaf/10 p-4">
      <button
        type="button"
        onClick={cerrar}
        aria-label="No mostrar más este aviso"
        className="tap absolute right-1 top-1 grid place-items-center rounded-xl text-ink-soft"
      >
        <X size={22} aria-hidden="true" />
      </button>

      <h2 className="pr-10 text-lg font-bold text-leaf">
        Llevala en el teléfono
      </h2>

      {puedeInstalar ? (
        <>
          <p className="mt-1 text-base text-ink-soft">
            Queda como una app más, con su ícono, y abre al toque.
          </p>
          <button
            type="button"
            onClick={instalar}
            className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-leaf px-4 py-3 text-lg font-bold text-white"
          >
            <Download size={22} aria-hidden="true" />
            Instalar la app
          </button>
        </>
      ) : (
        <ol className="mt-2 space-y-2 text-base text-ink-soft">
          <li className="flex items-center gap-2">
            <Share size={22} aria-hidden="true" className="shrink-0" />
            <span>
              1. Tocá <strong>Compartir</strong> (el cuadradito con la flecha)
            </span>
          </li>
          <li className="flex items-center gap-2">
            <SquarePlus size={22} aria-hidden="true" className="shrink-0" />
            <span>
              2. Elegí <strong>Agregar a pantalla de inicio</strong>
            </span>
          </li>
        </ol>
      )}
    </div>
  )
}
