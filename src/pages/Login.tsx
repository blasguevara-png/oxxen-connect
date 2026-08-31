import { FormEvent, useState } from 'react'
import { LockKeyhole, Mail } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError || !data.user) {
        setError('Correo o contraseña incorrectos.')
        return
      }

      const { data: admin, error: adminError } = await supabase
        .from('oxxen_connect_admins')
        .select('user_id,role')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (adminError) {
        await supabase.auth.signOut()
        setError('No pudimos verificar tus permisos. Intenta nuevamente.')
        return
      }

      if (!admin) {
        await supabase.auth.signOut()
        setError('Esta cuenta no tiene permisos de administrador.')
        return
      }

      const from = (location.state as { from?: string } | null)?.from || '/admin'
      navigate(from, { replace: true })
    } catch {
      setError('No se pudo iniciar sesión. Verifica tu conexión e intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <Brand />
        <div className="login-heading"><span className="eyebrow">PANEL PRIVADO</span><h1>Control central</h1><p>Administra todas las tarjetas digitales desde una sola cuenta.</p></div>
        <label>Email<div className="input-icon"><Mail size={17}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" /></div></label>
        <label>Contraseña<div className="input-icon"><LockKeyhole size={17}/><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" /></div></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button full" disabled={loading}>{loading ? 'Ingresando...' : 'Iniciar sesión'}</button>
      </form>
    </div>
  )
}
