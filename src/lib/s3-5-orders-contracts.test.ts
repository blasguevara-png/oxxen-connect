import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

const migration = read('supabase/migrations/20260902_sprint3_5_orders_transactional_editing.sql')
const editor = read('src/pages/OrderEditor.tsx')
const pilot = read('docs/S3_5_REAL_OPERATION_PILOT.md')

describe('S3.5 transactional order-editing contracts', () => {
  it('routes creation and editing through transactional RPCs only', () => {
    expect(editor).toContain("supabase.rpc('oxxen_connect_create_order_with_items'")
    expect(editor).toContain("supabase.rpc('oxxen_connect_update_order_with_items'")
    expect(editor).not.toMatch(/from\('oxxen_connect_orders'\)\.(?:insert|update|delete)/)
    expect(editor).not.toMatch(/from\('oxxen_connect_order_items'\)\.(?:insert|update|delete)/)
  })

  it('protects the update RPC with role, AAL2 and a locked search path', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain("v_role not in ('OWNER', 'ADMIN', 'SALES')")
    expect(migration).toContain("v_role = 'OWNER'")
    expect(migration).toContain("auth.jwt()->>'aal'")
    expect(migration).toContain('from public, anon, authenticated')
    expect(migration).toContain('to authenticated')
    expect(migration).not.toMatch(/grant execute on function public\.oxxen_connect_update_order_with_items[\s\S]{0,180}to anon/i)
  })

  it('validates quantities, prices, discounts, statuses and payment statuses in PostgreSQL', () => {
    expect(migration).toContain('v_quantity <= 0')
    expect(migration).toContain('v_unit_price < 0')
    expect(migration).toContain('p_discount > v_subtotal')
    expect(migration).toContain("p_status not in ('draft','confirmed','in_production','ready','delivered','cancelled')")
    expect(migration).toContain("p_payment_status not in ('pending','partial','paid','refunded')")
  })

  it('rejects cross-customer cards and item IDs from another order', () => {
    expect(migration).toContain('v_card_customer is not null and v_card_customer <> p_customer_id')
    expect(migration).toContain('v_existing.order_id <> p_order_id')
    expect(migration).toContain('El item no pertenece a este pedido')
  })

  it('uses optimistic concurrency plus row locking', () => {
    expect(migration).toMatch(/where o\.id = p_order_id\s+for update/i)
    expect(migration).toContain('p_expected_updated_at')
    expect(migration).toContain("errcode = '40001'")
    expect(editor).toContain('p_expected_updated_at: order.updated_at')
  })

  it('removes direct browser mutation grants and write policies', () => {
    expect(migration).toContain('revoke insert (customer_id,status,payment_status,currency,discount,notes)')
    expect(migration).toContain('revoke update (customer_id,status,payment_status,currency,discount,notes)')
    expect(migration).toContain('revoke insert (order_id,item_type,description,quantity,unit_price,card_id)')
    expect(migration).toContain('revoke update (item_type,description,quantity,unit_price,card_id)')
    expect(migration).toContain('drop policy if exists oxxen_orders_commercial_insert')
    expect(migration).toContain('drop policy if exists oxxen_order_items_commercial_update')
  })

  it('never physically deletes order items and records required summary audit actions', () => {
    expect(migration).toContain('S3.5 no permite eliminar items')
    expect(migration).not.toMatch(/delete\s+from\s+public\.oxxen_connect_order_items/i)
    expect(migration).toContain("'order.updated'")
    expect(migration).toContain("'order.status_changed'")
    expect(migration).toContain("'order.payment_status_changed'")
    expect(migration).toContain("'order.items_updated'")
    expect(migration).toContain("'order.card_assignment_changed'")
  })

  it('keeps permanent public identity outside the mutation surface', () => {
    expect(migration).not.toMatch(/update\s+public\.oxxen_connect_cards/i)
    expect(migration).not.toMatch(/public_id\s*=/i)
    expect(migration).not.toMatch(/truncate\s+/i)
  })

  it('keeps the real pilot explicitly post-rollout and opt-in', () => {
    expect(pilot).toContain('NO ejecutar durante PRE-MERGE')
    expect(pilot).toContain('Autorizo piloto operativo S3.5')
    expect(pilot).toContain('1 Customer')
    expect(pilot).toContain('3 NFC')
  })
})
