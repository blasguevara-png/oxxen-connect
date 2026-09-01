import { expect, test } from '@playwright/test'

const baseUrl = process.env.E2E_BASE_URL || ''
const isProductionPreMerge = baseUrl.includes('connect.oxxengroup.com')

test.describe('S3.2 protected order routes', () => {
  test.skip(isProductionPreMerge, 'S3.2 routes are not deployed to production before merge; run these checks against preview/staging.')

  test('orders list redirects unauthenticated users to admin login', async ({ page }) => {
    await page.goto('/admin/pedidos')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('new order route redirects unauthenticated users to admin login', async ({ page }) => {
    await page.goto('/admin/pedidos/nuevo')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('order detail route redirects unauthenticated users to admin login', async ({ page }) => {
    await page.goto('/admin/pedidos/00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL(/\/admin\/login/)
  })
})
