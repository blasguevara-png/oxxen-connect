import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { Loading } from './Loading'

export function AdminGuard() {
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    let active = true

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      const currentUser = session?.user ?? null
      setUser(currentUser)

      if (!currentUser) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('oxxen_connect_admins')
        .select('user_id')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      if (!active) return
      setIsAdmin(Boolean(data))
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
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  if (!isAdmin) return <div className="screen-center"><div className="empty-state"><h2>Acceso no autorizado</h2><p>Esta cuenta no está habilitada como administradora de OXXEN Connect.</p></div></div>

  return <Outlet />
}
