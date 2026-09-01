import { expect, test } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'https://connect.oxxengroup.com'

// Critical CI intentionally targets current production and must not assume S3.4-only
// routes exist before rollout. New /admin/tarjetas route contracts are covered by
// Vitest source/route tests until an isolated authenticated staging environment exists.
for (const path of [
  '/admin/clientes',
  '/admin/clientes/nuevo',
  '/admin/pedidos',
  '/admin/inventario-nfc',
]) {
  test(`unauthenticated access to ${path} is redirected to login`, async ({ page }) => {
    await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/admin\/login$/)
    await expect(page.getByRole('heading', { name: 'Control central' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/CLI-\d+|ORD-\d+|NFC-\d+|public_id:/i)
  })
}
