import type { AdminRole, OrderItemDraft, OrderStatus, PaymentStatus } from '../types'

export const ORDER_STATUSES: OrderStatus[] = ['draft', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled']
export const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'partial', 'paid', 'refunded']

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmado',
  in_production: 'En producción',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
  refunded: 'Reembolsado',
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export function formatOrderCode(orderNumber: number) {
  if (!Number.isInteger(orderNumber) || orderNumber <= 0) throw new Error('Número de pedido inválido.')
  return `ORD-${String(orderNumber).padStart(6, '0')}`
}

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus) {
  return from === to || TRANSITIONS[from].includes(to)
}

export function nextOrderStatuses(from: OrderStatus) {
  return TRANSITIONS[from]
}

export function calculateOrderTotals(items: Pick<OrderItemDraft, 'quantity' | 'unit_price'>[], discount = 0) {
  if (!Number.isFinite(discount) || discount < 0) throw new Error('El descuento no puede ser negativo.')
  let quantity = 0
  let subtotal = 0
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('La cantidad debe ser mayor a cero.')
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error('El precio unitario no puede ser negativo.')
    quantity += item.quantity
    subtotal += item.quantity * item.unit_price
  }
  subtotal = roundMoney(subtotal)
  const total = roundMoney(Math.max(subtotal - discount, 0))
  return { quantity, subtotal, discount: roundMoney(discount), total }
}

export function canReadOrders(role: AdminRole) {
  return ['OWNER', 'ADMIN', 'EDITOR', 'SUPPORT', 'SALES'].includes(role)
}

export function canManageOrders(role: AdminRole) {
  return ['OWNER', 'ADMIN', 'SALES'].includes(role)
}

export function money(value: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(Number(value || 0))
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
