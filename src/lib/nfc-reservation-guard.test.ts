import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')
const migration = read('supabase/migrations/20260902_fix_nfc_overreservation.sql')
const triggerGuard = read('supabase/migrations/20260902_fix_nfc_overreservation_trigger_guard.sql')
const summary = read('src/components/NfcAssetSummary.tsx')

describe('NFC over-reservation guard', () => {
  it('serializes reservations and enforces order-level capacity in PostgreSQL', () => {
    expect(migration).toMatch(/where o\.id = p_order_id\s+for update/i)
    expect(migration).toContain("i.item_type = 'nfc_card'")
    expect(migration).toContain("a.status in ('reserved','programmed','assigned','delivered')")
    expect(migration).toContain('v_remaining := v_requested - v_covered')
    expect(migration).toContain('if p_quantity > v_remaining then')
    expect(migration).toContain('No se pueden reservar % más')
  })

  it('enforces capacity per order item and auto-assigns reservations to NFC items', () => {
    expect(migration).toContain('v_item_remaining := greatest(v_item.quantity - v_item_covered, 0)')
    expect(migration).toContain('if p_quantity > v_item_remaining then')
    expect(migration).toContain('order_item_id = v_item.id')
    expect(migration).toContain('Automatic allocation')
    expect(migration).not.toMatch(/set order_id = p_order_id,\s*order_item_id = p_order_item_id/i)
  })

  it('keeps the reservation RPC protected by OWNER/ADMIN and OWNER AAL2', () => {
    expect(migration).toContain("v_role not in ('OWNER','ADMIN')")
    expect(migration).toContain("v_role = 'OWNER'")
    expect(migration).toContain("auth.jwt()->>'aal'")
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('from public, anon')
    expect(migration).toContain('to authenticated')
  })

  it('repairs only reserved orphan links without touching permanent identity', () => {
    expect(migration).toContain("a.status = 'reserved'")
    expect(migration).toContain('a.order_item_id is null')
    expect(migration).toContain('set order_item_id = v_target_item')
    expect(migration).not.toMatch(/public_id\s*=/i)
    expect(migration).not.toMatch(/update\s+public\.oxxen_connect_cards/i)
    expect(migration).not.toMatch(/delete\s+from/i)
    expect(migration).not.toMatch(/truncate\s+/i)
  })

  it('enforces the same capacity rule on direct NFC asset edits', () => {
    expect(triggerGuard).toContain('create or replace function public.oxxen_connect_prepare_nfc_asset()')
    expect(triggerGuard).toContain("new.status in ('reserved','programmed','assigned','delivered')")
    expect(triggerGuard).toContain('new.order_item_id is null')
    expect(triggerGuard).toContain("v_item_type is distinct from 'nfc_card'")
    expect(triggerGuard).toMatch(/where o\.id = new\.order_id\s+for update/i)
    expect(triggerGuard).toContain('if v_existing_covered >= v_requested then')
    expect(triggerGuard).toContain('if v_item_covered >= v_item_quantity then')
  })

  it('preserves UID normalization, lifecycle checks and timestamp behavior in the trigger', () => {
    expect(triggerGuard).toContain("new.uid !~ '^[0-9A-F]{8,32}$'")
    expect(triggerGuard).toContain("old.status = 'available' and new.status in ('reserved','defective','lost','retired')")
    expect(triggerGuard).toContain('new.reserved_at := coalesce(new.reserved_at, now())')
    expect(triggerGuard).toContain('new.programmed_at := coalesce(new.programmed_at, now())')
    expect(triggerGuard).toContain('new.delivered_at := coalesce(new.delivered_at, now())')
  })

  it('disables further reservation in the UI when requested capacity is covered', () => {
    expect(summary).toContain('calculateNfcCoverage')
    expect(summary).toContain('coverage.pending === 0')
    expect(summary).toContain('Reserva completa:')
    expect(summary).toContain('max={coverage.pending}')
    expect(summary).toContain('reserveQuantity > coverage.pending')
    expect(summary).toContain('p_order_item_id: null')
  })

  it('surfaces an existing overbooked state instead of permitting another reservation', () => {
    expect(summary).toContain('coverage.overbooked > 0')
    expect(summary).toContain('NFC por encima de lo solicitado')
  })
})
