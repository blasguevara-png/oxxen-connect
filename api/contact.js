function escapeVCard(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n')
}

function cleanPhone(value = '') {
  return String(value).replace(/[^\d+]/g, '')
}

function normalizeUrl(value = '') {
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function safeFilename(value = 'contacto') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'contacto'
}

function splitName(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] || '', last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('Method Not Allowed')
  }

  const rawIdentifier = Array.isArray(req.query.id)
    ? req.query.id[0]
    : req.query.id || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug)
  const identifier = String(rawIdentifier || '').trim()
  if (!identifier || identifier.length > 120) return res.status(400).send('Identificador inválido')

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).send('Configuración incompleta')

  const endpoint = `${supabaseUrl}/rest/v1/rpc/get_public_card`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_identifier: identifier }),
    })

    if (!response.ok) return res.status(502).send('No se pudo leer el contacto')
    const rows = await response.json()
    const card = Array.isArray(rows) ? rows[0] : rows
    if (!card) return res.status(404).send('Contacto no encontrado')

    const phone = cleanPhone(card.phone || card.whatsapp || '')
    const { first, last } = splitName(card.full_name)
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCard(card.full_name)}`,
      `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
      card.company ? `ORG:${escapeVCard(card.company)}` : '',
      card.job_title ? `TITLE:${escapeVCard(card.job_title)}` : '',
      phone ? `TEL;TYPE=CELL:${phone}` : '',
      card.email ? `EMAIL;TYPE=INTERNET:${escapeVCard(card.email.trim())}` : '',
      card.website ? `URL:${normalizeUrl(card.website)}` : '',
      card.address ? `ADR;TYPE=WORK:;;${escapeVCard(card.address)};;;;` : '',
      'END:VCARD',
    ].filter(Boolean)

    const vcard = `${lines.join('\r\n')}\r\n`
    const filename = `${safeFilename(card.full_name || 'contacto')}.vcf`

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return res.status(200).send(vcard)
  } catch {
    return res.status(500).send('Error al preparar el contacto')
  }
}
