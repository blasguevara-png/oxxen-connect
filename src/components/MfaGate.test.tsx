import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roleRequiresMfa } from '../lib/mfa-policy'
import { MfaGate } from './MfaGate'

const mocks = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
        challenge: mocks.challenge,
        verify: mocks.verify,
      },
      signOut: mocks.signOut,
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
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
    mocks.listFactors.mockResolvedValue({ data: { totp: [], phone: [] }, error: null })
    mocks.enroll.mockResolvedValue({
      data: { id: 'factor-new', totp: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+', secret: 'fixture-value' } },
      error: null,
    })

    render(<MfaGate role="OWNER" onVerified={vi.fn()} />)

    await waitFor(() => expect(mocks.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'OXXEN Connect OWNER' }))
    expect(screen.getByText(/Escanea este QR/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Activar MFA y entrar/i })).toBeInTheDocument()
  })

  it('cleans an abandoned factor before creating a fresh enrollment', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'stale-factor', status: 'unverified', friendly_name: 'OXXEN Connect OWNER', factor_type: 'totp' }], phone: [] },
      error: null,
    })
    mocks.unenroll.mockResolvedValue({ data: {}, error: null })
    mocks.enroll.mockResolvedValue({
      data: { id: 'factor-new', totp: { qr_code: 'data:image/svg+xml;base64,PHN2Zy8+', secret: 'fixture-value' } },
      error: null,
    })

    render(<MfaGate role="OWNER" onVerified={vi.fn()} />)

    await waitFor(() => expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: 'stale-factor' }))
    await waitFor(() => expect(mocks.enroll).toHaveBeenCalled())
  })

  it('challenges a verified TOTP factor and reaches aal2', async () => {
    mocks.getAuthenticatorAssuranceLevel
      .mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
      .mockResolvedValueOnce({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified', friendly_name: 'Authenticator', factor_type: 'totp' }], phone: [] },
      error: null,
    })
    mocks.challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null })
    mocks.verify.mockResolvedValue({ data: {}, error: null })
    const onVerified = vi.fn()

    render(<MfaGate role="OWNER" onVerified={onVerified} />)

    await screen.findByRole('button', { name: /Verificar y entrar/i })
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar y entrar/i }))

    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith({ factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' }))
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1))
  })

  it('rejects an invalid TOTP challenge without opening the admin panel', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified', friendly_name: 'Authenticator', factor_type: 'totp' }], phone: [] },
      error: null,
    })
    mocks.challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null })
    mocks.verify.mockResolvedValue({ data: null, error: new Error('invalid code') })
    const onVerified = vi.fn()

    render(<MfaGate role="OWNER" onVerified={onVerified} />)

    await screen.findByRole('button', { name: /Verificar y entrar/i })
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar y entrar/i }))

    expect(await screen.findByText(/El código no pudo verificarse/i)).toBeInTheDocument()
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('rejects malformed codes before creating an MFA challenge', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null })
    mocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-1', status: 'verified', friendly_name: 'Authenticator', factor_type: 'totp' }], phone: [] },
      error: null,
    })

    render(<MfaGate role="OWNER" onVerified={vi.fn()} />)

    await screen.findByRole('button', { name: /Verificar y entrar/i })
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar y entrar/i }))

    expect(await screen.findByText(/Ingresa el código numérico/i)).toBeInTheDocument()
    expect(mocks.challenge).not.toHaveBeenCalled()
  })
})
