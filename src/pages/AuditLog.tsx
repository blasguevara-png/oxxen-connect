import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Loading } from '../components/Loading'
import { supabase } from '../lib/supabase'

type AuditRow = {
  id: string
  action: string
  created_at: string
  card_id: string | null
  metadata: { changed_fields?: string[] } | null
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
      .select('id,action,created_at,card_id,metadata,oxxen_connect_cards(full_name,slug)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (loadError) setError(true)
    else setRows((data || []) as unknown as AuditRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">SEGURIDAD</span><h1>Actividad</h1><p>Historial de cambios administrativos de las tarjetas.</p></div></header>
      {loading ? <Loading/> : error ? <div className="empty-state"><h2>No pudimos cargar la actividad</h2><p>Intenta nuevamente en unos segundos.</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : rows.length === 0 ? <div className="empty-state"><History size={26}/><h2>Sin cambios registrados todavía</h2><p>Las próximas modificaciones administrativas aparecerán aquí.</p></div> : (
        <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Cliente</th><th>Campos</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.id}>
            <td>{new Date(row.created_at).toLocaleString('es-PE')}</td>
            <td><strong>{labels[row.action] || row.action}</strong></td>
            <td>{row.oxxen_connect_cards ? `${row.oxxen_connect_cards.full_name} · /p/${row.oxxen_connect_cards.slug}` : 'Tarjeta no disponible'}</td>
            <td>{row.metadata?.changed_fields?.join(', ') || '—'}</td>
          </tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}
