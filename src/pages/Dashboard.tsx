import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BarChart3, Boxes, CheckCircle2, Clock3, CreditCard, Eye, PackageCheck, Users, UserPlus, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { supabase } from '../lib/supabase'

type Kpis = {
  customers_active: number
  orders_open: number
  orders_pending_delivery: number
  orders_pending_payment: number
  nfc_available: number
  nfc_reserved: number
  nfc_defective: number
  profiles_active: number
  views_7d: number
  views_30d: number
  vcards_7d: number
  vcards_30d: number
}

export function Dashboard() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError(''); setKpis(null)
    const { data, error: loadError } = await supabase.rpc('oxxen_connect_get_operational_dashboard')
    if (loadError) {
      setError('El dashboard operativo requiere la migración S3.4. No se modificó ningún dato.')
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) { setError('No pudimos obtener el resumen operativo.'); return }
    setKpis(row as Kpis)
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">OXXEN CONNECT</span><h1>Dashboard</h1><p>Estado operativo de clientes, pedidos, tarjetas, NFC y conversión básica.</p></div><div className="button-row"><Link className="ghost-button" to="/admin/clientes/nuevo">Nuevo cliente</Link><Link className="primary-button" to="/admin/pedidos/nuevo">Nuevo pedido</Link></div></header>
      {error ? <div className="empty-state"><h2>No pudimos cargar el resumen operativo</h2><p>{error}</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : !kpis ? <Loading/> : <>
        <section><h2>Operación</h2><div className="kpi-grid"><Kpi icon={<Users/>} label="Clientes activos" value={kpis.customers_active}/><Kpi icon={<Clock3/>} label="Pedidos abiertos" value={kpis.orders_open}/><Kpi icon={<PackageCheck/>} label="Por entregar" value={kpis.orders_pending_delivery}/><Kpi icon={<WalletCards/>} label="Pago pendiente" value={kpis.orders_pending_payment}/></div></section>
        <section><h2>Inventario y perfiles</h2><div className="kpi-grid"><Kpi icon={<Boxes/>} label="NFC disponibles" value={kpis.nfc_available}/><Kpi icon={<CreditCard/>} label="NFC reservados" value={kpis.nfc_reserved}/><Kpi icon={<CheckCircle2/>} label="NFC defectuosos" value={kpis.nfc_defective}/><Kpi icon={<BarChart3/>} label="Perfiles activos" value={kpis.profiles_active}/></div></section>
        <section><h2>Actividad pública</h2><div className="kpi-grid"><Kpi icon={<Eye/>} label="Vistas 7 días" value={kpis.views_7d}/><Kpi icon={<Eye/>} label="Vistas 30 días" value={kpis.views_30d}/><Kpi icon={<UserPlus/>} label="Contactos 7 días" value={kpis.vcards_7d}/><Kpi icon={<UserPlus/>} label="Contactos 30 días" value={kpis.vcards_30d}/></div></section>
      </>}
      <div className="panel"><h2>Flujo protegido</h2><div className="steps"><span>1</span><p><strong>Cliente</strong><br/>Entidad comercial independiente de la tarjeta.</p><span>2</span><p><strong>Pedido + items</strong><br/>Se crean atómicamente y pueden vincular cards.</p><span>3</span><p><strong>NFC físico</strong><br/>Se reserva, programa, asigna y entrega.</p><span>4</span><p><strong>public_id permanente</strong><br/>El QR/NFC físico no cambia aunque se editen datos comerciales.</p></div></div>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article className="kpi-card"><div className="kpi-icon">{icon}</div><span>{label}</span><strong>{Number(value || 0).toLocaleString()}</strong></article>
}
