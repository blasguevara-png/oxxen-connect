import { expect, test } from '@playwright/test'

const identifier = process.env.E2E_PUBLIC_IDENTIFIER || 'b'

test('canonical public profile loads on the OXXEN domain', async ({ page }) => {
  const response = await page.goto(`/p/${identifier}`)
  expect(response?.ok()).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`^https://connect\\.oxxengroup\\.com/p/${identifier}`))
  await expect(page.locator('main.public-profile')).toBeVisible()
})

test('legacy printed QR redirects permanently without losing query params', async ({ page }) => {
  const response = await page.goto(`https://oxxen-connect.vercel.app/p/${identifier}?e2e=legacy`)
  expect(response?.ok()).toBeTruthy()
  await expect(page).toHaveURL(new RegExp(`^https://connect\\.oxxengroup\\.com/p/${identifier}\\?e2e=legacy`))
})
