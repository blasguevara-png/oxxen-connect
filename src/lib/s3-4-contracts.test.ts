import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8')

const migration = read('supabase/migrations/20260901_sprint3_4_operational_closure.sql')
const orderEditor = read('src/pages/OrderEditor.tsx')
const cardEditor = read('src/pages/CardEditor.tsx')
const app = read('src/App.tsx')

describe('S3.4 operational closure contracts', () => {
  it('creates orders through one transactional RPC instead of two client inserts', () => {
    expect(migration).toContain('oxxen_connect_create_order_with_items')
    expect(migration).toContain('security definer')
    expect(migration).toContain("v_role not in ('OWNER', 'ADMIN', 'SALES')")
    expect(migration).toContain("v_role = 'OWNER'")
    expect(orderEditor).toContain("supabase.rpc('oxxen_connect_create_order_with_items'")
    expect(orderEditor).not.toMatch(/from\('oxxen_connect_orders'\)\.insert/)
  })

  it('rejects invalid order items before a function call can commit successfully', () => {
    expect(migration).toContain("jsonb_typeof(p_items) <> 'array'")
    expect(migration).toContain('jsonb_array_length(p_items) = 0')
    expect(migration).toContain('v_quantity <= 0')
    expect(migration).toContain('v_unit_price < 0')
    expect(migration).toContain('raise exception')
  })

  it('protects customer/card/order consistency while preserving legacy NULL cards', () => {
    expect(migration).toContain('oxxen_connect_validate_order_item_card_customer')
    expect(migration).toContain('v_card_customer is not null and v_card_customer <> v_order_customer')
    expect(migration).toContain('new.customer_id is null')
    expect(cardEditor).toContain('Sin cliente (legacy / pendiente)')
  })

  it('keeps physical card identity out of the S3.4 mutation surface', () => {
    expect(migration).not.toMatch(/update\s+public\.oxxen_connect_cards[\s\S]{0,120}public_id\s*=/i)
    expect(migration).not.toMatch(/delete\s+from\s+public\.oxxen_connect_/i)
    expect(migration).not.toMatch(/truncate\s+/i)
    expect(cardEditor).toContain('publicCardUrl(publicId)')
  })

  it('separates real customers from digital card administration', () => {
    expect(app).toContain('path="clientes" element={<Customers/>}')
    expect(app).toContain('path="tarjetas" element={<Cards/>}')
    expect(app).toContain('path="tarjetas/:id" element={<CardEditor/>}')
  })

  it('does not grant the new privileged RPCs to anon', () => {
    expect(migration).toContain('from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.oxxen_connect_create_order_with_items')
    expect(migration).toContain('to authenticated')
    expect(migration).not.toMatch(/grant execute on function public\.oxxen_connect_create_order_with_items[\s\S]{0,150}to anon/i)
  })
})
