import { useEffect, useState } from 'react'
import { ArrowLeft, CreditCard, Edit3, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { CUSTOMER_STATUS_LABELS, customerDisplayName } from '../lib/customers'
import { money, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { CardRecord, CustomerRecord, OrderRecord } from '../types'

type ActivityRow = { id: string; action: string; created_at: string }

export function CustomerDetail() {
  const params = useParams()
  const customerId = params.id || params.customerId || ''
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [cards, setCards] = useState<CardRecord[]>([])
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!customerId) return
    const load = async () => {
      setLoading(true); setError('')
      const [customerRes, ordersRes, cardsRes, activityRes] = await Promise.all([
        supabase.from('oxxen_connect_customers').select('*').eq('id', customerId).single(),
        supabase.from('oxxen_connect_orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('oxxen_connect_cards').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('oxxen_connect_audit_logs').select('id,action,created_at').eq('entity_type', 'customer').eq('entity_id', customerId).order('created_at', { ascending: false }).limit(20),
      ])
      if (customerRes.error || ordersRes.error || cardsRes.error) setError('No pudimos cargar el resumen comercial del cliente.')
      else {
        setCustomer(customerRes.data as CustomerRecord)
        setOrders((ordersRes.data || []) as OrderRecord[])
        setCards((cardsRes.data || []) as CardRecord[])
        if (!activityRes.error) setActivity((activityRes.data || []) as ActivityRow[])
      }
      setLoading(false)
    }
    void load()
  }, [customerId])

  if (loading) return <Loading/>
  if (!customer) return <div className="empty-state"><h2>Cliente no disponible</h2><p>{error || 'No encontramos este cliente.'}</p><Link className="ghost-button" to="/admin/clientes">Volver a clientes</Link></div>

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><Link className="back-link" to="/admin/clientes"><ArrowLeft size={16}/> Clientes</Link><span className="eyebrow">CLIENTE</span><h1>{customerDisplayName(customer)}</h1><p>{customer.customer_code} · {CUSTOMER_STATUS_LABELS[customer.status]}</p></div>
        <div className="button-row"><Link className="ghost-button" to={`/admin/clientes/${customer.id}/editar`}><Edit3 size={16}/> Editar</Link><Link className="ghost-button" to={`/admin/tarjetas/nueva?customerId=${customer.id}`}><CreditCard size={16}/> Nueva tarjeta</Link><Link className="primary-button" to={`/admin/pedidos/nuevo?customerId=${customer.id}`}><Plus size={16}/> Nuevo pedido</Link></div>
      </header>

      <section className="panel form-section"><h2>Datos generales</h2><div className="grid-3"><div><strong>Contacto</strong><p>{customer.contact_name || '—'}</p></div><div><strong>Email</strong><p>{customer.email || '—'}</p></div><div><strong>WhatsApp</strong><p>{customer.whatsapp || '—'}</p></div><div><strong>Teléfono</strong><p>{customer.phone || '—'}</p></div><div><strong>Documento</strong><p>{customer.document_type && customer.document_number ? `${customer.document_type} ${customer.document_number}` : '—'}</p></div><div><strong>Dirección</strong><p>{customer.address || '—'}</p></div></div>{customer.notes && <div className="nfc-note"><strong>Notas internas</strong><p>{customer.notes}</p></div>}</section>

      <section className="panel form-section"><div className="panel-title"><h2>Pedidos</h2><Link className="ghost-button" to={`/admin/pedidos/nuevo?customerId=${customer.id}`}>Nuevo pedido</Link></div>{orders.length === 0 ? <p>Este cliente todavía no tiene pedidos.</p> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Estado</th><th>Pago</th><th>Cantidad</th><th>Total</th><th>Fecha</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td><Link className="linkish" to={`/admin/pedidos/${order.id}`}>{order.order_code}</Link></td><td>{ORDER_STATUS_LABELS[order.status]}</td><td>{PAYMENT_STATUS_LABELS[order.payment_status]}</td><td>{order.quantity}</td><td>{money(order.total, order.currency)}</td><td>{new Date(order.created_at).toLocaleDateString('es-PE')}</td></tr>)}</tbody></table></div>}</section>

      <section className="panel form-section"><div className="panel-title"><h2>Tarjetas</h2><Link className="ghost-button" to={`/admin/tarjetas/nueva?customerId=${customer.id}`}>Nueva tarjeta</Link></div>{cards.length === 0 ? <p>No hay tarjetas vinculadas. Las tarjetas legacy pueden seguir con customer_id = NULL hasta que se asignen explícitamente.</p> : <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Alias</th><th>public_id</th><th>Estado</th></tr></thead><tbody>{cards.map(card=><tr key={card.id}><td><Link className="linkish" to={`/admin/tarjetas/${card.id}`}>{card.full_name}</Link></td><td>/p/{card.slug}</td><td><code>{card.public_id.slice(0,8)}…</code></td><td>{card.deleted_at ? 'Archivada' : card.active ? 'Activa' : 'Inactiva'}</td></tr>)}</tbody></table></div>}</section>

      <section className="panel form-section"><h2>Actividad</h2>{activity.length === 0 ? <p>Los cambios de cliente se mostrarán aquí después de aplicar la migración S3.4.</p> : <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th></tr></thead><tbody>{activity.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString('es-PE')}</td><td>{row.action}</td></tr>)}</tbody></table></div>}</section>
      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
