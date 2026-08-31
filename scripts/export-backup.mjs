import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const url = process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) {
  throw new Error('Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY solo en un entorno seguro de backup.')
}

const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = path.resolve(process.argv[2] || `backups/oxxen-connect-${stamp}`)
await mkdir(outputDir, { recursive: true })

const tables = [
  'oxxen_connect_customers',
  'oxxen_connect_cards',
  'oxxen_connect_card_aliases',
  'oxxen_connect_admins',
  'oxxen_connect_analytics_events',
  'oxxen_connect_audit_logs',
]

async function fetchAll(table) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

const counts = {}
for (const table of tables) {
  const rows = await fetchAll(table)
  counts[table] = rows.length
  await writeFile(path.join(outputDir, `${table}.json`), JSON.stringify(rows, null, 2), 'utf8')
}

await writeFile(
  path.join(outputDir, 'manifest.json'),
  JSON.stringify({
    product: 'OXXEN Connect',
    generated_at: new Date().toISOString(),
    source: url,
    counts,
    warning: 'Contiene datos operativos. Guardar cifrado y fuera de repositorios públicos.',
  }, null, 2),
  'utf8',
)

console.log(`Backup exportado en ${outputDir}`)
