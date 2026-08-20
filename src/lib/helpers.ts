import type { CardRecord } from '../types'

export const LINK_ORDER = [
  'whatsapp',
  'phone',
  'email',
  'website',
  'maps',
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
] as const

export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeUrl(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function cleanPhone(value?: string | null) {
  return (value || '').replace(/[^\d+]/g, '')
}

export function whatsappUrl(value?: string | null) {
  const phone = cleanPhone(value).replace(/^\+/, '')
  return phone ? `https://wa.me/${phone}` : ''
}

export function publicCardUrl(slug: string) {
  return `${window.location.origin}/p/${slug}`
}

export function makeVCard(card: CardRecord) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(card.full_name)}`,
    card.company ? `ORG:${escapeVCard(card.company)}` : '',
    card.job_title ? `TITLE:${escapeVCard(card.job_title)}` : '',
    card.phone ? `TEL;TYPE=CELL:${cleanPhone(card.phone)}` : '',
    card.email ? `EMAIL:${escapeVCard(card.email)}` : '',
    card.website ? `URL:${normalizeUrl(card.website)}` : '',
    card.address ? `ADR;TYPE=WORK:;;${escapeVCard(card.address)};;;;` : '',
    'END:VCARD',
  ].filter(Boolean)

  return lines.join('\r\n')
}

function escapeVCard(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}
