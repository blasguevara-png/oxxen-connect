import { useEffect, useMemo, useState } from 'react'
import { Archive, Copy, Edit3, Eye, Plus, QrCode, RotateCcw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { copyText, publicCardUrl } from '../lib/helpers'
import type { AnalyticsEvent, CardRecord } from '../types'
import { Loading } from '../components/Loading'

type Filter = 'all' | 'active' | 'inactive' | 'archived'

export function Cards() {
  const [cards, setCards] = useState<CardRecord[]>([])
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const [cardsRes, eventsRes] = await Promise.all([
      supabase.from('oxxen_connect_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('oxxen_connect_analytics_events').select('id,card_id,event_type,created_at'),
    ])

    if (cardsRes.error || eventsRes.error) {
      setLoadError(cardsRes.error?.message || eventsRes.error?.message || 'No pudimos cargar los clientes.')
      setLoading(false)
      return
    }

    setCards((cardsRes.data || []) as CardRecord[])
    setEvents((eventsRes.data || []) as AnalyticsEvent[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => cards.filter(card => {
    const matchesQuery = `${card.full_name} ${card.company || ''} ${card.slug}`.toLowerCase().includes(query.toLowerCase())
    if (!matchesQuery) return false
    if (filter === 'archived') return Boolean(card.deleted_at)
    if (card.deleted_at) return filter === 'all'
    if (filter === 'active') return card.active
    if (filter === 'inactive') return !card.active
    return true
  }), [cards, query, filter])

  const counts = useMemo(() => {
    const map = new Map<string, { views: number; whatsapp: number }>()
    for (const e of events) {
      const item = map.get(e.card_id) || { views: 0, whatsapp: 0 }
      if (e.event_type === 'view') item.views++
      if (e.event_type === 'whatsapp') item.whatsapp++
      map.set(e.card_id, item)
    }
    return map
  }, [events])

  const archive = async (card: CardRecord) => {
    if (!confirm(`¿Archivar la tarjeta de ${card.full_name}? El QR/NFC y las estadísticas se conservarán.`)) return
    const { error } = await supabase.from('oxxen_connect_cards').update({ deleted_at: new Date().toISOString(), active: false }).eq('id', card.id)
    if (error) return alert(error.message)
    setNotice(`Tarjeta archivada: ${card.full_name}`)
    void load()
  }

  const restore = async (card: CardRecord) => {
    const { error } = await supabase.from('oxxen_connect_cards').update({ deleted_at: null, active: true }).eq('id', card.id)
    if (error) return alert(error.message)
    setNotice(`Tarjeta restaurada: ${card.full_name}`)
    void load()
  }

  const toggle = async (card: CardRecord) => {
    if (card.deleted_at) return
    const { error } = await supabase.from('oxxen_connect_cards').update({ active: !card.active }).eq('id', card.id)
    if (error) return alert(error.message)
    void load()
  }

  const copyUrl = async (card: CardRecord) => {
    await copyText(publicCardUrl(card.public_id))
    setNotice(`URL permanente copiada: ${card.slug}`)
    setTimeout(()=>setNotice(''), 1800)
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">GESTIÓN</span><h1>Clientes</h1><p>Administra perfiles, enlaces y estado de cada tarjeta sin romper su QR/NFC.</p></div><Link className="primary-button" to="/admin/clientes/nuevo"><Plus size={18}/> Nueva tarjeta</Link></header>
      <div className="toolbar">
        <div className="search-box"><Search size={18}/><input placeholder="Buscar nombre, empresa o alias..." value={query} onChange={e=>setQuery(e.target.value)} /></div>
        <div className="button-row">
          {(['all','active','inactive','archived'] as Filter[]).map(item => <button key={item} type="button" className={filter === item ? 'primary-button' : 'ghost-button'} onClick={()=>setFilter(item)}>{item === 'all' ? 'Todos' : item === 'active' ? 'Activos' : item === 'inactive' ? 'Inactivos' : 'Archivados'}</button>)}
        </div>
        {notice && <span className="success-note">{notice}</span>}
      </div>

      {loading ? <Loading/> : loadError ? <div className="empty-state"><h2>No pudimos cargar los clientes</h2><p>{loadError}</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : filtered.length === 0 ? <div className="empty-state"><h2>{cards.length ? 'No hay resultados' : 'No hay tarjetas'}</h2><p>{cards.length ? 'Prueba otro filtro o búsqueda.' : 'Crea tu primer cliente para empezar.'}</p></div> : (
        <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>URL permanente</th><th>Estado</th><th>Vistas</th><th>WhatsApp</th><th>Acciones</th></tr></thead><tbody>
          {filtered.map(card => {
            const stats = counts.get(card.id) || { views: 0, whatsapp: 0 }
            const archived = Boolean(card.deleted_at)
            return <tr key={card.id}>
              <td><div className="client-cell"><div className="mini-avatar">{card.profile_image_url ? <img src={card.profile_image_url} alt=""/> : card.full_name.slice(0,1)}</div><div><strong>{card.full_name}</strong><span>{card.company || 'Sin empresa'} · alias /p/{card.slug}</span></div></div></td>
              <td><button className="linkish" onClick={()=>copyUrl(card)}><Copy size={14}/>/p/{card.public_id.slice(0,8)}…</button></td>
              <td>{archived ? <span className="status-pill inactive">Archivado</span> : <button className={`status-pill ${card.active ? 'active' : 'inactive'}`} onClick={()=>toggle(card)}>{card.active ? 'Activo' : 'Inactivo'}</button>}</td>
              <td>{stats.views}</td><td>{stats.whatsapp}</td>
              <td><div className="row-actions">
                {!archived && <Link title="Editar" to={`/admin/clientes/${card.id}`}><Edit3 size={17}/></Link>}
                {!archived && <a title="Ver perfil" href={publicCardUrl(card.public_id)} target="_blank" rel="noreferrer"><Eye size={17}/></a>}
                {!archived && <Link title="Ver QR" to={`/admin/clientes/${card.id}#qr`}><QrCode size={17}/></Link>}
                {archived ? <button title="Restaurar" onClick={()=>restore(card)}><RotateCcw size={17}/></button> : <button title="Archivar" onClick={()=>archive(card)}><Archive size={17}/></button>}
              </div></td>
            </tr>
          })}
        </tbody></table></div>
      )}
    </div>
  )
}
