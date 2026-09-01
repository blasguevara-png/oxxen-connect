import { expect, test } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL || ''
const isProductionPreMerge = baseUrl.includes('connect.oxxengroup.com')

test.describe('S3.3 protected NFC inventory routes', () => {
  test.skip(isProductionPreMerge, 'S3.3 routes are not deployed to production before merge; run these checks against preview/staging.')

  test('NFC inventory redirects unauthenticated users to admin login', async ({ page }) => {
    await page.goto('/admin/inventario-nfc')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('NFC asset detail redirects unauthenticated users to admin login', async ({ page }) => {
    await page.goto('/admin/inventario-nfc/00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
