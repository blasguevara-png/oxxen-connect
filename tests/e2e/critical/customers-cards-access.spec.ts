import { expect, test } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'https://connect.oxxengroup.com'

for (const path of [
  '/admin/clientes',
  '/admin/clientes/nuevo',
  '/admin/tarjetas',
  '/admin/tarjetas/nueva',
]) {
  test(`unauthenticated access to ${path} is redirected to login`, async ({ page }) => {
    await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/admin\/login$/)
    await expect(page.getByRole('heading', { name: 'Control central' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/CLI-\d+|ORD-\d+|NFC-\d+|public_id:/i)
  })
}
