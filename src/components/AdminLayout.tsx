import { Boxes, ClipboardList, CreditCard, ExternalLink, History, LayoutDashboard, LogOut, Users } from 'lucide-react'
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
          <NavLink to="/admin/pedidos"><ClipboardList size={18}/> Pedidos</NavLink>
          <NavLink to="/admin/tarjetas"><CreditCard size={18}/> Tarjetas</NavLink>
          <NavLink to="/admin/inventario-nfc"><Boxes size={18}/> Inventario NFC</NavLink>
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
