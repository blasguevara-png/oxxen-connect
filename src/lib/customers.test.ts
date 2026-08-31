import { describe, expect, it } from 'vitest'
import { canManageCustomers, canReadCustomers, customerDisplayName, normalizeCustomerDraft, validateCustomerDraft } from './customers'
import type { CustomerDraft } from '../types'

const baseDraft: CustomerDraft = {
  business_name: ' OXXEN Cliente ',
  contact_name: ' Ana Pérez ',
  email: ' ana@example.com ',
  phone: ' 999999999 ',
  whatsapp: ' 51999999999 ',
  document_type: 'RUC',
  document_number: ' 20123456789 ',
  address: ' Lima ',
  notes: ' Cliente inicial ',
  status: 'lead',
}

describe('customer domain', () => {
  it('normalizes optional customer fields without inventing data', () => {
    expect(normalizeCustomerDraft(baseDraft)).toEqual({
      ...baseDraft,
      business_name: 'OXXEN Cliente',
      contact_name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '999999999',
      whatsapp: '51999999999',
      document_number: '20123456789',
      address: 'Lima',
      notes: 'Cliente inicial',
    })
  })

  it('requires at least a business name or a contact name', () => {
    expect(validateCustomerDraft({ ...baseDraft, business_name: ' ', contact_name: null })).toContain('nombre')
    expect(validateCustomerDraft({ ...baseDraft, business_name: null, contact_name: 'Ana' })).toBe('')
  })

  it('uses the business name first, then contact, then internal code', () => {
    expect(customerDisplayName({ business_name: 'Negocio', contact_name: 'Ana', customer_code: 'CLI-000001' })).toBe('Negocio')
    expect(customerDisplayName({ business_name: null, contact_name: 'Ana', customer_code: 'CLI-000001' })).toBe('Ana')
    expect(customerDisplayName({ business_name: null, contact_name: null, customer_code: 'CLI-000001' })).toBe('CLI-000001')
  })

  it('matches Sprint 3 customer role permissions', () => {
    expect(canReadCustomers('OWNER')).toBe(true)
    expect(canReadCustomers('EDITOR')).toBe(true)
    expect(canReadCustomers('SUPPORT')).toBe(true)
    expect(canManageCustomers('OWNER')).toBe(true)
    expect(canManageCustomers('ADMIN')).toBe(true)
    expect(canManageCustomers('SALES')).toBe(true)
    expect(canManageCustomers('EDITOR')).toBe(false)
    expect(canManageCustomers('SUPPORT')).toBe(false)
  })
})
