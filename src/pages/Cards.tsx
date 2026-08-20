import { useEffect, useMemo, useState } from 'react'
import { Copy, Edit3, Eye, Plus, QrCode, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { copyText, publicCardUrl } from '../lib/helpers'
import type { AnalyticsEvent, CardRecord } from '../types'
import { Loading } from '../components/Loading'

export function Cards() {
  const [cards, setCards] = useState<CardRecord[]>([])
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    const [cardsRes, eventsRes] = await Promise.all([
      supabase.from('oxxen_connect_cards').select('*').order('created_at', { ascending: false }),
      supabase.from('oxxen_connect_analytics_events').select('id,card_id,event_type,created_at'),
    ])
    setCards((cardsRes.data || []) as CardRecord[])
    setEvents((eventsRes.data || []) as AnalyticsEvent[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => cards.filter(card => `${card.full_name} ${card.company || ''} ${card.slug}`.toLowerCase().includes(query.toLowerCase())), [cards, query])
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

  const remove = async (card: CardRecord) => {
    if (!confirm(`¿Eliminar definitivamente la tarjeta de ${card.full_name}?`)) return
    const { error } = await supabase.from('oxxen_connect_cards').delete().eq('id', card.id)
    if (error) return alert(error.message)
    void load()
  }

  const toggle = async (card: CardRecord) => {
    await supabase.from('oxxen_connect_cards').update({ active: !card.active }).eq('id', card.id)
    void load()
  }

  const copyUrl = async (card: CardRecord) => {
    await copyText(publicCardUrl(card.slug))
    setNotice(`URL copiada: ${card.slug}`)
    setTimeout(()=>setNotice(''), 1800)
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">GESTIÓN</span><h1>Clientes</h1><p>Administra perfiles, enlaces y estado de cada tarjeta.</p></div><Link className="primary-button" to="/admin/clientes/nuevo"><Plus size={18}/> Nueva tarjeta</Link></header>
      <div className="toolbar"><div className="search-box"><Search size={18}/><input placeholder="Buscar nombre, empresa o slug..." value={query} onChange={e=>setQuery(e.target.value)} /></div>{notice && <span className="success-note">{notice}</span>}</div>
      {loading ? <Loading/> : filtered.length === 0 ? <div className="empty-state"><h2>No hay tarjetas</h2><p>Crea tu primer cliente para empezar.</p></div> : (
        <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>URL</th><th>Estado</th><th>Vistas</th><th>WhatsApp</th><th>Acciones</th></tr></thead><tbody>
          {filtered.map(card => {
            const stats = counts.get(card.id) || { views: 0, whatsapp: 0 }
            return <tr key={card.id}>
              <td><div className="client-cell"><div className="mini-avatar">{card.profile_image_url ? <img src={card.profile_image_url} alt=""/> : card.full_name.slice(0,1)}</div><div><strong>{card.full_name}</strong><span>{card.company || 'Sin empresa'}</span></div></div></td>
              <td><button className="linkish" onClick={()=>copyUrl(card)}><Copy size={14}/>/p/{card.slug}</button></td>
              <td><button className={`status-pill ${card.active ? 'active' : 'inactive'}`} onClick={()=>toggle(card)}>{card.active ? 'Activo' : 'Inactivo'}</button></td>
              <td>{stats.views}</td><td>{stats.whatsapp}</td>
              <td><div className="row-actions"><Link title="Editar" to={`/admin/clientes/${card.id}`}><Edit3 size={17}/></Link><a title="Ver perfil" href={`/p/${card.slug}`} target="_blank" rel="noreferrer"><Eye size={17}/></a><Link title="Ver QR" to={`/admin/clientes/${card.id}#qr`}><QrCode size={17}/></Link><button title="Eliminar" onClick={()=>remove(card)}><Trash2 size={17}/></button></div></td>
            </tr>
          })}
        </tbody></table></div>
      )}
    </div>
  )
}
