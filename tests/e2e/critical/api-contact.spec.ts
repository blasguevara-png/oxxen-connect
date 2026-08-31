import { expect, test } from '@playwright/test'

const identifier = process.env.E2E_PUBLIC_IDENTIFIER || 'b'
const baseURL = process.env.E2E_BASE_URL || 'https://connect.oxxengroup.com'

test('contact endpoint returns a safe UTF-8 vCard for a valid public identifier', async ({ request }) => {
  const response = await request.get(`${baseURL}/api/contact?id=${encodeURIComponent(identifier)}`)

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(/^text\/vcard; charset=utf-8/i)
  expect(response.headers()['content-disposition']).toMatch(/^inline; filename="[a-z0-9-]+\.vcf"$/i)
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['cache-control']).toContain('no-store')

  const body = await response.text()
  expect(body).toContain('BEGIN:VCARD\r\n')
  expect(body).toContain('VERSION:3.0\r\n')
  expect(body).toContain('END:VCARD\r\n')
})

test('contact endpoint returns safe client errors for invalid identifiers', async ({ request }) => {
  const missing = await request.get(`${baseURL}/api/contact?id=__oxxen_e2e_missing__`)
  expect(missing.status()).toBe(404)
  expect(await missing.text()).toBe('Contacto no encontrado')

  const empty = await request.get(`${baseURL}/api/contact?id=`)
  expect(empty.status()).toBe(400)
  expect(await empty.text()).toBe('Identificador inválido')

  const tooLong = await request.get(`${baseURL}/api/contact?id=${'a'.repeat(121)}`)
  expect(tooLong.status()).toBe(400)
  expect(await tooLong.text()).toBe('Identificador inválido')
})

test('contact endpoint rejects unsupported methods', async ({ request }) => {
  const response = await request.post(`${baseURL}/api/contact?id=${encodeURIComponent(identifier)}`)

  expect(response.status()).toBe(405)
  expect(response.headers()['allow']).toBe('GET')
})

test('contact endpoint does not allow CRLF/header injection through the identifier', async ({ request }) => {
  const injected = encodeURIComponent('__missing__\r\nX-OXXEN-E2E: injected')
  const response = await request.get(`${baseURL}/api/contact?id=${injected}`)

  expect(response.status()).toBe(404)
  expect(response.headers()['x-oxxen-e2e']).toBeUndefined()
})
