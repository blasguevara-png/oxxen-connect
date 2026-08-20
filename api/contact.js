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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('Method Not Allowed')
  }

  const rawSlug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug
  const slug = String(rawSlug || '').trim()
  if (!slug) return res.status(400).send('Falta slug')

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !supabaseKey) return res.status(500).send('Configuración incompleta')

  const endpoint = `${supabaseUrl}/rest/v1/oxxen_connect_cards?slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=slug,full_name,company,job_title,phone,whatsapp,email,website,address`

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) return res.status(502).send('No se pudo leer el contacto')
    const rows = await response.json()
    const card = rows?.[0]
    if (!card) return res.status(404).send('Contacto no encontrado')

    const phone = cleanPhone(card.phone || card.whatsapp || '')
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCard(card.full_name)}`,
      card.company ? `ORG:${escapeVCard(card.company)}` : '',
      card.job_title ? `TITLE:${escapeVCard(card.job_title)}` : '',
      phone ? `TEL;TYPE=CELL:${phone}` : '',
      card.email ? `EMAIL;TYPE=INTERNET:${escapeVCard(card.email.trim())}` : '',
      card.website ? `URL:${normalizeUrl(card.website)}` : '',
      card.address ? `ADR;TYPE=WORK:;;${escapeVCard(card.address)};;;;` : '',
      'END:VCARD',
    ].filter(Boolean)

    const vcard = `${lines.join('\r\n')}\r\n`
    const filename = `${safeFilename(card.full_name || card.slug)}.vcf`

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store, max-age=0')
    return res.status(200).send(vcard)
  } catch {
    return res.status(500).send('Error al preparar el contacto')
  }
}
