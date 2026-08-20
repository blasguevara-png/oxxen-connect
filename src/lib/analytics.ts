import { supabase } from './supabase'

const allowedEvents = new Set([
  'view', 'whatsapp', 'phone', 'email', 'website', 'instagram',
  'facebook', 'tiktok', 'linkedin', 'maps', 'vcard',
])

export function trackEvent(cardId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  if (!allowedEvents.has(eventType)) return

  void supabase
    .from('oxxen_connect_analytics_events')
    .insert({ card_id: cardId, event_type: eventType, metadata })
    .then(() => undefined)
}
