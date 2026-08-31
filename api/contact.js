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
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.toString()
  } catch {
    return ''
  }
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
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('Method Not Allowed')
  }

  let requestUrl
  try {
    requestUrl = new URL(req.url || '/', 'https://connect.oxxengroup.com')
  } catch {
    return res.status(400).send('Solicitud inválida')
  }

  const rawIdentifier = requestUrl.searchParams.get('id') || requestUrl.searchParams.get('slug') || ''
  const identifier = rawIdentifier.trim()
  if (!identifier || identifier.length > 120) return res.status(400).send('Identificador inválido')

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).send('Servicio temporalmente no disponible')

  let endpoint
  try {
    endpoint = new URL('/rest/v1/rpc/get_public_card', supabaseUrl).toString()
  } catch {
    return res.status(500).send('Servicio temporalmente no disponible')
  }

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
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return res.status(502).send('No se pudo leer el contacto')
    const rows = await response.json()
    const card = Array.isArray(rows) ? rows[0] : rows
    if (!card) return res.status(404).send('Contacto no encontrado')

    const phone = cleanPhone(card.phone || card.whatsapp || '')
    const { first, last } = splitName(card.full_name)
    const website = normalizeUrl(card.website)
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCard(card.full_name)}`,
      `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
      card.company ? `ORG:${escapeVCard(card.company)}` : '',
      card.job_title ? `TITLE:${escapeVCard(card.job_title)}` : '',
      phone ? `TEL;TYPE=CELL:${phone}` : '',
      card.email ? `EMAIL;TYPE=INTERNET:${escapeVCard(card.email.trim())}` : '',
      website ? `URL:${website}` : '',
      card.address ? `ADR;TYPE=WORK:;;${escapeVCard(card.address)};;;;` : '',
      'END:VCARD',
    ].filter(Boolean)

    const vcard = `${lines.join('\r\n')}\r\n`
    const filename = `${safeFilename(card.full_name || 'contacto')}.vcf`

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    return res.status(200).send(vcard)
  } catch (error) {
    if (error?.name === 'TimeoutError') return res.status(504).send('El servicio tardó demasiado en responder')
    return res.status(500).send('Error al preparar el contacto')
  }
}
