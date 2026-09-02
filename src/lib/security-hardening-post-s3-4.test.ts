import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')
const migration = read('supabase/migrations/20260902_security_hardening_post_s3_4.sql')
const cardEditor = read('src/pages/CardEditor.tsx')
const cards = read('src/pages/Cards.tsx')
const auditLog = read('src/pages/AuditLog.tsx')
const dashboard = read('src/pages/Dashboard.tsx')

describe('post-S3.4 security hardening contracts', () => {
  it('removes destructive table privileges from authenticated without changing card identity', () => {
    expect(migration).toMatch(/revoke delete, truncate, references, trigger\s+on table public\.oxxen_connect_cards\s+from authenticated/i)
    expect(migration).toMatch(/revoke insert, update, delete, truncate, references, trigger\s+on table public\.oxxen_connect_card_aliases\s+from authenticated/i)
    expect(migration).toMatch(/revoke insert, update, delete, truncate, references, trigger\s+on table public\.oxxen_connect_analytics_events\s+from authenticated/i)
    expect(migration).not.toMatch(/update\s+public\.oxxen_connect_cards/i)
    expect(migration).not.toMatch(/delete\s+from\s+public\.oxxen_connect_/i)
    expect(migration).not.toMatch(/public_id\s*=/i)
  })

  it('keeps only the direct card operations used by the current admin UI', () => {
    expect(cardEditor).toContain("from('oxxen_connect_cards').insert")
    expect(cardEditor).toContain("from('oxxen_connect_cards').update")
    expect(cards).toContain("from('oxxen_connect_cards').update")
    expect(cardEditor).toContain("from('oxxen_connect_card_aliases').select")
    expect(cardEditor).not.toMatch(/from\('oxxen_connect_card_aliases'\)\.(insert|update|delete)/)
  })

  it('keeps audit and dashboard consumption read-only/RPC based', () => {
    expect(auditLog).toContain("from('oxxen_connect_audit_logs')")
    expect(auditLog).toContain('.select(')
    expect(auditLog).not.toMatch(/from\('oxxen_connect_audit_logs'\)\.(insert|update|delete)/)
    expect(dashboard).toContain("supabase.rpc('oxxen_connect_get_operational_dashboard')")
  })

  it('does not expose administrative RPCs to anon', () => {
    for (const fn of [
      'oxxen_connect_bulk_create_nfc_assets',
      'oxxen_connect_reserve_nfc_assets',
      'oxxen_connect_create_order_with_items',
      'oxxen_connect_get_operational_dashboard',
    ]) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,180}from public, anon`, 'i'))
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,180}to authenticated`, 'i'))
    }
  })

  it('preserves intentional anonymous access to constrained public profile RPCs', () => {
    for (const fn of ['get_public_card', 'get_public_card_status', 'record_public_event']) {
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,140}to anon, authenticated`, 'i'))
    }
  })

  it('removes sequence usage that is only needed inside privileged RPCs', () => {
    expect(migration).toContain('revoke usage on sequence public.oxxen_connect_orders_order_number_seq')
    expect(migration).toContain('revoke usage on sequence public.oxxen_connect_nfc_assets_asset_number_seq')
    expect(migration).not.toMatch(/revoke usage on sequence public\.oxxen_connect_customers_customer_number_seq/i)
  })
})
