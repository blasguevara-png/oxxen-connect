import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NFC_CHIP_LABELS, NFC_STATUS_LABELS, validateBulkNfcQuantity } from '../lib/nfc'
import { supabase } from '../lib/supabase'
import type { NfcAssetRecord } from '../types'

type AssetRow = NfcAssetRecord & {
  card: { id: string; public_id: string; full_name: string; slug: string } | null
  order_item: { id: string; description: string | null; item_type: string } | null
}

type Props = { orderId?: string; cardId?: string; title?: string; allowReserve?: boolean }

export function NfcAssetSummary({ orderId, cardId, title = 'NFC físicos', allowReserve = true }: Props) {
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [requested, setRequested] = useState(0)
  const [available, setAvailable] = useState(true)
  const [reserveQuantity, setReserveQuantity] = useState(1)
  const [reserving, setReserving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    let query = supabase.from('oxxen_connect_nfc_assets').select('*, card:oxxen_connect_cards(id,public_id,full_name,slug), order_item:oxxen_connect_order_items(id,description,item_type)').order('created_at', { ascending: true })
    if (orderId) query = query.eq('order_id', orderId)
    if (cardId) query = query.eq('card_id', cardId)
    const [assetRes, itemRes] = await Promise.all([
      query,
      orderId ? supabase.from('oxxen_connect_order_items').select('quantity').eq('order_id', orderId).eq('item_type', 'nfc_card') : Promise.resolve({ data: [], error: null }),
    ])
    if (assetRes.error) {
      setAvailable(false); setAssets([])
    } else {
      setAvailable(true); setAssets((assetRes.data || []) as unknown as AssetRow[])
    }
    if (!itemRes.error) setRequested((itemRes.data || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0))
  }, [orderId, cardId])

  useEffect(() => { if (orderId || cardId) void load() }, [orderId, cardId, load])

  const counts = useMemo(() => ({
    reserved: assets.filter(asset=>asset.status === 'reserved').length,
    programmed: assets.filter(asset=>asset.status === 'programmed').length,
    assigned: assets.filter(asset=>asset.status === 'assigned').length,
    delivered: assets.filter(asset=>asset.status === 'delivered').length,
  }), [assets])

  const reserve = async () => {
    if (!orderId) return
    setReserving(true); setError('')
    try {
      validateBulkNfcQuantity(reserveQuantity)
      const { error: reserveError } = await supabase.rpc('oxxen_connect_reserve_nfc_assets', { p_order_id: orderId, p_quantity: reserveQuantity, p_order_item_id: null })
      if (reserveError) throw new Error('No se pudo reservar inventario. Verifica disponibilidad, permisos y MFA.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar inventario NFC.')
    } finally { setReserving(false) }
  }

  if (!available) return null

  return (
    <section className="panel form-section">
      <div className="panel-title"><div><h2>{title}</h2><small>Pedido → item → NFC físico → card digital. El UID nunca sustituye el public_id.</small></div><Link className="ghost-button" to="/admin/inventario-nfc">Ver inventario</Link></div>
      {orderId && <div className="mini-kpi-grid"><div><span>Solicitados</span><strong>{requested}</strong></div><div><span>Reservados</span><strong>{counts.reserved}</strong></div><div><span>Programados</span><strong>{counts.programmed}</strong></div><div><span>Asignados</span><strong>{counts.assigned}</strong></div><div><span>Entregados</span><strong>{counts.delivered}</strong></div></div>}
      {allowReserve && orderId && <div className="button-row"><input style={{ maxWidth: 120 }} type="number" min="1" max="500" value={reserveQuantity} onChange={e=>setReserveQuantity(Number(e.target.value))}/><button className="ghost-button" disabled={reserving} onClick={()=>void reserve()}>{reserving ? 'Reservando...' : 'Reservar disponibles'}</button></div>}
      {error && <div className="error-box">{error}</div>}
      {assets.length === 0 ? <p>No hay activos NFC asociados todavía.</p> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Chip</th><th>UID</th><th>Estado</th><th>Order item</th><th>Card digital</th></tr></thead><tbody>{assets.map(asset => <tr key={asset.id}><td><Link className="linkish" to={`/admin/inventario-nfc/${asset.id}`}>{asset.asset_code}</Link></td><td>{NFC_CHIP_LABELS[asset.chip_type]}</td><td><code>{asset.uid || '—'}</code></td><td>{NFC_STATUS_LABELS[asset.status]}</td><td>{asset.order_item ? (asset.order_item.description || asset.order_item.item_type) : '—'}</td><td>{asset.card ? <Link className="linkish" to={`/admin/tarjetas/${asset.card.id}`} title={`public_id: ${asset.card.public_id}`}>{asset.card.full_name}</Link> : '—'}</td></tr>)}</tbody></table></div>}
    </section>
  )
}
