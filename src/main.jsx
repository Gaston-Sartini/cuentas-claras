import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'

// Actualización silenciosa: al abrir la app (o volver a ella) se chequea si
// hay versión nueva; si la hay, el service worker la activa y la app se
// recarga sola. Sin botones ni avisos.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration?.update()
    })
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
