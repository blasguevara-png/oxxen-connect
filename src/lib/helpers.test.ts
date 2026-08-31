import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanPhone, normalizeUrl, publicCardUrl, slugify } from './helpers'

afterEach(() => vi.unstubAllEnvs())

describe('public URL invariants', () => {
  it('uses the canonical OXXEN Connect domain', () => {
    vi.stubEnv('VITE_PUBLIC_BASE_URL', 'https://connect.oxxengroup.com/')
    expect(publicCardUrl('abc123')).toBe('https://connect.oxxengroup.com/p/abc123')
  })

  it('encodes identifiers instead of concatenating unsafe path content', () => {
    vi.stubEnv('VITE_PUBLIC_BASE_URL', 'https://connect.oxxengroup.com')
    expect(publicCardUrl('abc/123')).toBe('https://connect.oxxengroup.com/p/abc%2F123')
  })
})

describe('input helpers', () => {
  it('creates stable lowercase aliases', () => {
    expect(slugify(' José  Pérez SAC ')).toBe('jose-perez-sac')
  })

  it('normalizes web URLs', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
    expect(normalizeUrl('https://example.com')).toBe('https://example.com')
  })

  it('removes non-phone characters', () => {
    expect(cleanPhone('+51 999-123-456')).toBe('+51999123456')
  })
})
