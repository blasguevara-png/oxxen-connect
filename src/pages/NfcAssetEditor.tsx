import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, History, Save } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { canTransitionNfcStatus, nextNfcStatuses, NFC_CHIP_LABELS, NFC_STATUS_LABELS, normalizeNfcUid } from '../lib/nfc'
import { supabase } from '../lib/supabase'
import type { CardRecord, NfcAssetRecord, NfcAssetStatus, OrderItemRecord, OrderRecord } from '../types'

type AssetRow = NfcAssetRecord & {
  order: Pick<OrderRecord, 'id' | 'order_code'> | null
  card: Pick<CardRecord, 'id' | 'public_id' | 'full_name' | 'slug'> | null
}

type AuditRow = {
  id: string
  action: string
  created_at: string
  metadata: { asset_code?: string; chip_type?: string; batch_code?: string } | null
}

const auditLabels: Record<string, string> = {
  'nfc.created': 'Activo creado',
  'nfc.bulk_created': 'Creación masiva',
  'nfc.updated': 'Datos actualizados',
  'nfc.reserved': 'Reservado',
  'nfc.released': 'Reserva liberada',
  'nfc.uid_registered': 'UID registrado',
  'nfc.programmed': 'Marcado programado',
  'nfc.card_assigned': 'Card digital asignada',
  'nfc.delivered': 'Entregado',
  'nfc.defective': 'Marcado defectuoso',
  'nfc.lost': 'Marcado perdido',
  'nfc.retired': 'Retirado',
}

export function NfcAssetEditor() {
  const { id } = useParams()
  const [asset, setAsset] = useState<AssetRow | null>(null)
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [items, setItems] = useState<OrderItemRecord[]>([])
  const [cards, setCards] = useState<CardRecord[]>([])
  const [activity, setActivity] = useState<AuditRow[]>([])
  const [uid, setUid] = useState('')
  const [orderId, setOrderId] = useState('')
  const [orderItemId, setOrderItemId] = useState('')
  const [cardId, setCardId] = useState('')
  const [batchCode, setBatchCode] = useState('')
  const [supplier, setSupplier] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    const [assetRes, ordersRes, itemsRes, cardsRes, activityRes] = await Promise.all([
      supabase.from('oxxen_connect_nfc_assets').select('*, order:oxxen_connect_orders(id,order_code), card:oxxen_connect_cards(id,public_id,full_name,slug)').eq('id', id).single(),
      supabase.from('oxxen_connect_orders').select('*').neq('status', 'cancelled').order('created_at', { ascending: false }),
      supabase.from('oxxen_connect_order_items').select('*').order('created_at', { ascending: true }),
      supabase.from('oxxen_connect_cards').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('oxxen_connect_audit_logs').select('id,action,created_at,metadata').eq('entity_type', 'nfc_asset').eq('entity_id', id).order('created_at', { ascending: false }).limit(50),
    ])
    if (assetRes.error) {
      setError('No pudimos cargar este activo NFC.')
    } else {
      const row = assetRes.data as unknown as AssetRow
      setAsset(row)
      setUid(row.uid || '')
      setOrderId(row.order_id || '')
      setOrderItemId(row.order_item_id || '')
      setCardId(row.card_id || '')
      setBatchCode(row.batch_code || '')
      setSupplier(row.supplier || '')
      setPurchaseCost(row.purchase_cost == null ? '' : String(row.purchase_cost))
      setNotes(row.notes || '')
    }
    if (!ordersRes.error) setOrders((ordersRes.data || []) as OrderRecord[])
    if (!itemsRes.error) setItems((itemsRes.data || []) as OrderItemRecord[])
    if (!cardsRes.error) setCards((cardsRes.data || []) as CardRecord[])
    if (!activityRes.error) setActivity((activityRes.data || []) as AuditRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [id])

  const visibleItems = useMemo(() => orderId ? items.filter(item => item.order_id === orderId) : [], [items, orderId])
  const transitions = asset ? nextNfcStatuses(asset.status) : []

  const saveDetails = async () => {
    if (!asset) return
    setSaving(true)
    setError('')
    try {
      const normalizedUid = normalizeNfcUid(uid)
      const cost = purchaseCost.trim() === '' ? null : Number(purchaseCost)
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Costo inválido.')
      const { error: updateError } = await supabase.from('oxxen_connect_nfc_assets').update({
        uid: normalizedUid,
        order_id: orderId || null,
        order_item_id: orderItemId || null,
        card_id: cardId || null,
        batch_code: batchCode.trim() || null,
        supplier: supplier.trim() || null,
        purchase_cost: cost,
        notes: notes.trim() || null,
      }).eq('id', asset.id)
      if (updateError) throw new Error('No se pudieron guardar los cambios. Verifica permisos, MFA, UID y relaciones.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el activo NFC.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (next: NfcAssetStatus) => {
    if (!asset || !canTransitionNfcStatus(asset.status, next) || asset.status === next) return
    setSaving(true)
    setError('')
    const patch: Record<string, string | null> = { status: next }
    if (next === 'available') {
      patch.order_id = null
      patch.order_item_id = null
      patch.card_id = null
    }
    if (next === 'reserved') patch.order_id = orderId || null
    if (next === 'assigned') patch.card_id = cardId || null
    const { error: updateError } = await supabase.from('oxxen_connect_nfc_assets').update(patch).eq('id', asset.id)
    if (updateError) setError('No se pudo cambiar el estado. Revisa pedido, tarjeta, transición y permisos.')
    else await load()
    setSaving(false)
  }

  if (loading) return <Loading/>
  if (!asset) return <div className="empty-state"><h2>Activo NFC no disponible</h2><p>{error || 'No encontramos este registro.'}</p></div>

  return (
    <div className="page-stack editor-page">
      <header className="page-header">
        <div>
          <Link className="back-link" to="/admin/inventario-nfc"><ArrowLeft size={16}/> Inventario NFC</Link>
          <h1>{asset.asset_code}</h1>
          <p>{NFC_CHIP_LABELS[asset.chip_type]} · {NFC_STATUS_LABELS[asset.status]}</p>
        </div>
        <div className="button-row">
          {transitions.map(next => (
            <button
              key={next}
              className={['defective','lost','retired'].includes(next) ? 'ghost-button' : 'primary-button'}
              disabled={saving}
              onClick={()=>void changeStatus(next)}
            >
              {NFC_STATUS_LABELS[next]}
            </button>
          ))}
        </div>
      </header>

      <section className="panel form-section">
        <h2>Identidad física</h2>
        <div className="grid-3">
          <label className="field"><span>Código interno</span><input value={asset.asset_code} disabled/></label>
          <label className="field"><span>Chip</span><input value={NFC_CHIP_LABELS[asset.chip_type]} disabled/></label>
          <label className="field"><span>Estado</span><input value={NFC_STATUS_LABELS[asset.status]} disabled/></label>
          <label className="field"><span>UID físico</span><input placeholder="04A1B2C3D4E5F6" value={uid} onChange={e=>setUid(e.target.value)}/><small>Opcional. Se normaliza a hexadecimal y nunca reemplaza public_id.</small></label>
          <label className="field"><span>Lote</span><input value={batchCode} onChange={e=>setBatchCode(e.target.value)}/></label>
          <label className="field"><span>Proveedor</span><input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>
          <label className="field"><span>Costo unitario</span><input type="number" min="0" step="0.01" value={purchaseCost} onChange={e=>setPurchaseCost(e.target.value)}/></label>
        </div>
      </section>

      <section className="panel form-section">
        <h2>Asignaciones</h2>
        <div className="grid-3">
          <label className="field"><span>Pedido</span><select value={orderId} onChange={e=>{ setOrderId(e.target.value); setOrderItemId('') }}><option value="">Sin pedido</option>{orders.map(order=><option key={order.id} value={order.id}>{order.order_code}</option>)}</select></label>
          <label className="field"><span>Order item</span><select value={orderItemId} onChange={e=>setOrderItemId(e.target.value)} disabled={!orderId}><option value="">Sin item</option>{visibleItems.map(item=><option key={item.id} value={item.id}>{item.description || item.item_type} · x{item.quantity}</option>)}</select></label>
          <label className="field"><span>Tarjeta digital</span><select value={cardId} onChange={e=>setCardId(e.target.value)}><option value="">Sin tarjeta</option>{cards.map(card=><option key={card.id} value={card.id}>{card.full_name} · {card.public_id.slice(0,8)}…</option>)}</select></label>
        </div>
        {asset.order && <div className="nfc-note"><strong>Pedido asociado</strong><p><Link className="linkish" to={`/admin/pedidos/${asset.order.id}`}>{asset.order.order_code}</Link></p></div>}
        {asset.card && <div className="nfc-note"><strong>Identidad digital protegida</strong><p>{asset.card.full_name} · /p/{asset.card.slug}</p><p>public_id: {asset.card.public_id}</p></div>}
      </section>

      <section className="panel form-section">
        <h2>Notas y fechas</h2>
        <label className="field"><span>Notas</span><textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
        <div className="grid-3">
          <div><strong>Reservada</strong><p>{asset.reserved_at ? new Date(asset.reserved_at).toLocaleString('es-PE') : '—'}</p></div>
          <div><strong>Programada</strong><p>{asset.programmed_at ? new Date(asset.programmed_at).toLocaleString('es-PE') : '—'}</p></div>
          <div><strong>Entregada</strong><p>{asset.delivered_at ? new Date(asset.delivered_at).toLocaleString('es-PE') : '—'}</p></div>
        </div>
      </section>

      <section className="panel form-section">
        <div className="panel-title"><h2>Actividad</h2><History size={18}/></div>
        {activity.length === 0 ? (
          <p>No hay eventos de auditoría para este activo todavía.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Evento</th><th>Referencia</th></tr></thead>
              <tbody>
                {activity.map(row => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString('es-PE')}</td>
                    <td><strong>{auditLabels[row.action] || row.action}</strong></td>
                    <td>{row.metadata?.asset_code || asset.asset_code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <div className="error-box">{error}</div>}
      <button className="primary-button save-button" disabled={saving} onClick={()=>void saveDetails()}><Save size={18}/>{saving ? 'Guardando...' : 'Guardar detalles'}</button>
    </div>
  )
}
