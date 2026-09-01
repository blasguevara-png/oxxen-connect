import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Plus, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { customerDisplayName } from '../lib/customers'
import { calculateOrderTotals, canTransitionOrderStatus, money, nextOrderStatuses, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { CustomerRecord, OrderItemDraft, OrderItemRecord, OrderItemType, OrderRecord, OrderStatus, PaymentStatus } from '../types'

const blankItem = (): OrderItemDraft => ({ item_type: 'nfc_card', description: 'Tarjeta NFC', quantity: 1, unit_price: 0, card_id: null })

type OrderWithCustomer = OrderRecord & { customer: Pick<CustomerRecord, 'id' | 'customer_code' | 'business_name' | 'contact_name'> | null }

export function OrderEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [order, setOrder] = useState<OrderWithCustomer | null>(null)
  const [items, setItems] = useState<OrderItemRecord[]>([])
  const [customerId, setCustomerId] = useState('')
  const [draftItems, setDraftItems] = useState<OrderItemDraft[]>([blankItem()])
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const customersRes = await supabase.from('oxxen_connect_customers').select('*').neq('status', 'blocked').order('created_at', { ascending: false })
    if (customersRes.error) {
      setError('No pudimos cargar los clientes disponibles.')
      setLoading(false)
      return
    }
    setCustomers((customersRes.data || []) as CustomerRecord[])

    if (id) {
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from('oxxen_connect_orders').select('*, customer:oxxen_connect_customers(id,customer_code,business_name,contact_name)').eq('id', id).single(),
        supabase.from('oxxen_connect_order_items').select('*').eq('order_id', id).order('created_at', { ascending: true }),
      ])
      if (orderRes.error || itemsRes.error) setError('No pudimos cargar este pedido.')
      else {
        const loaded = orderRes.data as unknown as OrderWithCustomer
        setOrder(loaded)
        setItems((itemsRes.data || []) as OrderItemRecord[])
        setCustomerId(loaded.customer_id)
        setDiscount(Number(loaded.discount || 0))
        setNotes(loaded.notes || '')
        setPaymentStatus(loaded.payment_status)
      }
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [id])

  const draftTotals = useMemo(() => {
    try { return calculateOrderTotals(draftItems, discount) }
    catch { return { quantity: 0, subtotal: 0, discount: 0, total: 0 } }
  }, [draftItems, discount])

  const updateDraftItem = (index: number, patch: Partial<OrderItemDraft>) => {
    setDraftItems(prev => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item))
  }

  const createOrder = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      if (!customerId) throw new Error('Selecciona un cliente.')
      calculateOrderTotals(draftItems, discount)
      const { data, error: orderError } = await supabase.from('oxxen_connect_orders').insert({
        customer_id: customerId,
        status: 'draft',
        payment_status: 'pending',
        currency: 'PEN',
        discount,
        notes: notes.trim() || null,
      }).select('id').single()
      if (orderError || !data) throw new Error('No se pudo crear el pedido.')

      const { error: itemsError } = await supabase.from('oxxen_connect_order_items').insert(draftItems.map(item => ({
        order_id: data.id,
        item_type: item.item_type,
        description: item.description?.trim() || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        card_id: item.card_id || null,
      })))
      if (itemsError) throw new Error('El pedido fue creado, pero no se pudieron registrar sus items. Revisa el pedido antes de continuar.')
      navigate(`/admin/pedidos/${data.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el pedido.')
    } finally { setSaving(false) }
  }

  const saveOrder = async () => {
    if (!order) return
    setSaving(true); setError(''); setSaved(false)
    const { error: updateError } = await supabase.from('oxxen_connect_orders').update({
      customer_id: customerId,
      payment_status: paymentStatus,
      discount,
      notes: notes.trim() || null,
    }).eq('id', order.id)
    if (updateError) setError('No se pudo actualizar el pedido.')
    else { setSaved(true); await load(); setTimeout(()=>setSaved(false), 1800) }
    setSaving(false)
  }

  const changeStatus = async (next: OrderStatus) => {
    if (!order || !canTransitionOrderStatus(order.status, next) || order.status === next) return
    setSaving(true); setError('')
    const { error: statusError } = await supabase.from('oxxen_connect_orders').update({ status: next }).eq('id', order.id)
    if (statusError) setError('No se pudo cambiar el estado del pedido.')
    else await load()
    setSaving(false)
  }

  const saveExistingItem = async (item: OrderItemRecord) => {
    setSaving(true); setError('')
    const { error: itemError } = await supabase.from('oxxen_connect_order_items').update({
      item_type: item.item_type,
      description: item.description?.trim() || null,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      card_id: item.card_id || null,
    }).eq('id', item.id)
    if (itemError) setError('No se pudo actualizar el item.')
    else await load()
    setSaving(false)
  }

  const addItem = async () => {
    if (!order || order.status !== 'draft') return
    const item = blankItem()
    setSaving(true); setError('')
    const { error: itemError } = await supabase.from('oxxen_connect_order_items').insert({
      order_id: order.id,
      item_type: item.item_type,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      card_id: null,
    })
    if (itemError) setError('No se pudo agregar el item.')
    else await load()
    setSaving(false)
  }

  if (loading) return <Loading/>

  if (isNew) return (
    <div className="page-stack editor-page">
      <header className="page-header"><div><Link className="back-link" to="/admin/pedidos"><ArrowLeft size={16}/> Pedidos</Link><h1>Nuevo pedido</h1><p>El pedido es comercial. La identidad QR/NFC de las tarjetas se mantiene separada.</p></div></header>
      <form onSubmit={createOrder} className="form-stack">
        <section className="panel form-section"><h2>Cliente</h2><label className="field"><span>Cliente *</span><select value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Selecciona un cliente</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customerDisplayName(customer)} · {customer.customer_code}</option>)}</select></label></section>
        <section className="panel form-section"><div className="panel-title"><h2>Items</h2><button type="button" className="ghost-button" onClick={()=>setDraftItems(prev=>[...prev, blankItem()])}><Plus size={16}/> Agregar</button></div>{draftItems.map((item,index)=><div className="grid-3" key={index}><label className="field"><span>Tipo</span><select value={item.item_type} onChange={e=>updateDraftItem(index,{ item_type: e.target.value as OrderItemType })}><option value="nfc_card">Tarjeta NFC</option><option value="digital_card">Tarjeta digital</option><option value="service">Servicio</option><option value="other">Otro</option></select></label><label className="field"><span>Cantidad</span><input type="number" min="1" value={item.quantity} onChange={e=>updateDraftItem(index,{ quantity: Number(e.target.value) })}/></label><label className="field"><span>Precio unitario</span><input type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>updateDraftItem(index,{ unit_price: Number(e.target.value) })}/></label><label className="field"><span>Descripción</span><input value={item.description || ''} onChange={e=>updateDraftItem(index,{ description: e.target.value })}/></label></div>)}</section>
        <section className="panel form-section"><h2>Resumen</h2><div className="grid-3"><label className="field"><span>Descuento</span><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></label><div><strong>Subtotal</strong><p>{money(draftTotals.subtotal)}</p></div><div><strong>Total</strong><p>{money(draftTotals.total)}</p></div></div><label className="field"><span>Notas</span><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label></section>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button save-button" disabled={saving}><Save size={18}/>{saving ? 'Guardando...' : 'Crear pedido'}</button>
      </form>
    </div>
  )

  if (!order) return <div className="empty-state"><h2>Pedido no disponible</h2><p>{error || 'No encontramos este pedido.'}</p></div>

  const transitions = nextOrderStatuses(order.status)
  return (
    <div className="page-stack">
      <header className="page-header"><div><Link className="back-link" to="/admin/pedidos"><ArrowLeft size={16}/> Pedidos</Link><h1>{order.order_code}</h1><p>{order.customer ? customerDisplayName(order.customer) : 'Cliente'} · creado {new Date(order.created_at).toLocaleDateString('es-PE')}</p></div><div className="button-row">{transitions.map(next=><button key={next} className={next === 'cancelled' ? 'ghost-button' : 'primary-button'} disabled={saving} onClick={()=>void changeStatus(next)}>{ORDER_STATUS_LABELS[next]}</button>)}</div></header>

      <section className="panel form-section"><h2>Pedido</h2><div className="grid-3"><label className="field"><span>Cliente</span><select value={customerId} onChange={e=>setCustomerId(e.target.value)}>{customers.map(customer=><option key={customer.id} value={customer.id}>{customerDisplayName(customer)} · {customer.customer_code}</option>)}</select></label><label className="field"><span>Estado</span><input value={ORDER_STATUS_LABELS[order.status]} disabled /></label><label className="field"><span>Pago</span><select value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value as PaymentStatus)}>{Object.entries(PAYMENT_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Descuento</span><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></label><div><strong>Subtotal</strong><p>{money(order.subtotal, order.currency)}</p></div><div><strong>Total</strong><p>{money(order.total, order.currency)}</p></div></div><label className="field"><span>Notas</span><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="primary-button" disabled={saving} onClick={()=>void saveOrder()}><Save size={16}/>{saved ? <><Check size={16}/> Guardado</> : 'Guardar cambios'}</button></section>

      <section className="panel form-section"><div className="panel-title"><h2>Items</h2>{order.status === 'draft' && <button className="ghost-button" disabled={saving} onClick={()=>void addItem()}><Plus size={16}/> Agregar item</button>}</div>{items.length === 0 ? <p>Este pedido todavía no tiene items.</p> : items.map((item,index)=><div className="grid-3" key={item.id}><label className="field"><span>Tipo</span><select disabled={order.status !== 'draft'} value={item.item_type} onChange={e=>setItems(prev=>prev.map((row,idx)=>idx===index?{...row,item_type:e.target.value as OrderItemType}:row))}><option value="nfc_card">Tarjeta NFC</option><option value="digital_card">Tarjeta digital</option><option value="service">Servicio</option><option value="other">Otro</option></select></label><label className="field"><span>Cantidad</span><input disabled={order.status !== 'draft'} type="number" min="1" value={item.quantity} onChange={e=>setItems(prev=>prev.map((row,idx)=>idx===index?{...row,quantity:Number(e.target.value)}:row))}/></label><label className="field"><span>Precio</span><input disabled={order.status !== 'draft'} type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>setItems(prev=>prev.map((row,idx)=>idx===index?{...row,unit_price:Number(e.target.value)}:row))}/></label><label className="field"><span>Descripción</span><input disabled={order.status !== 'draft'} value={item.description || ''} onChange={e=>setItems(prev=>prev.map((row,idx)=>idx===index?{...row,description:e.target.value}:row))}/></label><div><strong>Subtotal</strong><p>{money(item.subtotal, order.currency)}</p></div>{order.status === 'draft' && <button className="ghost-button" disabled={saving} onClick={()=>void saveExistingItem(item)}>Guardar item</button>}</div>)}</section>

      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
