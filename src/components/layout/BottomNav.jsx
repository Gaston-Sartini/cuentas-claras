import { NavLink } from 'react-router-dom'
import { House, ReceiptText, Wallet, CalendarClock } from 'lucide-react'

const ITEMS = [
  { to: '/', label: 'Inicio', icon: House, end: true },
  { to: '/historial', label: 'Historial', icon: ReceiptText },
  { to: '/billeteras', label: 'Billeteras', icon: Wallet },
  { to: '/proximos', label: 'Próximos', icon: CalendarClock },
]

export default function BottomNav() {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-lg">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-[64px] flex-col items-center justify-center gap-1 px-1 pt-1 text-[15px] ${
                  isActive ? 'font-bold text-alert' : 'font-medium text-ink-soft'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`h-1 w-8 rounded-full ${
                      isActive ? 'bg-alert' : 'bg-transparent'
                    }`}
                  />
                  <Icon size={26} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
