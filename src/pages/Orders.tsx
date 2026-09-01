import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { customerDisplayName } from '../lib/customers'
import { money, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { CustomerRecord, OrderRecord, OrderStatus, PaymentStatus } from '../types'

type OrderRow = OrderRecord & { customer: Pick<CustomerRecord, 'id' | 'customer_code' | 'business_name' | 'contact_name'> | null }
type StatusFilter = 'all' | OrderStatus
type PaymentFilter = 'all' | PaymentStatus

export function Orders() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [payment, setPayment] = useState<PaymentFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('oxxen_connect_orders')
      .select('*, customer:oxxen_connect_customers(id,customer_code,business_name,contact_name)')
      .order('created_at', { ascending: false })
    if (loadError) setError('No pudimos cargar los pedidos. Si S3.2 aún no fue migrado, esta vista permanecerá pendiente hasta el rollout.')
    else setOrders((data || []) as unknown as OrderRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => orders.filter(order => {
    const customer = order.customer ? customerDisplayName(order.customer) : ''
    const matchesQuery = `${order.order_code} ${customer}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (status === 'all' || order.status === status) && (payment === 'all' || order.payment_status === payment)
  }), [orders, query, status, payment])

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><span className="eyebrow">OPERACIÓN COMERCIAL</span><h1>Pedidos</h1><p>Registra ventas y sigue su avance sin mezclar el pedido con la identidad permanente de las tarjetas.</p></div>
        <Link className="primary-button" to="/admin/pedidos/nuevo"><Plus size={18}/> Nuevo pedido</Link>
      </header>

      <div className="toolbar">
        <div className="search-box"><Search size={18}/><input placeholder="Buscar código o cliente..." value={query} onChange={e=>setQuery(e.target.value)} /></div>
        <div className="button-row">
          <select value={status} onChange={e=>setStatus(e.target.value as StatusFilter)}>
            <option value="all">Todos los estados</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <select value={payment} onChange={e=>setPayment(e.target.value as PaymentFilter)}>
            <option value="all">Todos los pagos</option>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {loading ? <Loading/> : error ? <div className="empty-state"><h2>No pudimos cargar los pedidos</h2><p>{error}</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div> : filtered.length === 0 ? <div className="empty-state"><h2>{orders.length ? 'No hay resultados' : 'No hay pedidos'}</h2><p>{orders.length ? 'Prueba otra búsqueda o filtro.' : 'Crea el primer pedido cuando tengas un cliente registrado.'}</p></div> : (
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th><th>Cantidad</th><th>Estado</th><th>Pago</th><th>Total</th><th>Fecha</th></tr></thead><tbody>
          {filtered.map(order => <tr key={order.id}>
            <td><Link className="linkish" to={`/admin/pedidos/${order.id}`}>{order.order_code}</Link></td>
            <td>{order.customer ? <Link className="linkish" to={`/admin/clientes/${order.customer.id}/resumen`}>{customerDisplayName(order.customer)}</Link> : 'Cliente no disponible'}</td>
            <td>{order.quantity}</td>
            <td><span className={`status-pill ${order.status === 'cancelled' ? 'inactive' : 'active'}`}>{ORDER_STATUS_LABELS[order.status]}</span></td>
            <td>{PAYMENT_STATUS_LABELS[order.payment_status]}</td>
            <td>{money(order.total, order.currency)}</td>
            <td>{new Date(order.created_at).toLocaleDateString('es-PE')}</td>
          </tr>)}
        </tbody></table></div>
      )}
    </div>
  )
}
