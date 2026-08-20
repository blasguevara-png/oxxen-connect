import { useEffect, useState, type ReactNode } from 'react'
import { BarChart3, Eye, MessageCircle, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loading } from '../components/Loading'

type Kpis = { total: number; active: number; views: number; whatsapp: number }

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)

  useEffect(() => {
    const load = async () => {
      const [total, active, views, whatsapp] = await Promise.all([
        supabase.from('oxxen_connect_cards').select('*', { count: 'exact', head: true }),
        supabase.from('oxxen_connect_cards').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('oxxen_connect_analytics_events').select('*', { count: 'exact', head: true }).eq('event_type', 'view'),
        supabase.from('oxxen_connect_analytics_events').select('*', { count: 'exact', head: true }).eq('event_type', 'whatsapp'),
      ])
      setKpis({ total: total.count || 0, active: active.count || 0, views: views.count || 0, whatsapp: whatsapp.count || 0 })
    }
    void load()
  }, [])

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">OXXEN CONNECT</span><h1>Dashboard</h1><p>Resumen de tu red de tarjetas digitales.</p></div><Link className="primary-button" to="/admin/clientes/nuevo">Nueva tarjeta</Link></header>
      {!kpis ? <Loading/> : <div className="kpi-grid">
        <Kpi icon={<Users/>} label="Perfiles totales" value={kpis.total}/>
        <Kpi icon={<BarChart3/>} label="Perfiles activos" value={kpis.active}/>
        <Kpi icon={<Eye/>} label="Vistas" value={kpis.views}/>
        <Kpi icon={<MessageCircle/>} label="Clics WhatsApp" value={kpis.whatsapp}/>
      </div>}
      <div className="panel"><h2>Flujo de trabajo</h2><div className="steps"><span>1</span><p><strong>Crea el cliente</strong><br/>Completa sus datos y sube su marca.</p><span>2</span><p><strong>Copia la URL</strong><br/>El sistema mantiene una URL estable por perfil.</p><span>3</span><p><strong>Programa NFC + QR</strong><br/>Ambos apuntan a esa misma URL.</p><span>4</span><p><strong>Edita cuando quieras</strong><br/>No necesitas reprogramar la tarjeta física.</p></div></div>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article className="kpi-card"><div className="kpi-icon">{icon}</div><span>{label}</span><strong>{value.toLocaleString()}</strong></article>
}
