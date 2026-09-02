import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderEditor } from './OrderEditor'

const customer = {
  id: '11111111-1111-4111-8111-111111111111', customer_number: 1, customer_code: 'CLI-000001', business_name: 'Cliente S3.5', contact_name: 'Contacto', email: null, phone: null, whatsapp: null, document_type: null, document_number: null, address: null, notes: null, status: 'active', created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
}
const card = {
  id: '22222222-2222-4222-8222-222222222222', public_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'probe-card', full_name: 'Tarjeta S3.5', company: null, job_title: null, bio: null, whatsapp: null, phone: null, email: null, website: null, instagram: null, facebook: null, tiktok: null, linkedin: null, address: null, maps_url: null, cta_text: 'Guardar contacto', accent_color: '#20e3b2', theme: 'dark', profile_image_url: null, logo_url: null, active: true, customer_id: customer.id, deleted_at: null, links_order: [], created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
}

let orderState: Record<string, unknown>
let itemState: Record<string, unknown>[]
const rpc = vi.fn()

function queryResult(table: string, filters: Record<string, unknown>, single = false) {
  if (table === 'oxxen_connect_customers') return { data: [customer], error: null }
  if (table === 'oxxen_connect_cards') return { data: [card], error: null }
  if (table === 'oxxen_connect_orders') return { data: single ? { ...orderState, customer } : [orderState], error: null }
  if (table === 'oxxen_connect_nfc_assets') return { data: [], error: null }
  if (table === 'oxxen_connect_order_items') {
    let rows = itemState.map(row => ({ ...row }))
    for (const [key, value] of Object.entries(filters)) rows = rows.filter(row => row[key] === value)
    return { data: rows, error: null }
  }
  return { data: [], error: null }
}

function from(table: string) {
  const filters: Record<string, unknown> = {}
  let singleMode = false
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.neq = chain
  builder.is = chain
  builder.order = chain
  builder.eq = (key: string, value: unknown) => { filters[key] = value; return builder }
  builder.single = async () => { singleMode = true; return queryResult(table, filters, singleMode) }
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(queryResult(table, filters, singleMode)).then(resolve, reject)
  return builder
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => from(table),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}))

afterEach(() => cleanup())

describe('OrderEditor S3.5 transactional editing', () => {
  beforeEach(() => {
    orderState = {
      id: '33333333-3333-4333-8333-333333333333', order_number: 1, order_code: 'ORD-000001', customer_id: customer.id, status: 'draft', payment_status: 'pending', currency: 'PEN', subtotal: 10, discount: 0, total: 10, quantity: 1, notes: 'antes', created_by: null, confirmed_at: null, production_started_at: null, ready_at: null, delivered_at: null, cancelled_at: null, created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z',
    }
    itemState = [{ id: '44444444-4444-4444-8444-444444444444', order_id: orderState.id, item_type: 'nfc_card', description: 'Tarjeta NFC', quantity: 1, unit_price: 10, subtotal: 10, card_id: null, created_at: '2026-09-02T00:00:00Z', updated_at: '2026-09-02T00:00:00Z' }]
    rpc.mockReset()
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name !== 'oxxen_connect_update_order_with_items') return { data: null, error: null }
      const nextItems = args.p_items as Record<string, unknown>[]
      itemState = nextItems.map((next, index) => ({
        ...itemState[index],
        ...next,
        id: next.id || itemState[index]?.id || `new-${index}`,
        order_id: orderState.id,
        subtotal: Number(next.quantity) * Number(next.unit_price),
      }))
      orderState = {
        ...orderState,
        customer_id: args.p_customer_id,
        discount: args.p_discount,
        notes: args.p_notes,
        payment_status: args.p_payment_status,
        status: args.p_status,
        subtotal: itemState.reduce((sum, row) => sum + Number(row.subtotal), 0),
        total: itemState.reduce((sum, row) => sum + Number(row.subtotal), 0) - Number(args.p_discount || 0),
        updated_at: '2026-09-02T00:01:00Z',
      }
      return { data: { order_id: orderState.id, updated_at: orderState.updated_at }, error: null }
    })
  })

  it('edits notes, quantity, price and Card through one RPC then reloads persisted state', async () => {
    render(
      <MemoryRouter initialEntries={[`/admin/pedidos/${orderState.id}`]}>
        <Routes><Route path="/admin/pedidos/:id" element={<OrderEditor/>}/></Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'ORD-000001' })

    fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'persistido' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Tarjeta digital'), { target: { value: card.id } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    expect(rpc).toHaveBeenCalledWith('oxxen_connect_update_order_with_items', expect.objectContaining({
      p_order_id: orderState.id,
      p_customer_id: customer.id,
      p_expected_updated_at: '2026-09-02T00:00:00Z',
      p_items: [expect.objectContaining({ quantity: 2, unit_price: 15, card_id: card.id })],
    }))

    await waitFor(() => expect(screen.getByLabelText('Notas')).toHaveValue('persistido'))
    expect(screen.getByLabelText('Cantidad')).toHaveValue(2)
    expect(screen.getByLabelText('Precio')).toHaveValue(15)
    expect(screen.getByLabelText('Tarjeta digital')).toHaveValue(card.id)
  })

  it('shows an actionable conflict instead of silently overwriting stale work', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'stale' } })
    render(
      <MemoryRouter initialEntries={[`/admin/pedidos/${orderState.id}`]}>
        <Routes><Route path="/admin/pedidos/:id" element={<OrderEditor/>}/></Routes>
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'ORD-000001' })
    fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'cambio viejo' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }))
    const messages = await screen.findAllByText(/cambió en otra sesión/i)
    expect(messages.length).toBeGreaterThan(0)
  })
})
