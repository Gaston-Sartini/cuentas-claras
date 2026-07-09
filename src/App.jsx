import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/layout/AppShell'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Cargar from './pages/Cargar'
import Historial from './pages/Historial'
import Billeteras from './pages/Billeteras'
import Proximos from './pages/Proximos'
import Familia from './pages/Familia'

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper">
      <p className="font-display text-3xl font-semibold">Cuentas Claras</p>
    </div>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) return <Splash />
  if (!session) return <Login />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="cargar" element={<Cargar />} />
        <Route path="historial" element={<Historial />} />
        <Route path="billeteras" element={<Billeteras />} />
        <Route path="proximos" element={<Proximos />} />
        <Route path="familia" element={<Familia />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
