import type { AdminRole, NfcAssetStatus, NfcChipType } from '../types'

export const NFC_CHIP_TYPES: NfcChipType[] = ['NTAG213', 'NTAG215', 'NTAG216', 'NTAG424_DNA', 'OTHER']
export const NFC_ASSET_STATUSES: NfcAssetStatus[] = ['available', 'reserved', 'programmed', 'assigned', 'delivered', 'defective', 'lost', 'retired']
export const NFC_COVERAGE_STATUSES: NfcAssetStatus[] = ['reserved', 'programmed', 'assigned', 'delivered']

export const NFC_CHIP_LABELS: Record<NfcChipType, string> = {
  NTAG213: 'NTAG213',
  NTAG215: 'NTAG215',
  NTAG216: 'NTAG216',
  NTAG424_DNA: 'NTAG424 DNA',
  OTHER: 'Otro',
}

export const NFC_STATUS_LABELS: Record<NfcAssetStatus, string> = {
  available: 'Disponible',
  reserved: 'Reservada',
  programmed: 'Programada',
  assigned: 'Asignada',
  delivered: 'Entregada',
  defective: 'Defectuosa',
  lost: 'Perdida',
  retired: 'Retirada',
}

const TRANSITIONS: Record<NfcAssetStatus, NfcAssetStatus[]> = {
  available: ['reserved', 'defective', 'lost', 'retired'],
  reserved: ['available', 'programmed', 'defective', 'lost', 'retired'],
  programmed: ['assigned', 'defective', 'lost', 'retired'],
  assigned: ['delivered', 'defective', 'lost', 'retired'],
  delivered: [],
  defective: ['retired'],
  lost: ['retired'],
  retired: [],
}

export function formatNfcAssetCode(assetNumber: number) {
  if (!Number.isInteger(assetNumber) || assetNumber <= 0) throw new Error('Número de activo NFC inválido.')
  return `NFC-${String(assetNumber).padStart(6, '0')}`
}

export function validateNfcChipType(value: string): NfcChipType {
  if (!NFC_CHIP_TYPES.includes(value as NfcChipType)) throw new Error('Tipo de chip NFC inválido.')
  return value as NfcChipType
}

export function validateNfcStatus(value: string): NfcAssetStatus {
  if (!NFC_ASSET_STATUSES.includes(value as NfcAssetStatus)) throw new Error('Estado NFC inválido.')
  return value as NfcAssetStatus
}

export function normalizeNfcUid(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const normalized = raw.toUpperCase().replace(/[:\s-]/g, '')
  if (!/^[0-9A-F]{8,32}$/.test(normalized)) throw new Error('UID NFC inválido.')
  return normalized
}

export function canTransitionNfcStatus(from: NfcAssetStatus, to: NfcAssetStatus) {
  return from === to || TRANSITIONS[from].includes(to)
}

export function nextNfcStatuses(from: NfcAssetStatus) {
  return TRANSITIONS[from]
}

export function validateBulkNfcQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) throw new Error('La cantidad debe estar entre 1 y 500.')
  return quantity
}

export function calculateNfcCoverage(requested: number, statuses: NfcAssetStatus[]) {
  const normalizedRequested = Number.isFinite(requested) ? Math.max(0, Math.trunc(requested)) : 0
  const covered = statuses.filter(status => NFC_COVERAGE_STATUSES.includes(status)).length
  return {
    requested: normalizedRequested,
    covered,
    pending: Math.max(normalizedRequested - covered, 0),
    overbooked: Math.max(covered - normalizedRequested, 0),
  }
}

export function canReadNfcInventory(role: AdminRole) {
  return ['OWNER', 'ADMIN', 'EDITOR', 'SUPPORT', 'SALES'].includes(role)
}

export function canManageNfcInventory(role: AdminRole) {
  return ['OWNER', 'ADMIN'].includes(role)
}
