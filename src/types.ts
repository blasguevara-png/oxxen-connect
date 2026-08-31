export type ThemeMode = 'dark' | 'light'
export type AdminRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'SUPPORT' | 'SALES'

export type CardRecord = {
  id: string
  public_id: string
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
  deleted_at: string | null
  links_order: string[]
  created_at: string
  updated_at: string
}

export type PublicCardRecord = Pick<
  CardRecord,
  | 'public_id'
  | 'full_name'
  | 'company'
  | 'job_title'
  | 'bio'
  | 'whatsapp'
  | 'phone'
  | 'email'
  | 'website'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'linkedin'
  | 'address'
  | 'maps_url'
  | 'cta_text'
  | 'accent_color'
  | 'theme'
  | 'profile_image_url'
  | 'logo_url'
  | 'links_order'
>

export type CardDraft = Omit<CardRecord, 'id' | 'public_id' | 'deleted_at' | 'created_at' | 'updated_at'>

export type AnalyticsEvent = {
  id: string
  card_id: string
  event_type: string
  created_at: string
}

export type AnalyticsSummary = {
  card_id: string
  views: number
  whatsapp: number
  phone: number
  email: number
  website: number
  instagram: number
  facebook: number
  tiktok: number
  linkedin: number
  maps: number
  vcard: number
  share: number
}
