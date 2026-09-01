import { describe, expect, it } from 'vitest'
import { calculateOrderTotals, canManageOrders, canReadOrders, canTransitionOrderStatus, formatOrderCode, nextOrderStatuses } from './orders'

describe('orders domain', () => {
  it('formats sequential order codes', () => {
    expect(formatOrderCode(1)).toBe('ORD-000001')
    expect(formatOrderCode(27)).toBe('ORD-000027')
  })

  it('calculates quantity, subtotal, discount and total', () => {
    expect(calculateOrderTotals([
      { quantity: 2, unit_price: 35 },
      { quantity: 1, unit_price: 10.5 },
    ], 5)).toEqual({ quantity: 3, subtotal: 80.5, discount: 5, total: 75.5 })
  })

  it('never creates a negative total', () => {
    expect(calculateOrderTotals([{ quantity: 1, unit_price: 10 }], 100).total).toBe(0)
  })

  it('rejects invalid quantities and prices', () => {
    expect(() => calculateOrderTotals([{ quantity: 0, unit_price: 10 }])).toThrow()
    expect(() => calculateOrderTotals([{ quantity: 1, unit_price: -1 }])).toThrow()
    expect(() => calculateOrderTotals([{ quantity: 1, unit_price: 10 }], -1)).toThrow()
  })

  it('allows the expected order lifecycle', () => {
    expect(canTransitionOrderStatus('draft', 'confirmed')).toBe(true)
    expect(canTransitionOrderStatus('confirmed', 'in_production')).toBe(true)
    expect(canTransitionOrderStatus('in_production', 'ready')).toBe(true)
    expect(canTransitionOrderStatus('ready', 'delivered')).toBe(true)
    expect(canTransitionOrderStatus('delivered', 'draft')).toBe(false)
    expect(nextOrderStatuses('draft')).toEqual(['confirmed', 'cancelled'])
  })

  it('permits cancellation before delivery but not after delivery', () => {
    expect(canTransitionOrderStatus('draft', 'cancelled')).toBe(true)
    expect(canTransitionOrderStatus('confirmed', 'cancelled')).toBe(true)
    expect(canTransitionOrderStatus('in_production', 'cancelled')).toBe(true)
    expect(canTransitionOrderStatus('ready', 'cancelled')).toBe(true)
    expect(canTransitionOrderStatus('delivered', 'cancelled')).toBe(false)
  })

  it('separates read and management roles', () => {
    expect(canReadOrders('OWNER')).toBe(true)
    expect(canReadOrders('EDITOR')).toBe(true)
    expect(canReadOrders('SUPPORT')).toBe(true)
    expect(canManageOrders('OWNER')).toBe(true)
    expect(canManageOrders('ADMIN')).toBe(true)
    expect(canManageOrders('SALES')).toBe(true)
    expect(canManageOrders('EDITOR')).toBe(false)
    expect(canManageOrders('SUPPORT')).toBe(false)
  })
})
