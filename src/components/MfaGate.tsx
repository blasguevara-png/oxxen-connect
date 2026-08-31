import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Brand } from './Brand'

type Mode = 'loading' | 'enroll' | 'challenge'

type Props = {
  role: string
  onVerified: () => void
}

export function MfaGate({ role, onVerified }: Props) {
  const [mode, setMode] = useState<Mode>('loading')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const preparingRef = useRef(false)

  const prepare = useCallback(async () => {
    if (preparingRef.current) return
    preparingRef.current = true
    setError('')
    setMode('loading')

    try {
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error) throw assurance.error
      if (assurance.data.currentLevel === 'aal2') {
        onVerified()
        return
      }

      const factors = await supabase.auth.mfa.listFactors()
      if (factors.error) throw factors.error

      const verifiedTotp = factors.data.totp.find(factor => factor.status === 'verified')
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id)
        setMode('challenge')
        return
      }

      // Best-effort cleanup when the SDK exposes abandoned/unverified factors.
      for (const factor of factors.data.totp.filter(item => item.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }

      let enrollment = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `OXXEN Connect ${role}`,
      })

      // If a previous enrollment was abandoned and Supabase keeps the friendly name reserved,
      // retry once with a unique friendly name instead of leaving the OWNER locked out.
      if (enrollment.error && (enrollment.error as { code?: string }).code === 'mfa_factor_name_conflict') {
        enrollment = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `OXXEN Connect ${role} ${Date.now().toString(36)}`,
        })
      }

      if (enrollment.error) throw enrollment.error

      setFactorId(enrollment.data.id)
      setQrCode(enrollment.data.totp.qr_code)
      setSecret(enrollment.data.totp.secret)
      setMode('enroll')
    } finally {
      preparingRef.current = false
    }
  }, [onVerified, role])

  useEffect(() => {
    void prepare().catch(() => {
      setError('No pudimos preparar la verificación en dos pasos. Cierra sesión e inténtalo nuevamente.')
      setMode('challenge')
    })
  }, [prepare])

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    if (!/^\d{6,10}$/.test(code)) {
      setError('Ingresa el código numérico de tu aplicación autenticadora.')
      return
    }

    setWorking(true)
    setError('')
    try {
      if (!factorId) throw new Error('factor_missing')

      const challenge = await supabase.auth.mfa.challenge({ factorId })
      if (challenge.error) throw challenge.error

      const verification = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      })
      if (verification.error) throw verification.error

      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error || assurance.data.currentLevel !== 'aal2') {
        throw new Error('aal2_not_reached')
      }

      onVerified()
    } catch {
      setError('El código no pudo verificarse. Espera al siguiente código de tu autenticador e inténtalo otra vez.')
    } finally {
      setWorking(false)
    }
  }

  const logout = async () => {
    // If the user explicitly abandons a fresh enrollment, clean that factor before logging out.
    if (mode === 'enroll' && factorId) {
      await supabase.auth.mfa.unenroll({ factorId })
    }
    await supabase.auth.signOut({ scope: 'local' })
    window.location.assign('/admin/login')
  }

  return (
    <div className="login-page mfa-page">
      <form className="login-card mfa-card" onSubmit={verify}>
        <Brand />
        <div className="login-heading">
          <span className="eyebrow">SEGURIDAD ADMINISTRATIVA</span>
          <h1>Verificación en dos pasos</h1>
          <p>El rol {role} requiere un segundo factor TOTP antes de abrir el panel.</p>
        </div>

        {mode === 'loading' && <div className="mfa-loading">Preparando seguridad...</div>}

        {mode === 'enroll' && (
          <div className="mfa-enroll">
            <div className="mfa-icon"><ShieldCheck size={26} /></div>
            <p>Escanea este QR con Google Authenticator, Microsoft Authenticator, Authy o 1Password.</p>
            {qrCode && <img className="mfa-qr" src={qrCode} alt="QR para configurar TOTP" />}
            {secret && (
              <details className="mfa-secret">
                <summary>No puedo escanear el QR</summary>
                <p>Introduce manualmente esta clave en tu autenticador:</p>
                <code>{secret}</code>
              </details>
            )}
          </div>
        )}

        {mode !== 'loading' && (
          <label>
            Código del autenticador
            <div className="input-icon">
              <KeyRound size={17} />
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="000000"
                required
              />
            </div>
          </label>
        )}

        {error && <div className="error-box">{error}</div>}

        {mode !== 'loading' && (
          <button className="primary-button full" disabled={working}>
            <ShieldCheck size={17} /> {working ? 'Verificando...' : mode === 'enroll' ? 'Activar MFA y entrar' : 'Verificar y entrar'}
          </button>
        )}

        <button type="button" className="ghost-button full" onClick={logout}>
          <LogOut size={16} /> Cerrar sesión
        </button>
      </form>
    </div>
  )
}
