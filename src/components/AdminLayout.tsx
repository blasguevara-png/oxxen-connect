import { ExternalLink, History, LayoutDashboard, LogOut, Plus, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Brand } from './Brand'

export function AdminLayout() {
  const navigate = useNavigate()

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          <NavLink to="/admin" end><LayoutDashboard size={18}/> Dashboard</NavLink>
          <NavLink to="/admin/clientes"><Users size={18}/> Clientes</NavLink>
          <NavLink to="/admin/clientes/nuevo"><Plus size={18}/> Nueva tarjeta</NavLink>
          <NavLink to="/admin/actividad"><History size={18}/> Actividad</NavLink>
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer"><ExternalLink size={17}/> Ver portada</a>
          <button onClick={logout}><LogOut size={17}/> Cerrar sesión</button>
        </div>
      </aside>
      <main className="admin-main"><Outlet /></main>
    </div>
  )
}
