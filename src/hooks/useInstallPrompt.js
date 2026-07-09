import { useCallback, useEffect, useState } from 'react'

// ¿Ya está corriendo como app instalada?
const enAppInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const esIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent)

/**
 * Botón "Instalar" propio: Chrome/Edge en Android disparan beforeinstallprompt,
 * lo guardamos y lo re-disparamos cuando el usuario toca el botón. En iPhone
 * ese evento no existe: ahí corresponde mostrar instrucciones (Compartir →
 * Agregar a pantalla de inicio).
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [instalada, setInstalada] = useState(enAppInstalada())

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault() // sin esto Chrome muestra (o descarta) su mini-aviso propio
      setDeferred(e)
    }
    const onInstalled = () => {
      setInstalada(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const instalar = useCallback(async () => {
    if (!deferred) return
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setDeferred(null)
  }, [deferred])

  return {
    puedeInstalar: !!deferred && !instalada,
    esIOS: esIOS() && !instalada,
    instalada,
    instalar,
  }
}
