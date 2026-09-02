import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Plus, Save } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { NfcAssetSummary } from '../components/NfcAssetSummary'
import { Toast } from '../components/Toast'
import { customerDisplayName } from '../lib/customers'
import { calculateOrderTotals, canTransitionOrderStatus, money, nextOrderStatuses, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/orders'
import { supabase } from '../lib/supabase'
import type { CardRecord, CustomerRecord, OrderItemDraft, OrderItemRecord, OrderItemType, OrderRecord, OrderStatus, PaymentStatus } from '../types'

const blankItem = (): OrderItemDraft => ({ item_type: 'nfc_card', description: 'Tarjeta NFC', quantity: 1, unit_price: 0, card_id: null })
const supportsCard = (type: OrderItemType) => type === 'nfc_card' || type === 'digital_card'

type OrderWithCustomer = OrderRecord & { customer: Pick<CustomerRecord, 'id' | 'customer_code' | 'business_name' | 'contact_name'> | null }
type EditableOrderItem = Pick<OrderItemRecord, 'order_id' | 'item_type' | 'description' | 'quantity' | 'unit_price' | 'subtotal' | 'card_id'> & { id: string | null }
type ToastState = { message: string; tone: 'success' | 'error' }

export function OrderEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedCustomerId = searchParams.get('customerId') || ''
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [cards, setCards] = useState<CardRecord[]>([])
  const [order, setOrder] = useState<OrderWithCustomer | null>(null)
  const [items, setItems] = useState<EditableOrderItem[]>([])
  const [customerId, setCustomerId] = useState(requestedCustomerId)
  const [draftItems, setDraftItems] = useState<OrderItemDraft[]>([blankItem()])
  const [discount, setDiscount] = useState(0)
  const [notes, setNotes] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<ToastState>({ message: '', tone: 'success' })

  const notify = (message: string, tone: ToastState['tone']) => {
    setToast({ message, tone })
    window.setTimeout(() => setToast({ message: '', tone: 'success' }), 2600)
  }

  const load = async () => {
    setLoading(true)
    setError('')
    const [customersRes, cardsRes] = await Promise.all([
      supabase.from('oxxen_connect_customers').select('*').neq('status', 'blocked').order('created_at', { ascending: false }),
      supabase.from('oxxen_connect_cards').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    ])
    if (customersRes.error || cardsRes.error) {
      setError('No pudimos cargar los clientes o tarjetas disponibles.')
      setLoading(false)
      return
    }
    setCustomers((customersRes.data || []) as CustomerRecord[])
    setCards((cardsRes.data || []) as CardRecord[])

    if (id) {
      const [orderRes, itemsRes] = await Promise.all([
        supabase.from('oxxen_connect_orders').select('*, customer:oxxen_connect_customers(id,customer_code,business_name,contact_name)').eq('id', id).single(),
        supabase.from('oxxen_connect_order_items').select('*').eq('order_id', id).order('created_at', { ascending: true }),
      ])
      if (orderRes.error || itemsRes.error) setError('No pudimos cargar este pedido.')
      else {
        const loaded = orderRes.data as unknown as OrderWithCustomer
        const loadedItems = (itemsRes.data || []) as OrderItemRecord[]
        setOrder(loaded)
        setItems(loadedItems.map(item => ({
          id: item.id,
          order_id: item.order_id,
          item_type: item.item_type,
          description: item.description,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          subtotal: Number(item.subtotal),
          card_id: item.card_id,
        })))
        setCustomerId(loaded.customer_id)
        setDiscount(Number(loaded.discount || 0))
        setNotes(loaded.notes || '')
        setPaymentStatus(loaded.payment_status)
      }
    } else if (requestedCustomerId) {
      setCustomerId(requestedCustomerId)
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [id, requestedCustomerId])

  const cardOptions = useMemo(() => cards.filter(card => !customerId || !card.customer_id || card.customer_id === customerId), [cards, customerId])

  const draftTotals = useMemo(() => {
    try { return calculateOrderTotals(draftItems, discount) }
    catch { return { quantity: 0, subtotal: 0, discount: 0, total: 0 } }
  }, [draftItems, discount])

  const editTotals = useMemo(() => {
    try { return calculateOrderTotals(items, discount) }
    catch { return { quantity: 0, subtotal: 0, discount: 0, total: 0 } }
  }, [items, discount])

  const updateDraftItem = (index: number, patch: Partial<OrderItemDraft>) => {
    setDraftItems(prev => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item))
  }

  const updateItem = (index: number, patch: Partial<EditableOrderItem>) => {
    setItems(prev => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item))
  }

  const cardLabel = (card: CardRecord) => `${card.full_name} · ${card.public_id.slice(0,8)}…${card.customer_id ? '' : ' · legacy'}`

  const createOrder = async (e: FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setSaved(false)
    try {
      if (!customerId) throw new Error('Selecciona un cliente.')
      calculateOrderTotals(draftItems, discount)
      const payload = draftItems.map(item => ({
        item_type: item.item_type,
        description: item.description?.trim() || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        card_id: supportsCard(item.item_type) ? (item.card_id || null) : null,
      }))
      const { data, error: orderError } = await supabase.rpc('oxxen_connect_create_order_with_items', {
        p_customer_id: customerId,
        p_items: payload,
        p_discount: discount,
        p_notes: notes.trim() || null,
        p_currency: 'PEN',
      })
      if (orderError || !data) throw new Error(orderError?.message || 'No se pudo crear el pedido completo. No se guardó ningún pedido parcial.')
      navigate(`/admin/pedidos/${String(data)}`, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el pedido.'
      setError(message)
      notify(message, 'error')
    } finally { setSaving(false) }
  }

  const persistOrder = async (nextStatus?: OrderStatus) => {
    if (!order || saving) return
    setSaving(true); setError(''); setSaved(false)
    try {
      calculateOrderTotals(items, discount)
      const payload = items.map(item => ({
        id: item.id,
        item_type: item.item_type,
        description: item.description?.trim() || null,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        card_id: supportsCard(item.item_type) ? (item.card_id || null) : null,
      }))
      const { error: updateError } = await supabase.rpc('oxxen_connect_update_order_with_items', {
        p_order_id: order.id,
        p_customer_id: customerId,
        p_items: payload,
        p_discount: discount,
        p_notes: notes.trim() || null,
        p_currency: order.currency,
        p_status: nextStatus || order.status,
        p_payment_status: paymentStatus,
        p_expected_updated_at: order.updated_at,
      })
      if (updateError) {
        if (updateError.code === '40001') throw new Error('Este pedido cambió en otra sesión. Recarga la página antes de volver a guardar.')
        if (updateError.code === '42501') throw new Error('No tienes permisos suficientes o OWNER necesita MFA/AAL2.')
        throw new Error(updateError.message || 'No se pudo guardar el pedido.')
      }
      setSaved(true)
      notify('Pedido e items guardados de forma atómica.', 'success')
      await load()
      window.setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el pedido.'
      setError(message)
      notify(message, 'error')
    } finally { setSaving(false) }
  }

  const changeStatus = async (next: OrderStatus) => {
    if (!order || !canTransitionOrderStatus(order.status, next) || order.status === next) return
    await persistOrder(next)
  }

  const addItem = () => {
    if (!order || order.status !== 'draft' || saving) return
    const item = blankItem()
    setItems(prev => [...prev, {
      id: null,
      order_id: order.id,
      item_type: item.item_type,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.quantity * item.unit_price,
      card_id: item.card_id,
    }])
  }

  if (loading) return <Loading/>

  if (isNew) return (
    <div className="page-stack editor-page">
      <Toast message={toast.message} tone={toast.tone}/>
      <header className="page-header"><div><Link className="back-link" to="/admin/pedidos"><ArrowLeft size={16}/> Pedidos</Link><h1>Nuevo pedido</h1><p>Pedido e items se crean en una única operación transaccional.</p></div></header>
      <form onSubmit={createOrder} className="form-stack">
        <section className="panel form-section"><h2>Cliente</h2><label className="field"><span>Cliente *</span><select value={customerId} onChange={e=>setCustomerId(e.target.value)} required><option value="">Selecciona un cliente</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customerDisplayName(customer)} · {customer.customer_code}</option>)}</select></label>{customerId && <Link className="linkish" to={`/admin/clientes/${customerId}`}>Ver cliente</Link>}</section>
        <section className="panel form-section"><div className="panel-title"><h2>Items</h2><button type="button" className="ghost-button" onClick={()=>setDraftItems(prev=>[...prev, blankItem()])}><Plus size={16}/> Agregar</button></div>{draftItems.map((item,index)=><div className="grid-3" key={index}>
          <label className="field"><span>Tipo</span><select value={item.item_type} onChange={e=>updateDraftItem(index,{ item_type: e.target.value as OrderItemType, card_id: supportsCard(e.target.value as OrderItemType) ? item.card_id : null })}><option value="nfc_card">Tarjeta NFC</option><option value="digital_card">Tarjeta digital</option><option value="service">Servicio</option><option value="other">Otro</option></select></label>
          <label className="field"><span>Cantidad</span><input type="number" min="1" value={item.quantity} onChange={e=>updateDraftItem(index,{ quantity: Number(e.target.value) })}/></label>
          <label className="field"><span>Precio unitario</span><input type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>updateDraftItem(index,{ unit_price: Number(e.target.value) })}/></label>
          <label className="field"><span>Descripción</span><input value={item.description || ''} onChange={e=>updateDraftItem(index,{ description: e.target.value })}/></label>
          {supportsCard(item.item_type) && <label className="field"><span>Tarjeta digital</span><select value={item.card_id || ''} onChange={e=>updateDraftItem(index,{ card_id: e.target.value || null })}><option value="">Asignar después</option>{cardOptions.map(card=><option key={card.id} value={card.id}>{cardLabel(card)}</option>)}</select><small>Se priorizan tarjetas del cliente y legacy sin asignar.</small></label>}
        </div>)}</section>
        <section className="panel form-section"><h2>Resumen</h2><div className="grid-3"><label className="field"><span>Descuento</span><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></label><div><strong>Subtotal</strong><p>{money(draftTotals.subtotal)}</p></div><div><strong>Total</strong><p>{money(draftTotals.total)}</p></div></div><label className="field"><span>Notas</span><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label></section>
        {error && <div className="error-box">{error}</div>}
        <button className="primary-button save-button" disabled={saving}><Save size={18}/>{saving ? 'Creando pedido completo...' : 'Crear pedido'}</button>
      </form>
    </div>
  )

  if (!order) return <div className="empty-state"><h2>Pedido no disponible</h2><p>{error || 'No encontramos este pedido.'}</p></div>

  const transitions = nextOrderStatuses(order.status)
  const draftEditable = order.status === 'draft'
  return (
    <div className="page-stack">
      <Toast message={toast.message} tone={toast.tone}/>
      <header className="page-header"><div><Link className="back-link" to="/admin/pedidos"><ArrowLeft size={16}/> Pedidos</Link><h1>{order.order_code}</h1><p>{order.customer ? <Link className="linkish" to={`/admin/clientes/${order.customer.id}`}>{customerDisplayName(order.customer)}</Link> : 'Cliente'} · creado {new Date(order.created_at).toLocaleDateString('es-PE')}</p></div><div className="button-row">{transitions.map(next=><button key={next} className={next === 'cancelled' ? 'ghost-button' : 'primary-button'} disabled={saving} onClick={()=>void changeStatus(next)}>{ORDER_STATUS_LABELS[next]}</button>)}</div></header>

      <section className="panel form-section"><h2>Pedido</h2><p className="muted">Guardar cambios persiste Pedido + Items en una única transacción. Si otra sesión modificó el pedido, el guardado se rechaza y debes recargar.</p><div className="grid-3"><label className="field"><span>Cliente</span><select disabled={!draftEditable || saving} value={customerId} onChange={e=>setCustomerId(e.target.value)}>{customers.map(customer=><option key={customer.id} value={customer.id}>{customerDisplayName(customer)} · {customer.customer_code}</option>)}</select></label><label className="field"><span>Estado</span><input value={ORDER_STATUS_LABELS[order.status]} disabled /></label><label className="field"><span>Pago</span><select disabled={saving} value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value as PaymentStatus)}>{Object.entries(PAYMENT_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Descuento</span><input disabled={!draftEditable || saving} type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(Number(e.target.value))}/></label><div><strong>Subtotal</strong><p>{money(editTotals.subtotal, order.currency)}</p></div><div><strong>Total</strong><p>{money(editTotals.total, order.currency)}</p></div></div><label className="field"><span>Notas</span><textarea disabled={saving} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="primary-button" disabled={saving} onClick={()=>void persistOrder()}><Save size={16}/>{saving ? 'Guardando...' : saved ? <><Check size={16}/> Guardado</> : 'Guardar cambios'}</button></section>

      <section className="panel form-section"><div className="panel-title"><h2>Items</h2>{draftEditable && <button className="ghost-button" disabled={saving} onClick={addItem}><Plus size={16}/> Agregar item</button>}</div>{items.length === 0 ? <p>Este pedido todavía no tiene items.</p> : items.map((item,index)=><div className="grid-3" key={item.id || `new-${index}`}>
        <label className="field"><span>Tipo</span><select disabled={!draftEditable || saving} value={item.item_type} onChange={e=>updateItem(index,{ item_type:e.target.value as OrderItemType, card_id:supportsCard(e.target.value as OrderItemType)?item.card_id:null })}><option value="nfc_card">Tarjeta NFC</option><option value="digital_card">Tarjeta digital</option><option value="service">Servicio</option><option value="other">Otro</option></select></label>
        <label className="field"><span>Cantidad</span><input disabled={!draftEditable || saving} type="number" min="1" value={item.quantity} onChange={e=>updateItem(index,{ quantity:Number(e.target.value) })}/></label>
        <label className="field"><span>Precio</span><input disabled={!draftEditable || saving} type="number" min="0" step="0.01" value={item.unit_price} onChange={e=>updateItem(index,{ unit_price:Number(e.target.value) })}/></label>
        <label className="field"><span>Descripción</span><input disabled={!draftEditable || saving} value={item.description || ''} onChange={e=>updateItem(index,{ description:e.target.value })}/></label>
        {supportsCard(item.item_type) && <label className="field"><span>Tarjeta digital</span><select disabled={!draftEditable || saving} value={item.card_id || ''} onChange={e=>updateItem(index,{ card_id:e.target.value||null })}><option value="">Sin asignar</option>{cardOptions.map(card=><option key={card.id} value={card.id}>{cardLabel(card)}</option>)}</select>{item.card_id && <Link className="linkish" to={`/admin/tarjetas/${item.card_id}`}>Abrir tarjeta</Link>}</label>}
        <div><strong>Subtotal</strong><p>{money(Number(item.quantity) * Number(item.unit_price), order.currency)}</p>{!item.id && <small>Nuevo · se creará al guardar</small>}</div>
      </div>)}</section>

      <NfcAssetSummary orderId={order.id} title="NFC del pedido" />
      {error && <div className="error-box">{error}</div>}
    </div>
  )
}
