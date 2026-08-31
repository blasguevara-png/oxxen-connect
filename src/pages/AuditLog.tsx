import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Loading } from '../components/Loading'
import { supabase } from '../lib/supabase'

type AuditRow = {
  id: string
  action: string
  entity_type: string
  created_at: string
  card_id: string | null
  metadata: { changed_fields?: string[]; order_code?: string; order_id?: string } | null
  oxxen_connect_cards: { full_name: string; slug: string } | null
}

const labels: Record<string, string> = {
  CREATE_CARD: 'Tarjeta creada',
  UPDATE_CARD: 'Tarjeta actualizada',
  ARCHIVE_CARD: 'Tarjeta archivada',
  RESTORE_CARD: 'Tarjeta restaurada',
  ACTIVATE_CARD: 'Perfil activado',
  DEACTIVATE_CARD: 'Perfil desactivado',
  CHANGE_SLUG: 'Alias modificado',
  CHANGE_PHONE: 'Teléfono modificado',
  CHANGE_EMAIL: 'Email modificado',
  CHANGE_URL: 'URL modificada',
  UPLOAD_PROFILE_IMAGE: 'Foto actualizada',
  UPLOAD_LOGO: 'Logo actualizado',
  'order.created': 'Pedido creado',
  'order.updated': 'Pedido actualizado',
  'order.confirmed': 'Pedido confirmado',
  'order.production_started': 'Pedido enviado a producción',
  'order.ready': 'Pedido listo',
  'order.delivered': 'Pedido entregado',
  'order.cancelled': 'Pedido cancelado',
  'order.payment_status_changed': 'Estado de pago actualizado',
  'order_item.created': 'Item de pedido creado',
  'order_item.updated': 'Item de pedido actualizado',
  'order_item.card_assigned': 'Tarjeta asignada a item',
}

export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    const { data, error: loadError } = await supabase
      .from('oxxen_connect_audit_logs')
      .select('id,action,entity_type,created_at,card_id,metadata,oxxen_connect_cards(full_name,slug)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (loadError) setError(true)
    else setRows((data || []) as unknown as AuditRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const entityLabel = (row: AuditRow) => {
    if (row.entity_type === 'order') return row.metadata?.order_code || 'Pedido'
    if (row.entity_type === 'order_item') return `Item · pedido ${row.metadata?.order_id?.slice(0, 8) || '—'}`
    if (row.oxxen_connect_cards) return `${row.oxxen_connect_cards.full_name} · /p/${row.oxxen_connect_cards.slug}`
    return row.entity_type || 'Registro administrativo'
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">SEGURIDAD</span><h1>Actividad</h1><p>Historial administrativo de tarjetas, pedidos y operaciones comerciales.</p></div></header>
      {loading ? <Loading/> : error ? <div className="empty-state"><h2>No pudimos cargar la actividad</h2><p>Intenta nuevamente en unos segundos.</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : rows.length === 0 ? <div className="empty-state"><History size={26}/><h2>Sin cambios registrados todavía</h2><p>Las próximas modificaciones administrativas aparecerán aquí.</p></div> : (
        <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Campos</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.id}>
            <td>{new Date(row.created_at).toLocaleString('es-PE')}</td>
            <td><strong>{labels[row.action] || row.action}</strong></td>
            <td>{entityLabel(row)}</td>
            <td>{row.metadata?.changed_fields?.join(', ') || '—'}</td>
          </tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}
