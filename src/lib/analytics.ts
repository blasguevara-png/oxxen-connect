import { supabase } from './supabase'

const allowedEvents = new Set([
  'view', 'whatsapp', 'phone', 'email', 'website', 'instagram',
  'facebook', 'tiktok', 'linkedin', 'maps', 'vcard', 'share',
])

const SESSION_KEY = 'oxxen_connect_session_id'

function getSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const next = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(SESSION_KEY, next)
    return next
  } catch {
    return null
  }
}

export function trackEvent(publicId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  if (!publicId || !allowedEvents.has(eventType)) return

  void supabase.rpc('record_public_event', {
    p_identifier: publicId,
    p_event_type: eventType,
    p_metadata: metadata,
    p_session_id: getSessionId(),
  }).then(() => undefined)
}
