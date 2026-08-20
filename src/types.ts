export type ThemeMode = 'dark' | 'light'

export type CardRecord = {
  id: string
  slug: string
  full_name: string
  company: string | null
  job_title: string | null
  bio: string | null
  whatsapp: string | null
  phone: string | null
  email: string | null
  website: string | null
  instagram: string | null
  facebook: string | null
  tiktok: string | null
  linkedin: string | null
  address: string | null
  maps_url: string | null
  cta_text: string
  accent_color: string
  theme: ThemeMode
  profile_image_url: string | null
  logo_url: string | null
  active: boolean
  links_order: string[]
  created_at: string
  updated_at: string
}

export type CardDraft = Omit<CardRecord, 'id' | 'created_at' | 'updated_at'>

export type AnalyticsEvent = {
  id: string
  card_id: string
  event_type: string
  created_at: string
}
