import { afterEach, describe, expect, it, vi } from 'vitest'
import { storagePathFromPublicUrl } from './images'

afterEach(() => vi.unstubAllEnvs())

describe('storagePathFromPublicUrl', () => {
  it('returns only paths belonging to the official OXXEN Connect Supabase project', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://qslmppzkpltfuvsqmxqq.supabase.co')
    expect(storagePathFromPublicUrl('https://qslmppzkpltfuvsqmxqq.supabase.co/storage/v1/object/public/oxxen-connect-media/card/profile.webp'))
      .toBe('card/profile.webp')
  })

  it('does not delete legacy/external storage objects', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://qslmppzkpltfuvsqmxqq.supabase.co')
    expect(storagePathFromPublicUrl('https://jsjljnqixdutmzhhznhj.supabase.co/storage/v1/object/public/oxxen-connect-media/card/profile.jpg'))
      .toBeNull()
  })
})
