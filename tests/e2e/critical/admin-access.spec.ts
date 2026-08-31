import { expect, test } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'https://connect.oxxengroup.com'

test('unauthenticated admin access is redirected to the private login', async ({ page }) => {
  await page.goto(`${baseURL}/admin`, { waitUntil: 'networkidle' })

  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByRole('heading', { name: 'Control central' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Contraseña')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible()
})

test('login form does not expose administrative data before authentication', async ({ page }) => {
  await page.goto(`${baseURL}/admin/login`, { waitUntil: 'networkidle' })

  await expect(page.getByRole('heading', { name: 'Control central' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/Clientes|Audit log|Nueva tarjeta|URL permanente protegida/i)
})
