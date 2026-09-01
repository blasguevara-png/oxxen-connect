import { describe, expect, it } from 'vitest'
import { canManageNfcInventory, canReadNfcInventory, canTransitionNfcStatus, formatNfcAssetCode, nextNfcStatuses, normalizeNfcUid, validateBulkNfcQuantity } from './nfc'

describe('NFC inventory domain', () => {
  it('formats internal asset codes without making them public identity', () => {
    expect(formatNfcAssetCode(1)).toBe('NFC-000001')
    expect(formatNfcAssetCode(42)).toBe('NFC-000042')
    expect(() => formatNfcAssetCode(0)).toThrow()
  })

  it('normalizes physical UIDs', () => {
    expect(normalizeNfcUid('04:a1-b2 c3:d4:e5:f6')).toBe('04A1B2C3D4E5F6')
    expect(normalizeNfcUid('')).toBeNull()
    expect(() => normalizeNfcUid('XYZ')).toThrow()
  })

  it('enforces lifecycle transitions', () => {
    expect(canTransitionNfcStatus('available', 'reserved')).toBe(true)
    expect(canTransitionNfcStatus('reserved', 'available')).toBe(true)
    expect(canTransitionNfcStatus('programmed', 'assigned')).toBe(true)
    expect(canTransitionNfcStatus('assigned', 'delivered')).toBe(true)
    expect(canTransitionNfcStatus('delivered', 'available')).toBe(false)
    expect(nextNfcStatuses('defective')).toEqual(['retired'])
  })

  it('caps bulk creation', () => {
    expect(validateBulkNfcQuantity(100)).toBe(100)
    expect(() => validateBulkNfcQuantity(0)).toThrow()
    expect(() => validateBulkNfcQuantity(501)).toThrow()
  })

  it('keeps read wider than operational management', () => {
    expect(canReadNfcInventory('SALES')).toBe(true)
    expect(canManageNfcInventory('SALES')).toBe(false)
    expect(canManageNfcInventory('ADMIN')).toBe(true)
    expect(canManageNfcInventory('OWNER')).toBe(true)
  })
})
