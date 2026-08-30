import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BarChart3, Eye, MessageCircle, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loading } from '../components/Loading'

type Kpis = { total: number; active: number; views: number; whatsapp: number }

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    setKpis(null)
    const [total, active, views, whatsapp] = await Promise.all([
      supabase.from('oxxen_connect_cards').select('*', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('oxxen_connect_cards').select('*', { count: 'exact', head: true }).eq('active', true).is('deleted_at', null),
      supabase.from('oxxen_connect_analytics_events').select('*', { count: 'exact', head: true }).eq('event_type', 'view'),
      supabase.from('oxxen_connect_analytics_events').select('*', { count: 'exact', head: true }).eq('event_type', 'whatsapp'),
    ])

    const firstError = total.error || active.error || views.error || whatsapp.error
    if (firstError) {
      setError(firstError.message || 'No pudimos cargar las estadísticas.')
      return
    }

    setKpis({ total: total.count || 0, active: active.count || 0, views: views.count || 0, whatsapp: whatsapp.count || 0 })
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">OXXEN CONNECT</span><h1>Dashboard</h1><p>Resumen de tu red de tarjetas digitales.</p></div><Link className="primary-button" to="/admin/clientes/nuevo">Nueva tarjeta</Link></header>
      {error ? <div className="empty-state"><h2>No pudimos cargar las estadísticas</h2><p>{error}</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : !kpis ? <Loading/> : <div className="kpi-grid">
        <Kpi icon={<Users/>} label="Perfiles totales" value={kpis.total}/>
        <Kpi icon={<BarChart3/>} label="Perfiles activos" value={kpis.active}/>
        <Kpi icon={<Eye/>} label="Vistas" value={kpis.views}/>
        <Kpi icon={<MessageCircle/>} label="Clics WhatsApp" value={kpis.whatsapp}/>
      </div>}
      <div className="panel"><h2>Flujo de trabajo</h2><div className="steps"><span>1</span><p><strong>Crea el cliente</strong><br/>Completa sus datos y sube su marca.</p><span>2</span><p><strong>Obtén la URL permanente</strong><br/>El sistema genera un identificador físico que nunca cambia.</p><span>3</span><p><strong>Programa NFC + QR</strong><br/>Ambos apuntan a esa misma URL permanente.</p><span>4</span><p><strong>Edita cuando quieras</strong><br/>Nombre, empresa y alias pueden cambiar sin reprogramar la tarjeta física.</p></div></div>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article className="kpi-card"><div className="kpi-icon">{icon}</div><span>{label}</span><strong>{value.toLocaleString()}</strong></article>
}
