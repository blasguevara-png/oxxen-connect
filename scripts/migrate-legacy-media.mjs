import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) throw new Error('Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en un entorno seguro.')

const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
const officialOrigin = new URL(url).origin
const bucket = 'oxxen-connect-media'
const { data: cards, error } = await supabase.from('oxxen_connect_cards').select('id,profile_image_url,logo_url')
if (error) throw error

let migrated = 0
for (const card of cards || []) {
  const updates = {}
  for (const [field, kind] of [['profile_image_url', 'profile'], ['logo_url', 'logo']]) {
    const source = card[field]
    if (!source) continue
    const sourceUrl = new URL(source)
    if (sourceUrl.origin === officialOrigin) continue

    const response = await fetch(source, { redirect: 'follow' })
    if (!response.ok) throw new Error(`${card.id}/${field}: no se pudo descargar (${response.status})`)
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error(`${card.id}/${field}: MIME no permitido ${type}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error(`${card.id}/${field}: tamaño inválido`)
    const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'
    const path = `${card.id}/${kind}-migrated-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: type, cacheControl: '31536000', upsert: false })
    if (uploadError) throw uploadError
    const { data: check, error: checkError } = await supabase.storage.from(bucket).download(path)
    if (checkError || !check || check.size !== bytes.length) {
      await supabase.storage.from(bucket).remove([path])
      throw new Error(`${card.id}/${field}: falló verificación posterior a subida`)
    }
    updates[field] = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }

  if (Object.keys(updates).length) {
    const { error: updateError } = await supabase.from('oxxen_connect_cards').update(updates).eq('id', card.id)
    if (updateError) throw updateError
    migrated += Object.keys(updates).length
  }
}

console.log(`Migración terminada: ${migrated} referencias de medios movidas al Storage oficial.`)
