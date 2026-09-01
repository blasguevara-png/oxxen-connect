import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NFC_CHIP_LABELS, NFC_STATUS_LABELS } from '../lib/nfc'
import { supabase } from '../lib/supabase'
import type { NfcAssetRecord } from '../types'

type Props = {
  orderId?: string
  cardId?: string
  title?: string
}

export function NfcAssetSummary({ orderId, cardId, title = 'NFC físicos' }: Props) {
  const [assets, setAssets] = useState<NfcAssetRecord[]>([])
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let query = supabase.from('oxxen_connect_nfc_assets').select('*').order('created_at', { ascending: true })
      if (orderId) query = query.eq('order_id', orderId)
      if (cardId) query = query.eq('card_id', cardId)
      const { data, error } = await query
      if (cancelled) return
      if (error) {
        setAvailable(false)
        setAssets([])
      } else {
        setAvailable(true)
        setAssets((data || []) as NfcAssetRecord[])
      }
    }
    if (orderId || cardId) void load()
    return () => { cancelled = true }
  }, [orderId, cardId])

  if (!available) return null

  return (
    <section className="panel form-section">
      <div className="panel-title"><h2>{title}</h2><Link className="ghost-button" to="/admin/inventario-nfc">Ver inventario</Link></div>
      {assets.length === 0 ? <p>No hay activos NFC asociados todavía.</p> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Chip</th><th>UID</th><th>Estado</th></tr></thead><tbody>
        {assets.map(asset => <tr key={asset.id}><td><Link className="linkish" to={`/admin/inventario-nfc/${asset.id}`}>{asset.asset_code}</Link></td><td>{NFC_CHIP_LABELS[asset.chip_type]}</td><td><code>{asset.uid || '—'}</code></td><td>{NFC_STATUS_LABELS[asset.status]}</td></tr>)}
      </tbody></table></div>}
    </section>
  )
}
