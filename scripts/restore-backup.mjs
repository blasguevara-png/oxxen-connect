import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const backupDir = process.argv[2]
const apply = process.argv.includes('--apply')
if (!backupDir) throw new Error('Uso: node scripts/restore-backup.mjs <carpeta-backup> [--apply]')

async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(path.join(backupDir, filename), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT' && fallback !== undefined) return fallback
    throw error
  }
}

const manifest = await readJson('manifest.json')
// Backward-compatible with Sprint 2 / S3.1 / S3.2 backups created before NFC inventory existed.
const customers = await readJson('oxxen_connect_customers.json', [])
const orders = await readJson('oxxen_connect_orders.json', [])
const cards = await readJson('oxxen_connect_cards.json')
const orderItems = await readJson('oxxen_connect_order_items.json', [])
const nfcAssets = await readJson('oxxen_connect_nfc_assets.json', [])
const aliases = await readJson('oxxen_connect_card_aliases.json')
const admins = await readJson('oxxen_connect_admins.json')
const analytics = await readJson('oxxen_connect_analytics_events.json')
const audit = await readJson('oxxen_connect_audit_logs.json')

const publicIds = new Set(cards.map(card => card.public_id))
if (publicIds.size !== cards.length) throw new Error('Backup inválido: public_id duplicado.')
const aliasValues = new Set(aliases.map(alias => alias.alias))
if (aliasValues.size !== aliases.length) throw new Error('Backup inválido: alias histórico duplicado.')
const cardIds = new Set(cards.map(card => card.id))
if (aliases.some(alias => !cardIds.has(alias.card_id))) throw new Error('Backup inválido: alias sin tarjeta.')
if (analytics.some(event => !cardIds.has(event.card_id))) throw new Error('Backup inválido: analytics sin tarjeta.')

const customerIds = new Set(customers.map(customer => customer.id))
const customerCodes = new Set(customers.map(customer => customer.customer_code))
const customerNumbers = new Set(customers.map(customer => customer.customer_number))
if (customerIds.size !== customers.length) throw new Error('Backup inválido: customer id duplicado.')
if (customerCodes.size !== customers.length) throw new Error('Backup inválido: customer_code duplicado.')
if (customerNumbers.size !== customers.length) throw new Error('Backup inválido: customer_number duplicado.')
if (cards.some(card => card.customer_id && !customerIds.has(card.customer_id))) {
  throw new Error('Backup inválido: tarjeta vinculada a un cliente ausente.')
}

const orderIds = new Set(orders.map(order => order.id))
const orderCodes = new Set(orders.map(order => order.order_code))
const orderNumbers = new Set(orders.map(order => order.order_number))
if (orderIds.size !== orders.length) throw new Error('Backup inválido: order id duplicado.')
if (orderCodes.size !== orders.length) throw new Error('Backup inválido: order_code duplicado.')
if (orderNumbers.size !== orders.length) throw new Error('Backup inválido: order_number duplicado.')
if (orders.some(order => !customerIds.has(order.customer_id))) throw new Error('Backup inválido: pedido vinculado a un cliente ausente.')
if (orderItems.some(item => !orderIds.has(item.order_id))) throw new Error('Backup inválido: item vinculado a un pedido ausente.')
if (orderItems.some(item => item.card_id && !cardIds.has(item.card_id))) throw new Error('Backup inválido: item vinculado a una tarjeta ausente.')

const orderItemIds = new Set(orderItems.map(item => item.id))
const assetIds = new Set(nfcAssets.map(asset => asset.id))
const assetCodes = new Set(nfcAssets.map(asset => asset.asset_code))
const assetNumbers = new Set(nfcAssets.map(asset => asset.asset_number))
const uids = nfcAssets.map(asset => asset.uid).filter(Boolean)
const cardLinks = nfcAssets.map(asset => asset.card_id).filter(Boolean)
if (assetIds.size !== nfcAssets.length) throw new Error('Backup inválido: NFC asset id duplicado.')
if (assetCodes.size !== nfcAssets.length) throw new Error('Backup inválido: asset_code NFC duplicado.')
if (assetNumbers.size !== nfcAssets.length) throw new Error('Backup inválido: asset_number NFC duplicado.')
if (new Set(uids).size !== uids.length) throw new Error('Backup inválido: UID NFC duplicado.')
if (new Set(cardLinks).size !== cardLinks.length) throw new Error('Backup inválido: más de un NFC asociado a la misma tarjeta.')
if (nfcAssets.some(asset => asset.order_id && !orderIds.has(asset.order_id))) throw new Error('Backup inválido: NFC vinculado a pedido ausente.')
if (nfcAssets.some(asset => asset.order_item_id && !orderItemIds.has(asset.order_item_id))) throw new Error('Backup inválido: NFC vinculado a order item ausente.')
if (nfcAssets.some(asset => asset.card_id && !cardIds.has(asset.card_id))) throw new Error('Backup inválido: NFC vinculado a tarjeta ausente.')
for (const asset of nfcAssets) {
  if (!asset.order_item_id) continue
  const item = orderItems.find(row => row.id === asset.order_item_id)
  if (asset.order_id && item?.order_id !== asset.order_id) throw new Error('Backup inválido: NFC tiene order_id y order_item_id inconsistentes.')
}

console.log('Validación OK', {
  generated_at: manifest.generated_at,
  customers: customers.length,
  orders: orders.length,
  cards: cards.length,
  orderItems: orderItems.length,
  nfcAssets: nfcAssets.length,
  aliases: aliases.length,
  admins: admins.length,
  analytics: analytics.length,
  audit: audit.length,
})
if (!apply) {
  console.log('Modo dry-run. No se modificó la base. Usa --apply únicamente después de revisar el backup.')
  process.exit(0)
}

const url = process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) throw new Error('Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en un entorno seguro.')
const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })

async function upsertBatches(table, rows, onConflict = 'id') {
  const batchSize = 250
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + batchSize), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

// Preserve original customer ids/codes/numbers before dependent orders/cards.
await upsertBatches('oxxen_connect_customers', customers)
if (customers.length) {
  const { error } = await supabase.rpc('oxxen_connect_sync_customer_sequence')
  if (error) throw new Error(`customer sequence: ${error.message}`)
}

// Orders depend on customers; order items depend on both orders and optionally cards.
await upsertBatches('oxxen_connect_orders', orders)
if (orders.length) {
  const { error } = await supabase.rpc('oxxen_connect_sync_order_sequence')
  if (error) throw new Error(`order sequence: ${error.message}`)
}

// Preserve original card id, public_id and aliases. Never generate replacements during restore.
await upsertBatches('oxxen_connect_cards', cards)
await upsertBatches('oxxen_connect_order_items', orderItems)
await upsertBatches('oxxen_connect_nfc_assets', nfcAssets)
if (nfcAssets.length) {
  const { error } = await supabase.rpc('oxxen_connect_sync_nfc_asset_sequence')
  if (error) throw new Error(`NFC asset sequence: ${error.message}`)
}
await upsertBatches('oxxen_connect_card_aliases', aliases)
await upsertBatches('oxxen_connect_admins', admins, 'user_id')
await upsertBatches('oxxen_connect_analytics_events', analytics)
await upsertBatches('oxxen_connect_audit_logs', audit)
console.log('Restauración terminada. Ejecuta smoke tests de QR/NFC, pedidos e inventario antes de cerrar el incidente.')
