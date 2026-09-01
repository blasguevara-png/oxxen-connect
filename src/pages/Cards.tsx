import { useEffect, useMemo, useState } from 'react'
import { Archive, Copy, Edit3, Eye, Plus, QrCode, RotateCcw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Loading } from '../components/Loading'
import { Toast } from '../components/Toast'
import { copyText, publicCardUrl } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import type { AnalyticsSummary, CardRecord } from '../types'

type Filter = 'all' | 'active' | 'inactive' | 'archived'

export function Cards() {
  const [cards, setCards] = useState<CardRecord[]>([])
  const [summaries, setSummaries] = useState<AnalyticsSummary[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [archiveTarget, setArchiveTarget] = useState<CardRecord | null>(null)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const [cardsRes, analyticsRes] = await Promise.all([
      supabase.from('oxxen_connect_cards').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_card_analytics_summary', { p_from: null, p_to: null }),
    ])
    if (cardsRes.error || analyticsRes.error) {
      setLoadError('No pudimos cargar las tarjetas digitales.')
      setLoading(false)
      return
    }
    setCards((cardsRes.data || []) as CardRecord[])
    setSummaries((analyticsRes.data || []) as AnalyticsSummary[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => cards.filter(card => {
    const matchesQuery = `${card.full_name} ${card.company || ''} ${card.slug} ${card.public_id}`.toLowerCase().includes(query.toLowerCase())
    if (!matchesQuery) return false
    if (filter === 'archived') return Boolean(card.deleted_at)
    if (card.deleted_at) return filter === 'all'
    if (filter === 'active') return card.active
    if (filter === 'inactive') return !card.active
    return true
  }), [cards, query, filter])

  const counts = useMemo(() => {
    const map = new Map<string, AnalyticsSummary>()
    for (const row of summaries) map.set(row.card_id, row)
    return map
  }, [summaries])

  const archive = async () => {
    const card = archiveTarget
    if (!card) return
    setBusy(true); setActionError('')
    const { error } = await supabase.from('oxxen_connect_cards').update({ deleted_at: new Date().toISOString(), active: false }).eq('id', card.id)
    if (error) setActionError('No se pudo archivar la tarjeta. Revisa permisos y vuelve a intentarlo.')
    else {
      setNotice(`Tarjeta archivada: ${card.full_name}`)
      setArchiveTarget(null)
      await load()
    }
    setBusy(false)
  }

  const restore = async (card: CardRecord) => {
    setBusy(true); setActionError('')
    const { error } = await supabase.from('oxxen_connect_cards').update({ deleted_at: null, active: true }).eq('id', card.id)
    if (error) setActionError('No se pudo restaurar la tarjeta.')
    else { setNotice(`Tarjeta restaurada: ${card.full_name}`); await load() }
    setBusy(false)
  }

  const toggle = async (card: CardRecord) => {
    if (card.deleted_at) return
    setBusy(true); setActionError('')
    const { error } = await supabase.from('oxxen_connect_cards').update({ active: !card.active }).eq('id', card.id)
    if (error) setActionError('No se pudo cambiar el estado del perfil.')
    else await load()
    setBusy(false)
  }

  const copyUrl = async (card: CardRecord) => {
    await copyText(publicCardUrl(card.public_id))
    setNotice(`URL permanente copiada: ${card.slug}`)
    setTimeout(()=>setNotice(''), 1800)
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">IDENTIDAD DIGITAL</span><h1>Tarjetas</h1><p>Administra perfiles y enlaces permanentes sin alterar el QR/NFC físico.</p></div><Link className="primary-button" to="/admin/tarjetas/nueva"><Plus size={18}/> Nueva tarjeta</Link></header>
      <div className="toolbar">
        <div className="search-box"><Search size={18}/><input placeholder="Buscar nombre, empresa, alias o public_id..." value={query} onChange={e=>setQuery(e.target.value)} /></div>
        <div className="button-row">{(['all','active','inactive','archived'] as Filter[]).map(item => <button key={item} type="button" className={filter === item ? 'primary-button' : 'ghost-button'} onClick={()=>setFilter(item)}>{item === 'all' ? 'Todas' : item === 'active' ? 'Activas' : item === 'inactive' ? 'Inactivas' : 'Archivadas'}</button>)}</div>
      </div>

      <Toast message={notice}/><Toast message={actionError} tone="error"/>

      {loading ? <Loading/> : loadError ? <div className="empty-state"><h2>No pudimos cargar las tarjetas</h2><p>{loadError}</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : filtered.length === 0 ? <div className="empty-state"><h2>{cards.length ? 'No hay resultados' : 'No hay tarjetas'}</h2><p>{cards.length ? 'Prueba otro filtro o búsqueda.' : 'Crea la primera tarjeta digital.'}</p></div> : (
        <div className="table-wrap"><table><thead><tr><th>Perfil</th><th>URL permanente</th><th>Estado</th><th>Vistas</th><th>WhatsApp</th><th>Acciones</th></tr></thead><tbody>
          {filtered.map(card => {
            const stats = counts.get(card.id) || { views: 0, whatsapp: 0 }
            const archived = Boolean(card.deleted_at)
            return <tr key={card.id}>
              <td><div className="client-cell"><div className="mini-avatar">{card.profile_image_url ? <img src={card.profile_image_url} alt=""/> : card.full_name.slice(0,1)}</div><div><strong>{card.full_name}</strong><span>{card.company || 'Sin empresa'} · alias /p/{card.slug}</span></div></div></td>
              <td><button className="linkish" onClick={()=>void copyUrl(card)}><Copy size={14}/>/p/{card.public_id.slice(0,8)}…</button></td>
              <td>{archived ? <span className="status-pill inactive">Archivada</span> : <button disabled={busy} className={`status-pill ${card.active ? 'active' : 'inactive'}`} onClick={()=>void toggle(card)}>{card.active ? 'Activa' : 'Inactiva'}</button>}</td>
              <td>{stats.views}</td><td>{stats.whatsapp}</td>
              <td><div className="row-actions">
                {!archived && <Link title="Editar" to={`/admin/tarjetas/${card.id}`}><Edit3 size={17}/></Link>}
                {!archived && <a title="Ver perfil" href={publicCardUrl(card.public_id)} target="_blank" rel="noreferrer"><Eye size={17}/></a>}
                {!archived && <Link title="Ver QR" to={`/admin/tarjetas/${card.id}#qr`}><QrCode size={17}/></Link>}
                {archived ? <button disabled={busy} title="Restaurar" onClick={()=>void restore(card)}><RotateCcw size={17}/></button> : <button disabled={busy} title="Archivar" onClick={()=>setArchiveTarget(card)}><Archive size={17}/></button>}
              </div></td>
            </tr>
          })}
        </tbody></table></div>
      )}

      <ConfirmDialog open={Boolean(archiveTarget)} title="Archivar tarjeta" description={archiveTarget ? `Se archivará la tarjeta de ${archiveTarget.full_name}. El public_id, QR/NFC, aliases y estadísticas se conservarán.` : ''} confirmLabel="Archivar" busy={busy} onCancel={()=>setArchiveTarget(null)} onConfirm={()=>void archive()}/>
    </div>
  )
}
