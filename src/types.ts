export type ThemeMode = 'dark' | 'light'
export type AdminRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'SUPPORT' | 'SALES'
export type CustomerStatus = 'lead' | 'active' | 'inactive' | 'blocked'
export type CustomerDocumentType = 'DNI' | 'RUC' | 'CE' | 'PASSPORT' | 'OTHER'
export type OrderStatus = 'draft' | 'confirmed' | 'in_production' | 'ready' | 'delivered' | 'cancelled'
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded'
export type OrderItemType = 'digital_card' | 'nfc_card' | 'service' | 'other'
export type NfcChipType = 'NTAG213' | 'NTAG215' | 'NTAG216' | 'NTAG424_DNA' | 'OTHER'
export type NfcAssetStatus = 'available' | 'reserved' | 'programmed' | 'assigned' | 'delivered' | 'defective' | 'lost' | 'retired'

export type CustomerRecord = {
  id: string
  customer_number: number
  customer_code: string
  business_name: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  document_type: CustomerDocumentType | null
  document_number: string | null
  address: string | null
  notes: string | null
  status: CustomerStatus
  created_at: string
  updated_at: string
}

export type CustomerDraft = Omit<CustomerRecord, 'id' | 'customer_number' | 'customer_code' | 'created_at' | 'updated_at'>

export type OrderRecord = {
  id: string
  order_number: number
  order_code: string
  customer_id: string
  status: OrderStatus
  payment_status: PaymentStatus
  currency: string
  subtotal: number
  discount: number
  total: number
  quantity: number
  notes: string | null
  created_by: string | null
  confirmed_at: string | null
  production_started_at: string | null
  ready_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type OrderItemRecord = {
  id: string
  order_id: string
  item_type: OrderItemType
  description: string | null
  quantity: number
  unit_price: number
  subtotal: number
  card_id: string | null
  created_at: string
  updated_at: string
}

export type OrderItemDraft = Pick<OrderItemRecord, 'item_type' | 'description' | 'quantity' | 'unit_price' | 'card_id'>

export type NfcAssetRecord = {
  id: string
  asset_number: number
  asset_code: string
  chip_type: NfcChipType
  uid: string | null
  status: NfcAssetStatus
  order_id: string | null
  order_item_id: string | null
  card_id: string | null
  batch_code: string | null
  supplier: string | null
  purchase_cost: number | null
  notes: string | null
  programmed_at: string | null
  reserved_at: string | null
  delivered_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

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
  customer_id?: string | null
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
