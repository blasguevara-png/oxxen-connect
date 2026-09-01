import { describe, expect, it } from 'vitest'
import { canTransitionNfcStatus, formatNfcAssetCode, normalizeNfcUid } from './nfc'
import type { NfcAssetStatus } from '../types'

type FakeAsset = {
  assetCode: string
  status: NfcAssetStatus
  uid: string | null
  orderId: string | null
  cardId: string | null
}

function transition(asset: FakeAsset, next: NfcAssetStatus) {
  if (!canTransitionNfcStatus(asset.status, next) || asset.status === next) {
    throw new Error(`Transición inválida: ${asset.status} -> ${next}`)
  }
  asset.status = next
}

describe('NFC inventory lifecycle integration', () => {
  it('creates 10 NFC, reserves 3, programs them and assigns three digital cards', () => {
    const assets: FakeAsset[] = Array.from({ length: 10 }, (_, index) => ({
      assetCode: formatNfcAssetCode(index + 1),
      status: 'available',
      uid: null,
      orderId: null,
      cardId: null,
    }))

    const reserved = assets.slice(0, 3)
    for (const asset of reserved) {
      transition(asset, 'reserved')
      asset.orderId = 'ORDER-TEST'
    }

    expect(assets.filter(asset => asset.status === 'reserved')).toHaveLength(3)
    expect(assets.filter(asset => asset.status === 'available')).toHaveLength(7)

    reserved.forEach((asset, index) => {
      transition(asset, 'programmed')
      asset.uid = normalizeNfcUid(`04:A1:B2:C3:D4:E5:F${index}`)
      transition(asset, 'assigned')
      asset.cardId = `CARD-${index + 1}`
    })

    expect(reserved.map(asset => asset.status)).toEqual(['assigned', 'assigned', 'assigned'])
    expect(new Set(reserved.map(asset => asset.uid)).size).toBe(3)
    expect(new Set(reserved.map(asset => asset.cardId)).size).toBe(3)
    expect(reserved.every(asset => asset.orderId === 'ORDER-TEST')).toBe(true)
  })

  it('releases a reservation back to clean available state', () => {
    const asset: FakeAsset = {
      assetCode: 'NFC-000001',
      status: 'reserved',
      uid: null,
      orderId: 'ORDER-TEST',
      cardId: null,
    }
    transition(asset, 'available')
    asset.orderId = null
    asset.cardId = null
    expect(asset).toMatchObject({ status: 'available', orderId: null, cardId: null })
  })

  it('does not allow a delivered NFC to become available again', () => {
    const delivered: FakeAsset = {
      assetCode: 'NFC-000001',
      status: 'delivered',
      uid: null,
      orderId: 'ORDER-TEST',
      cardId: 'CARD-1',
    }
    expect(() => transition(delivered, 'available')).toThrow('Transición inválida')
  })
})
