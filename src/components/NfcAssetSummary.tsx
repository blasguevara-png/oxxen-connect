import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NFC_CHIP_LABELS, NFC_STATUS_LABELS, validateBulkNfcQuantity } from '../lib/nfc'
import { supabase } from '../lib/supabase'
import type { NfcAssetRecord } from '../types'

type Props = {
  orderId?: string
  cardId?: string
  title?: string
  allowReserve?: boolean
}

export function NfcAssetSummary({ orderId, cardId, title = 'NFC físicos', allowReserve = false }: Props) {
  const [assets, setAssets] = useState<NfcAssetRecord[]>([])
  const [available, setAvailable] = useState(true)
  const [reserveQuantity, setReserveQuantity] = useState(1)
  const [reserving, setReserving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    let query = supabase.from('oxxen_connect_nfc_assets').select('*').order('created_at', { ascending: true })
    if (orderId) query = query.eq('order_id', orderId)
    if (cardId) query = query.eq('card_id', cardId)
    const { data, error: loadError } = await query
    if (loadError) {
      setAvailable(false)
      setAssets([])
    } else {
      setAvailable(true)
      setAssets((data || []) as NfcAssetRecord[])
    }
  }

  useEffect(() => {
    if (orderId || cardId) void load()
  }, [orderId, cardId])

  const reserve = async () => {
    if (!orderId) return
    setReserving(true)
    setError('')
    try {
      validateBulkNfcQuantity(reserveQuantity)
      const { error: reserveError } = await supabase.rpc('oxxen_connect_reserve_nfc_assets', {
        p_order_id: orderId,
        p_quantity: reserveQuantity,
        p_order_item_id: null,
      })
      if (reserveError) throw new Error('No se pudo reservar inventario. Verifica disponibilidad, permisos y MFA.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar inventario NFC.')
    } finally { setReserving(false) }
  }

  if (!available) return null

  return (
    <section className="panel form-section">
      <div className="panel-title"><h2>{title}</h2><Link className="ghost-button" to="/admin/inventario-nfc">Ver inventario</Link></div>
      {allowReserve && orderId && <div className="button-row"><input style={{ maxWidth: 120 }} type="number" min="1" max="500" value={reserveQuantity} onChange={e=>setReserveQuantity(Number(e.target.value))}/><button className="ghost-button" disabled={reserving} onClick={()=>void reserve()}>{reserving ? 'Reservando...' : 'Reservar disponibles'}</button></div>}
      {error && <div className="error-box">{error}</div>}
      {assets.length === 0 ? <p>No hay activos NFC asociados todavía.</p> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Chip</th><th>UID</th><th>Estado</th></tr></thead><tbody>
        {assets.map(asset => <tr key={asset.id}><td><Link className="linkish" to={`/admin/inventario-nfc/${asset.id}`}>{asset.asset_code}</Link></td><td>{NFC_CHIP_LABELS[asset.chip_type]}</td><td><code>{asset.uid || '—'}</code></td><td>{NFC_STATUS_LABELS[asset.status]}</td></tr>)}
      </tbody></table></div>}
    </section>
  )
}
