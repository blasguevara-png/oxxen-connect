import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { customerDisplayName } from '../lib/customers'
import { money, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { CardRecord, CustomerRecord, OrderRecord } from '../types'

export function CustomerDetail() {
  const { customerId } = useParams()
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [cards, setCards] = useState<CardRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!customerId) return
    const load = async () => {
      setLoading(true); setError('')
      const [customerRes, ordersRes, cardsRes] = await Promise.all([
        supabase.from('oxxen_connect_customers').select('*').eq('id', customerId).single(),
        supabase.from('oxxen_connect_orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('oxxen_connect_cards').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      ])
      if (customerRes.error || ordersRes.error || cardsRes.error) setError('No pudimos cargar el resumen comercial del cliente.')
      else {
        setCustomer(customerRes.data as CustomerRecord)
        setOrders((ordersRes.data || []) as OrderRecord[])
        setCards((cardsRes.data || []) as CardRecord[])
      }
      setLoading(false)
    }
    void load()
  }, [customerId])

  if (loading) return <Loading/>
  if (!customer) return <div className="empty-state"><h2>Cliente no disponible</h2><p>{error || 'No encontramos este cliente.'}</p></div>

  return (
    <div className="page-stack">
      <header className="page-header"><div><Link className="back-link" to="/admin/pedidos"><ArrowLeft size={16}/> Pedidos</Link><span className="eyebrow">CLIENTE</span><h1>{customerDisplayName(customer)}</h1><p>{customer.customer_code} · {customer.status}</p></div></header>
      <section className="panel form-section"><h2>Datos generales</h2><div className="grid-3"><div><strong>Contacto</strong><p>{customer.contact_name || '—'}</p></div><div><strong>Email</strong><p>{customer.email || '—'}</p></div><div><strong>WhatsApp</strong><p>{customer.whatsapp || '—'}</p></div></div></section>
      <section className="panel form-section"><h2>Pedidos</h2>{orders.length === 0 ? <p>Este cliente todavía no tiene pedidos.</p> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Estado</th><th>Pago</th><th>Cantidad</th><th>Total</th><th>Fecha</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td><Link className="linkish" to={`/admin/pedidos/${order.id}`}>{order.order_code}</Link></td><td>{ORDER_STATUS_LABELS[order.status]}</td><td>{PAYMENT_STATUS_LABELS[order.payment_status]}</td><td>{order.quantity}</td><td>{money(order.total, order.currency)}</td><td>{new Date(order.created_at).toLocaleDateString('es-PE')}</td></tr>)}</tbody></table></div>}</section>
      <section className="panel form-section"><h2>Tarjetas</h2>{cards.length === 0 ? <p>No hay tarjetas vinculadas. Las tarjetas legacy pueden seguir con customer_id = NULL.</p> : <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Alias</th><th>Estado</th></tr></thead><tbody>{cards.map(card=><tr key={card.id}><td><Link className="linkish" to={`/admin/clientes/${card.id}`}>{card.full_name}</Link></td><td>/p/{card.slug}</td><td>{card.active ? 'Activo' : 'Inactivo'}</td></tr>)}</tbody></table></div>}</section>
      <section className="panel form-section"><h2>Analytics</h2><p>La vista consolidada por cliente se implementará en S3.6. Los analytics actuales por tarjeta no se modifican en S3.2.</p></section>
      <section className="panel form-section"><h2>Actividad</h2><p>Los nuevos eventos de pedidos se registran en el audit log y pueden consultarse desde Actividad.</p></section>
      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
