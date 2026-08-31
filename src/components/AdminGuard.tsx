import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Loading } from './Loading'
import { MfaGate, roleRequiresMfa } from './MfaGate'

export function AdminGuard() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [requiresMfa, setRequiresMfa] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState(false)
  const location = useLocation()

  const check = useCallback(async () => {
    setAccessError(false)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setAccessError(true)
      setLoading(false)
      return
    }

    const currentUser = session?.user ?? null
    setUser(currentUser)
    if (!currentUser) {
      setIsAdmin(false)
      setRole(null)
      setRequiresMfa(false)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('oxxen_connect_admins')
      .select('user_id,role')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (error) {
      setAccessError(true)
      setIsAdmin(false)
      setRole(null)
      setRequiresMfa(false)
      setLoading(false)
      return
    }

    if (!data) {
      setIsAdmin(false)
      setRole(null)
      setRequiresMfa(false)
      setLoading(false)
      return
    }

    setIsAdmin(true)
    setRole(data.role)

    if (roleRequiresMfa(data.role)) {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error) {
        setAccessError(true)
        setRequiresMfa(false)
      } else {
        setRequiresMfa(assurance.data.currentLevel !== 'aal2')
      }
    } else {
      setRequiresMfa(false)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true

    const runCheck = async () => {
      if (!active) return
      await check()
    }

    void runCheck()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void runCheck())

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [check])

  if (loading) return <div className="screen-center"><Loading label="Verificando acceso..." /></div>
  if (accessError) return <div className="screen-center"><div className="empty-state"><h2>No pudimos verificar el acceso</h2><p>Puede ser un problema temporal de conexión. Recarga la página para intentarlo nuevamente.</p></div></div>
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  if (!isAdmin || !role) return <div className="screen-center"><div className="empty-state"><h2>Acceso no autorizado</h2><p>Esta cuenta no está habilitada como administradora de OXXEN Connect.</p></div></div>
  if (requiresMfa) return <MfaGate role={role} onVerified={() => void check()} />

  return <Outlet />
}
