import { expect, test } from '@playwright/test'

const identifier = process.env.E2E_PUBLIC_IDENTIFIER || 'b'
const canonicalBase = process.env.E2E_BASE_URL || 'https://connect.oxxengroup.com'
const legacyBase = 'https://oxxen-connect.vercel.app'

function collectCriticalConsoleErrors(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  return errors
}

test('canonical public profile loads on desktop without critical console errors', async ({ page }) => {
  const errors = collectCriticalConsoleErrors(page)
  const response = await page.goto(`${canonicalBase}/p/${identifier}`, { waitUntil: 'networkidle' })

  expect(response?.ok()).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`^https://connect\\.oxxengroup\\.com/p/${identifier}`))
  await expect(page.locator('main.public-profile')).toBeVisible()
  await expect(page.locator('main.public-profile h1')).not.toHaveText('')
  await expect(page.getByRole('button', { name: /guardar contacto/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /compartir/i })).toBeVisible()
  expect(errors).toEqual([])
})

test('canonical public profile remains usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = collectCriticalConsoleErrors(page)
  const response = await page.goto(`${canonicalBase}/p/${identifier}`, { waitUntil: 'networkidle' })

  expect(response?.ok()).toBeTruthy()
  await expect(page.locator('main.public-profile')).toBeVisible()
  await expect(page.locator('.public-primary')).toBeVisible()
  await expect(page.locator('.public-actions')).toBeVisible()
  expect(errors).toEqual([])
})

test('legacy printed QR returns a permanent redirect preserving query params', async ({ request }) => {
  const response = await request.get(`${legacyBase}/p/${identifier}?source=legacy&utm_source=test`, {
    maxRedirects: 0,
  })

  expect(response.status()).toBe(308)
  const location = response.headers()['location'] || ''
  const redirected = new URL(location)
  expect(`${redirected.origin}${redirected.pathname}`).toBe(`${canonicalBase}/p/${identifier}`)
  expect(redirected.searchParams.get('source')).toBe('legacy')
  expect(redirected.searchParams.get('utm_source')).toBe('test')
})

test('legacy redirect is not applied to admin, api, or asset paths', async ({ request }) => {
  for (const path of ['/admin', `/api/contact?id=${identifier}`, '/assets/nonexistent-e2e.css']) {
    const response = await request.get(`${legacyBase}${path}`, { maxRedirects: 0 })
    const location = response.headers()['location'] || ''
    expect(location.startsWith(`${canonicalBase}/p/`)).toBe(false)
  }
})

test('missing public identifier shows a safe not-found state', async ({ page }) => {
  await page.goto(`${canonicalBase}/p/__oxxen_e2e_missing__`, { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: 'Perfil no encontrado' })).toBeVisible()
  await expect(page.getByText(/Verifica que el enlace o QR sea correcto/i)).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/select |postgres|supabase.*error|jwt|token/i)
})
