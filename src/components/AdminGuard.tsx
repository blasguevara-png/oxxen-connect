import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Loading } from './Loading'

export function AdminGuard() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let active = true

    const check = async () => {
      setAccessError(false)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (!active) return
      if (sessionError) {
        setAccessError(true)
        setLoading(false)
        return
      }

      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (!currentUser) {
        setIsAdmin(false)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('oxxen_connect_admins')
        .select('user_id,role')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (!active) return
      if (error) {
        setAccessError(true)
        setIsAdmin(false)
      } else {
        setIsAdmin(Boolean(data))
      }
      setLoading(false)
    }

    void check()
    const { data: listener } = supabase.auth.onAuthStateChange(() => void check())

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div className="screen-center"><Loading label="Verificando acceso..." /></div>
  if (accessError) return <div className="screen-center"><div className="empty-state"><h2>No pudimos verificar el acceso</h2><p>Puede ser un problema temporal de conexión. Recarga la página para intentarlo nuevamente.</p></div></div>
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  if (!isAdmin) return <div className="screen-center"><div className="empty-state"><h2>Acceso no autorizado</h2><p>Esta cuenta no está habilitada como administradora de OXXEN Connect.</p></div></div>

  return <Outlet />
}
