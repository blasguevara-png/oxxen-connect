import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MfaGate, roleRequiresMfa } from './MfaGate'

const getAuthenticatorAssuranceLevel = vi.fn()
const listFactors = vi.fn()
const enroll = vi.fn()
const unenroll = vi.fn()
const challenge = vi.fn()
const verify = vi.fn()
const signOut = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel,
        listFactors,
        enroll,
        unenroll,
        challenge,
        verify,
      },
      signOut,
    },
  },
}))

describe('MFA policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires MFA for OWNER and leaves future roles configurable', () => {
    expect(roleRequiresMfa('OWNER')).toBe(true)
    expect(roleRequiresMfa('ADMIN')).toBe(false)
    expect(roleRequiresMfa('EDITOR')).toBe(false)
    expect(roleRequiresMfa(null)).toBe(false)
  })

  it('starts TOTP enrollment when OWNER has no verified factor', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
    listFactors.mockResolvedValue({ data: { totp: [], phone: [] }, error: null })
    enroll.mockResolvedValue({
      data: { id: 'factor-new', totp: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+', secret: 'TESTSECRET' } },
      error: null,
    })

    render(<MfaGate role="OWNER" onVerified={vi.fn()} />)

    await waitFor(() => expect(enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'OXXEN Connect OWNER' }))
    expect(screen.getByText(/Escanea este QR/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activar MFA y entrar/i })).toBeInTheDocument()
  })

  it('challenges a verified TOTP factor and reaches aal2', async () => {
    getAuthenticatorAssuranceLevel
      .mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      .mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified', friendly_name: 'Authenticator', factor_type: 'totp' }], phone: [] },
      error: null,
    })
    challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null })
    verify.mockResolvedValue({ data: {}, error: null })
    const onVerified = vi.fn()

    render(<MfaGate role="OWNER" onVerified={onVerified} />)

    await screen.findByRole('button', { name: /Verificar y entrar/i })
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar y entrar/i }))

    await waitFor(() => expect(verify).toHaveBeenCalledWith({ factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }))
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1))
  })
})
