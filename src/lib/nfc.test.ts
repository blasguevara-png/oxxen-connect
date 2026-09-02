import { describe, expect, it } from 'vitest'
import {
  calculateNfcCoverage,
  canManageNfcInventory,
  canReadNfcInventory,
  canTransitionNfcStatus,
  formatNfcAssetCode,
  nextNfcStatuses,
  normalizeNfcUid,
  validateBulkNfcQuantity,
  validateNfcChipType,
  validateNfcStatus,
} from './nfc'

describe('NFC inventory domain', () => {
  it('formats internal asset codes without making them public identity', () => {
    expect(formatNfcAssetCode(1)).toBe('NFC-000001')
    expect(formatNfcAssetCode(42)).toBe('NFC-000042')
    expect(() => formatNfcAssetCode(0)).toThrow()
  })

  it('validates supported chip types', () => {
    expect(validateNfcChipType('NTAG213')).toBe('NTAG213')
    expect(validateNfcChipType('NTAG424_DNA')).toBe('NTAG424_DNA')
    expect(validateNfcChipType('OTHER')).toBe('OTHER')
    expect(() => validateNfcChipType('MIFARE_CLASSIC')).toThrow()
  })

  it('validates supported statuses', () => {
    expect(validateNfcStatus('available')).toBe('available')
    expect(validateNfcStatus('delivered')).toBe('delivered')
    expect(() => validateNfcStatus('deleted')).toThrow()
  })

  it('normalizes physical UIDs while keeping UID optional', () => {
    expect(normalizeNfcUid('04:a1-b2 c3:d4:e5:f6')).toBe('04A1B2C3D4E5F6')
    expect(normalizeNfcUid('')).toBeNull()
    expect(normalizeNfcUid(null)).toBeNull()
    expect(() => normalizeNfcUid('XYZ')).toThrow()
  })

  it('enforces lifecycle transitions including reserve/release/assignment', () => {
    expect(canTransitionNfcStatus('available', 'reserved')).toBe(true)
    expect(canTransitionNfcStatus('reserved', 'available')).toBe(true)
    expect(canTransitionNfcStatus('reserved', 'programmed')).toBe(true)
    expect(canTransitionNfcStatus('programmed', 'assigned')).toBe(true)
    expect(canTransitionNfcStatus('assigned', 'delivered')).toBe(true)
    expect(canTransitionNfcStatus('delivered', 'available')).toBe(false)
    expect(nextNfcStatuses('defective')).toEqual(['retired'])
  })

  it('rejects absurd lifecycle jumps', () => {
    expect(canTransitionNfcStatus('available', 'delivered')).toBe(false)
    expect(canTransitionNfcStatus('reserved', 'assigned')).toBe(false)
    expect(canTransitionNfcStatus('programmed', 'available')).toBe(false)
    expect(canTransitionNfcStatus('retired', 'available')).toBe(false)
  })

  it('caps bulk creation', () => {
    expect(validateBulkNfcQuantity(1)).toBe(1)
    expect(validateBulkNfcQuantity(100)).toBe(100)
    expect(validateBulkNfcQuantity(500)).toBe(500)
    expect(() => validateBulkNfcQuantity(0)).toThrow()
    expect(() => validateBulkNfcQuantity(501)).toThrow()
    expect(() => validateBulkNfcQuantity(1.5)).toThrow()
  })

  it('counts only fulfillment statuses toward the NFC request', () => {
    expect(calculateNfcCoverage(3, ['reserved', 'programmed', 'assigned'])).toEqual({
      requested: 3,
      covered: 3,
      pending: 0,
      overbooked: 0,
    })
    expect(calculateNfcCoverage(3, ['available', 'reserved', 'defective', 'lost'])).toEqual({
      requested: 3,
      covered: 1,
      pending: 2,
      overbooked: 0,
    })
  })

  it('detects over-reservation instead of hiding it', () => {
    expect(calculateNfcCoverage(3, ['reserved', 'reserved', 'reserved', 'reserved'])).toEqual({
      requested: 3,
      covered: 4,
      pending: 0,
      overbooked: 1,
    })
  })

  it('keeps read wider than operational management', () => {
    expect(canReadNfcInventory('SALES')).toBe(true)
    expect(canReadNfcInventory('SUPPORT')).toBe(true)
    expect(canReadNfcInventory('EDITOR')).toBe(true)
    expect(canManageNfcInventory('SALES')).toBe(false)
    expect(canManageNfcInventory('SUPPORT')).toBe(false)
    expect(canManageNfcInventory('EDITOR')).toBe(false)
    expect(canManageNfcInventory('ADMIN')).toBe(true)
    expect(canManageNfcInventory('OWNER')).toBe(true)
  })
})
