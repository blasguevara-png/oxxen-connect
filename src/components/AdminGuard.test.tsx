import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminGuard } from './AdminGuard'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      },
    },
    from: mocks.from,
  },
}))

vi.mock('./MfaGate', () => ({
  MfaGate: ({ role }: { role: string }) => <div data-testid="mfa-gate">MFA required for {role}</div>,
}))

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin/login" element={<div>LOGIN PAGE</div>} />
        <Route element={<AdminGuard />}>
          <Route path="/admin" element={<div>ADMIN CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mocks.unsubscribe } },
    })
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }))
  })

  it('redirects an unauthenticated visitor to the admin login', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderGuard()

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
  })

  it('rejects an authenticated user who is not present in oxxen_connect_admins', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    renderGuard()

    expect(await screen.findByText('Acceso no autorizado')).toBeInTheDocument()
  })

  it('blocks an OWNER at aal1 behind the MFA gate', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-1' } } },
      error: null,
    })
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: 'owner-1', role: 'OWNER' }, error: null })
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })

    renderGuard()

    expect(await screen.findByTestId('mfa-gate')).toHaveTextContent('OWNER')
    expect(screen.queryByText('ADMIN CONTENT')).not.toBeInTheDocument()
  })

  it('allows an OWNER only after the session reaches aal2', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-1' } } },
      error: null,
    })
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: 'owner-1', role: 'OWNER' }, error: null })
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    })

    renderGuard()

    expect(await screen.findByText('ADMIN CONTENT')).toBeInTheDocument()
    expect(screen.queryByTestId('mfa-gate')).not.toBeInTheDocument()
  })

  it('does not grant access when Supabase cannot verify the current session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: new Error('network') })

    renderGuard()

    expect(await screen.findByText('No pudimos verificar el acceso')).toBeInTheDocument()
  })
})
