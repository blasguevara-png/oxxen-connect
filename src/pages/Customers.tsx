import { useEffect, useMemo, useState } from 'react'
import { Edit3, Eye, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { CUSTOMER_STATUS_LABELS, customerDisplayName } from '../lib/customers'
import { supabase } from '../lib/supabase'
import type { CustomerRecord, CustomerStatus } from '../types'

type Filter = 'all' | CustomerStatus

type CustomerCounts = { orders: number; cards: number }

export function Customers() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [counts, setCounts] = useState<Record<string, CustomerCounts>>({})
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [customersRes, ordersRes, cardsRes] = await Promise.all([
      supabase.from('oxxen_connect_customers').select('*').order('created_at', { ascending: false }),
      supabase.from('oxxen_connect_orders').select('customer_id'),
      supabase.from('oxxen_connect_cards').select('customer_id').not('customer_id', 'is', null),
    ])
    const firstError = customersRes.error || ordersRes.error || cardsRes.error
    if (firstError) {
      setError('No pudimos cargar los clientes comerciales.')
      setLoading(false)
      return
    }

    const next: Record<string, CustomerCounts> = {}
    for (const customer of (customersRes.data || []) as CustomerRecord[]) next[customer.id] = { orders: 0, cards: 0 }
    for (const order of ordersRes.data || []) {
      if (order.customer_id && next[order.customer_id]) next[order.customer_id].orders += 1
    }
    for (const card of cardsRes.data || []) {
      if (card.customer_id && next[card.customer_id]) next[card.customer_id].cards += 1
    }
    setCustomers((customersRes.data || []) as CustomerRecord[])
    setCounts(next)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => customers.filter(customer => {
    const haystack = `${customer.customer_code} ${customer.business_name || ''} ${customer.contact_name || ''} ${customer.email || ''} ${customer.whatsapp || ''}`.toLowerCase()
    const matchesQuery = haystack.includes(query.trim().toLowerCase())
    return matchesQuery && (filter === 'all' || customer.status === filter)
  }), [customers, query, filter])

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">GESTIÓN COMERCIAL</span><h1>Clientes</h1><p>Personas y empresas que compran productos OXXEN Connect. Las tarjetas digitales se administran por separado.</p></div>
        <Link className="primary-button" to="/admin/clientes/nuevo"><Plus size={18}/> Nuevo cliente</Link>
      </header>

      <div className="toolbar">
        <div className="search-box"><Search size={18}/><input placeholder="Buscar código, negocio, contacto, email o WhatsApp..." value={query} onChange={e=>setQuery(e.target.value)} /></div>
        <select value={filter} onChange={e=>setFilter(e.target.value as Filter)}>
          <option value="all">Todos los estados</option>
          {Object.entries(CUSTOMER_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {loading ? <Loading/> : error ? (
        <div className="empty-state"><h2>No pudimos cargar los clientes</h2><p>{error}</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><h2>{customers.length ? 'No hay resultados' : 'No hay clientes comerciales'}</h2><p>{customers.length ? 'Prueba otra búsqueda o filtro.' : 'Crea un cliente para poder generar pedidos y vincular sus tarjetas.'}</p></div>
      ) : (
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th><th>Contacto</th><th>Estado</th><th>Pedidos</th><th>Tarjetas</th><th>Acciones</th></tr></thead><tbody>
          {filtered.map(customer => <tr key={customer.id}>
            <td><code>{customer.customer_code}</code></td>
            <td><strong>{customerDisplayName(customer)}</strong><br/><small>{customer.email || customer.whatsapp || 'Sin contacto digital'}</small></td>
            <td>{customer.contact_name || '—'}</td>
            <td><span className={`status-pill ${customer.status === 'active' ? 'active' : 'inactive'}`}>{CUSTOMER_STATUS_LABELS[customer.status]}</span></td>
            <td>{counts[customer.id]?.orders || 0}</td>
            <td>{counts[customer.id]?.cards || 0}</td>
            <td><div className="row-actions"><Link title="Ver cliente" to={`/admin/clientes/${customer.id}`}><Eye size={17}/></Link><Link title="Editar cliente" to={`/admin/clientes/${customer.id}/editar`}><Edit3 size={17}/></Link></div></td>
          </tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}
