import { useState } from 'react'
import { Eye, EyeOff, Users, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import InstallBanner from '../components/InstallBanner'

const traducirError = (msg = '') => {
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (msg.includes('already registered')) return 'Ese email ya tiene una cuenta. Probá entrar.'
  if (msg.includes('at least 6')) return 'La contraseña necesita al menos 6 caracteres.'
  if (msg.includes('valid email')) return 'Fijate que el email esté bien escrito.'
  return msg || 'Algo salió mal. Probá de nuevo.'
}

const inputCls =
  'tap w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-lg text-ink placeholder:text-ink-soft/60'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [tipoAlta, setTipoAlta] = useState('nueva') // 'nueva' | 'codigo'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const entrar = async () => {
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(traducirError(error.message))
    setBusy(false)
    // Si salió bien, onAuthStateChange redirige solo.
  }

  const crearCuenta = async () => {
    setError('')
    setInfo('')

    if (!fullName.trim()) return setError('Poné tu nombre.')
    if (!email.trim()) return setError('Poné tu email.')
    if (password.length < 6) return setError('La contraseña necesita al menos 6 caracteres.')
    if (tipoAlta === 'nueva' && !orgName.trim())
      return setError('Poné un nombre para la familia (ej: "Familia Sartini").')
    if (tipoAlta === 'codigo' && !inviteCode.trim())
      return setError('Poné el código que te compartieron.')

    setBusy(true)

    if (tipoAlta === 'codigo') {
      const { data: existe, error: rpcError } = await supabase.rpc('check_invite_code', {
        p_code: inviteCode,
      })
      if (rpcError || !existe) {
        setBusy(false)
        return setError('Ese código no existe. Fijate que esté bien escrito.')
      }
    }

    const metadata =
      tipoAlta === 'nueva'
        ? { full_name: fullName.trim(), org_name: orgName.trim() }
        : { full_name: fullName.trim(), invite_code: inviteCode.trim() }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata },
    })

    if (error) {
      setError(traducirError(error.message))
    } else if (!data.session) {
      setInfo('Te mandamos un correo para confirmar la cuenta. Abrilo y después volvé a entrar acá.')
    }
    // Con confirmación desactivada, la sesión arranca sola y la app redirige.
    setBusy(false)
  }

  const onSubmit = () => (mode === 'login' ? entrar() : crearCuenta())

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-alert">
            <span className="font-display text-4xl font-bold text-white">$</span>
          </div>
          <h1 className="font-display text-4xl font-semibold">Cuentas Claras</h1>
          <p className="mt-2 text-lg text-ink-soft">
            Los gastos de la familia, claros y al día.
          </p>
        </header>

        {/* Selector Entrar / Crear cuenta */}
        <div className="mb-6 grid grid-cols-2 rounded-xl border-2 border-line bg-card p-1">
          {[
            { id: 'login', label: 'Entrar' },
            { id: 'signup', label: 'Crear cuenta' },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id)
                setError('')
                setInfo('')
              }}
              className={`tap rounded-lg py-2.5 text-lg font-bold ${
                mode === id ? 'bg-ink text-white' : 'text-ink-soft'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {mode === 'signup' && (
            <label className="block">
              <span className="mb-1 block text-base font-bold">Tu nombre</span>
              <input
                className={inputCls}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej: Norma"
                autoComplete="name"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-base font-bold">Email</span>
            <input
              className={inputCls}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              inputMode="email"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-base font-bold">Contraseña</span>
            <div className="relative">
              <input
                className={`${inputCls} pr-14`}
                type={verPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setVerPass((v) => !v)}
                aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="tap absolute inset-y-0 right-0 grid w-12 place-items-center text-ink-soft"
              >
                {verPass ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          </label>

          {mode === 'signup' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoAlta('nueva')}
                  className={`tap flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center ${
                    tipoAlta === 'nueva'
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-card text-ink-soft'
                  }`}
                >
                  <Users size={24} aria-hidden="true" />
                  <span className="text-base font-bold leading-tight">
                    Empezar una familia nueva
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTipoAlta('codigo')}
                  className={`tap flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center ${
                    tipoAlta === 'codigo'
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-card text-ink-soft'
                  }`}
                >
                  <KeyRound size={24} aria-hidden="true" />
                  <span className="text-base font-bold leading-tight">
                    Ya tengo un código
                  </span>
                </button>
              </div>

              {tipoAlta === 'nueva' ? (
                <label className="block">
                  <span className="mb-1 block text-base font-bold">Nombre de la familia</span>
                  <input
                    className={inputCls}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder='Ej: "Familia Sartini"'
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-base font-bold">Código de invitación</span>
                  <input
                    className={`${inputCls} uppercase tracking-widest`}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="Ej: 3F8A21BC"
                    autoCapitalize="characters"
                  />
                </label>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="rounded-xl border-2 border-alert bg-alert/10 px-4 py-3 text-base font-medium text-alert-deep">
              {error}
            </p>
          )}
          {info && (
            <p role="status" className="rounded-xl border-2 border-leaf bg-leaf/10 px-4 py-3 text-base font-medium text-leaf">
              {info}
            </p>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={busy}
            className="tap w-full rounded-2xl bg-alert px-6 py-4 text-xl font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear mi cuenta'}
          </button>

          <InstallBanner />

          <p className="money pt-2 text-center text-sm text-ink-soft/70">{__APP_INFO__}</p>
        </div>
      </div>
    </div>
  )
}
