import { Outlet } from 'react-router-dom'
import { CloudOff, RefreshCw } from 'lucide-react'
import NextMonthBanner from './NextMonthBanner'
import BottomNav from './BottomNav'
import { useOfflineQueue } from '../../hooks/useOfflineQueue'

function OfflineIndicator() {
  const { pending, online } = useOfflineQueue()
  if (online && pending === 0) return null

  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-lg items-center gap-2 px-4 pt-3"
    >
      <div
        className={`flex w-full items-center gap-2 rounded-xl border-2 px-4 py-2 text-base font-medium ${
          online
            ? 'border-leaf bg-leaf/10 text-leaf'
            : 'border-line bg-card text-ink-soft'
        }`}
      >
        {online ? (
          <RefreshCw size={20} aria-hidden="true" className="shrink-0" />
        ) : (
          <CloudOff size={20} aria-hidden="true" className="shrink-0" />
        )}
        <span>
          {pending > 0
            ? `${pending} ${pending === 1 ? 'gasto guardado' : 'gastos guardados'} en el teléfono${online ? ', sincronizando…' : ' (sin internet)'}`
            : 'Sin internet: lo que cargues se guarda y sube después.'}
        </span>
      </div>
    </div>
  )
}

export default function AppShell() {
  return (
    <div className="min-h-dvh bg-paper">
      <NextMonthBanner />
      <OfflineIndicator />
      <main className="mx-auto w-full max-w-lg px-4 pb-32 pt-5">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
