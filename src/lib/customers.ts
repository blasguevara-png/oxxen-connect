import type { AdminRole, CustomerDraft, CustomerRecord, CustomerStatus } from '../types'

export const CUSTOMER_STATUSES: CustomerStatus[] = ['lead', 'active', 'inactive', 'blocked']

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  lead: 'Lead',
  active: 'Activo',
  inactive: 'Inactivo',
  blocked: 'Bloqueado',
}

export function customerDisplayName(customer: Pick<CustomerRecord, 'business_name' | 'contact_name' | 'customer_code'>) {
  return customer.business_name?.trim() || customer.contact_name?.trim() || customer.customer_code
}

export function normalizeCustomerDraft(draft: CustomerDraft): CustomerDraft {
  return {
    ...draft,
    business_name: clean(draft.business_name),
    contact_name: clean(draft.contact_name),
    email: clean(draft.email),
    phone: clean(draft.phone),
    whatsapp: clean(draft.whatsapp),
    document_type: draft.document_type || null,
    document_number: clean(draft.document_number),
    address: clean(draft.address),
    notes: clean(draft.notes),
  }
}

export function validateCustomerDraft(draft: CustomerDraft) {
  const normalized = normalizeCustomerDraft(draft)
  if (!normalized.business_name && !normalized.contact_name) {
    return 'Ingresa el nombre del negocio o el nombre del contacto.'
  }
  if (!CUSTOMER_STATUSES.includes(normalized.status)) return 'Estado de cliente inválido.'
  return ''
}

export function canReadCustomers(role: AdminRole) {
  return ['OWNER', 'ADMIN', 'EDITOR', 'SUPPORT', 'SALES'].includes(role)
}

export function canManageCustomers(role: AdminRole) {
  return ['OWNER', 'ADMIN', 'SALES'].includes(role)
}

function clean(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
