import { expect, test } from '@playwright/test'

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
