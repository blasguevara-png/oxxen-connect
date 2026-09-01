import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Boxes, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { NFC_ASSET_STATUSES, NFC_CHIP_LABELS, NFC_CHIP_TYPES, NFC_STATUS_LABELS, validateBulkNfcQuantity } from '../lib/nfc'
import { supabase } from '../lib/supabase'
import type { NfcAssetRecord, NfcAssetStatus, NfcChipType } from '../types'

type AssetRow = NfcAssetRecord & { order: { id: string; order_code: string } | null; card: { id: string; public_id: string; full_name: string; slug: string } | null }
type StatusFilter = 'all' | NfcAssetStatus
type ChipFilter = 'all' | NfcChipType

export function NfcInventory() {
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [chip, setChip] = useState<ChipFilter>('all')
  const [batch, setBatch] = useState('all')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newChip, setNewChip] = useState<NfcChipType>('NTAG213')
  const [quantity, setQuantity] = useState(1)
  const [batchCode, setBatchCode] = useState('')
  const [supplier, setSupplier] = useState('')
  const [purchaseCost, setPurchaseCost] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    const { data, error: loadError } = await supabase.from('oxxen_connect_nfc_assets').select('*, order:oxxen_connect_orders(id,order_code), card:oxxen_connect_cards(id,public_id,full_name,slug)').order('created_at', { ascending: false })
    if (loadError) setError('No pudimos cargar el inventario NFC.')
    else setAssets((data || []) as unknown as AssetRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const createBulk = async (event: FormEvent) => {
    event.preventDefault(); setCreating(true); setError('')
    try {
      validateBulkNfcQuantity(quantity)
      const cost = purchaseCost.trim() === '' ? null : Number(purchaseCost)
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('El costo de compra no puede ser negativo.')
      const { error: rpcError } = await supabase.rpc('oxxen_connect_bulk_create_nfc_assets', { p_chip_type: newChip, p_quantity: quantity, p_batch_code: batchCode.trim() || null, p_supplier: supplier.trim() || null, p_purchase_cost: cost, p_notes: null })
      if (rpcError) throw new Error('No se pudo registrar el lote NFC. Verifica permisos, MFA y datos.')
      setShowCreate(false); setQuantity(1); setBatchCode(''); setSupplier(''); setPurchaseCost(''); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear el inventario NFC.') }
    finally { setCreating(false) }
  }

  const batches = useMemo(() => Array.from(new Set(assets.map(asset => asset.batch_code).filter(Boolean) as string[])).sort(), [assets])
  const filtered = useMemo(() => assets.filter(asset => {
    const haystack = `${asset.asset_code} ${asset.uid || ''} ${asset.order?.order_code || ''} ${asset.card?.public_id || ''} ${asset.batch_code || ''}`.toLowerCase()
    return haystack.includes(query.toLowerCase()) && (status === 'all' || asset.status === status) && (chip === 'all' || asset.chip_type === chip) && (batch === 'all' || asset.batch_code === batch)
  }), [assets, query, status, chip, batch])
  const metrics = useMemo(() => NFC_ASSET_STATUSES.reduce<Record<NfcAssetStatus, number>>((acc, key) => { acc[key] = assets.filter(asset => asset.status === key).length; return acc }, { available: 0, reserved: 0, programmed: 0, assigned: 0, delivered: 0, defective: 0, lost: 0, retired: 0 }), [assets])

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="eyebrow">ACTIVOS FÍSICOS</span><h1>Inventario NFC</h1><p>Controla chips físicos sin confundir UID con la identidad digital permanente de cada tarjeta.</p></div><button className="primary-button" onClick={()=>setShowCreate(value=>!value)}><Plus size={18}/> Registrar lote</button></header>
      <div className="stats-grid"><div className="stat-card"><span>Total NFC</span><strong>{assets.length}</strong></div><div className="stat-card"><span>Disponibles</span><strong>{metrics.available}</strong></div><div className="stat-card"><span>Reservadas</span><strong>{metrics.reserved}</strong></div><div className="stat-card"><span>Programadas</span><strong>{metrics.programmed}</strong></div><div className="stat-card"><span>Asignadas</span><strong>{metrics.assigned}</strong></div><div className="stat-card"><span>Entregadas</span><strong>{metrics.delivered}</strong></div><div className="stat-card"><span>Defectuosas</span><strong>{metrics.defective}</strong></div><div className="stat-card"><span>Perdidas</span><strong>{metrics.lost}</strong></div></div>
      {showCreate && <form className="panel form-section" onSubmit={createBulk}><div className="panel-title"><h2>Registrar lote NFC</h2><small>Máximo 500 unidades por operación.</small></div><div className="grid-3"><label className="field"><span>Chip *</span><select value={newChip} onChange={e=>setNewChip(e.target.value as NfcChipType)}>{NFC_CHIP_TYPES.map(value=><option key={value} value={value}>{NFC_CHIP_LABELS[value]}</option>)}</select></label><label className="field"><span>Cantidad *</span><input type="number" min="1" max="500" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label><label className="field"><span>Lote</span><input placeholder="LOT-2026-001" value={batchCode} onChange={e=>setBatchCode(e.target.value)}/></label><label className="field"><span>Proveedor</span><input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label><label className="field"><span>Costo unitario</span><input type="number" min="0" step="0.01" value={purchaseCost} onChange={e=>setPurchaseCost(e.target.value)}/></label></div><button className="primary-button" disabled={creating}>{creating ? 'Registrando...' : 'Crear inventario'}</button></form>}
      <div className="toolbar"><div className="search-box"><Search size={18}/><input placeholder="Código, UID, pedido, public_id o lote..." value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="button-row"><select value={status} onChange={e=>setStatus(e.target.value as StatusFilter)}><option value="all">Todos los estados</option>{NFC_ASSET_STATUSES.map(value=><option key={value} value={value}>{NFC_STATUS_LABELS[value]}</option>)}</select><select value={chip} onChange={e=>setChip(e.target.value as ChipFilter)}><option value="all">Todos los chips</option>{NFC_CHIP_TYPES.map(value=><option key={value} value={value}>{NFC_CHIP_LABELS[value]}</option>)}</select><select value={batch} onChange={e=>setBatch(e.target.value)}><option value="all">Todos los lotes</option>{batches.map(value=><option key={value} value={value}>{value}</option>)}</select></div></div>
      {error && <div className="error-box">{error}</div>}
      {loading ? <Loading/> : filtered.length === 0 ? <div className="empty-state"><Boxes size={28}/><h2>{assets.length ? 'No hay resultados' : 'Inventario NFC vacío'}</h2><p>{assets.length ? 'Prueba otros filtros.' : 'Registra el primer lote cuando ingresen tarjetas o chips físicos.'}</p></div> : <div className="table-wrap"><table><thead><tr><th>Código</th><th>Chip</th><th>UID</th><th>Estado</th><th>Pedido</th><th>Tarjeta</th><th>Lote</th><th>Fecha</th></tr></thead><tbody>{filtered.map(asset => <tr key={asset.id}><td><Link className="linkish" to={`/admin/inventario-nfc/${asset.id}`}>{asset.asset_code}</Link></td><td>{NFC_CHIP_LABELS[asset.chip_type]}</td><td><code>{asset.uid || '—'}</code></td><td><span className={`status-pill ${['defective','lost','retired'].includes(asset.status) ? 'inactive' : 'active'}`}>{NFC_STATUS_LABELS[asset.status]}</span></td><td>{asset.order ? <Link className="linkish" to={`/admin/pedidos/${asset.order.id}`}>{asset.order.order_code}</Link> : '—'}</td><td>{asset.card ? <Link className="linkish" to={`/admin/tarjetas/${asset.card.id}`}>{asset.card.full_name}</Link> : '—'}</td><td>{asset.batch_code || '—'}</td><td>{new Date(asset.created_at).toLocaleDateString('es-PE')}</td></tr>)}</tbody></table></div>}
    </div>
  )
}
