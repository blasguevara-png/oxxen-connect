import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Building2, Globe2, Mail, MapPin, MessageCircle, Phone, Share2, UserPlus } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Loading } from '../components/Loading'
import { trackEvent } from '../lib/analytics'
import { cleanPhone, normalizeUrl, publicBaseUrl, publicCardUrl, whatsappUrl } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import type { PublicCardRecord } from '../types'

const linkLabels: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' }
type Availability = 'loading' | 'ready' | 'missing' | 'inactive' | 'archived' | 'error'

export function PublicCard() {
  // The route parameter may be either a permanent public_id or a historical slug.
  const { slug: identifier = '' } = useParams()
  const [card, setCard] = useState<PublicCardRecord | null>(null)
  const [availability, setAvailability] = useState<Availability>('loading')
  const tracked = useRef(false)

  const load = useCallback(async () => {
    setAvailability('loading')
    setCard(null)
    tracked.current = false

    const { data, error } = await supabase.rpc('get_public_card', { p_identifier: identifier })
    if (error) {
      setAvailability('error')
      return
    }

    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      setCard(row as PublicCardRecord)
      setAvailability('ready')
      return
    }

    const { data: status, error: statusError } = await supabase.rpc('get_public_card_status', { p_identifier: identifier })
    if (statusError) {
      setAvailability('error')
      return
    }

    if (status === 'archived' || status === 'inactive' || status === 'missing') setAvailability(status)
    else setAvailability('missing')
  }, [identifier])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!card || tracked.current) return
    tracked.current = true
    trackEvent(card.public_id, 'view', { path: window.location.pathname })
  }, [card])

  useEffect(() => {
    if (!card) return
    const canonicalUrl = publicCardUrl(card.public_id)
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const created = !canonical
    const previousHref = canonical?.getAttribute('href') || ''

    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = canonicalUrl

    return () => {
      if (!canonical) return
      if (created) canonical.remove()
      else canonical.setAttribute('href', previousHref)
    }
  }, [card])

  const actionMap = useMemo(
    () => card ? buildActions(card) : new Map<string, { label: string; href: string; icon: ReactNode; external?: boolean }>(),
    [card],
  )

  if (availability === 'loading') return <div className="public-shell"><Loading/></div>

  if (availability === 'error') {
    return <div className="public-shell"><div className="inactive-card"><Brand/><h1>No pudimos cargar este perfil</h1><p>Puede ser un problema temporal de conexión. Tus datos no se han eliminado.</p><button className="primary-button" onClick={()=>void load()}>Reintentar</button></div></div>
  }

  if (!card) {
    const archived = availability === 'archived'
    const inactive = availability === 'inactive'
    return <div className="public-shell"><div className="inactive-card"><Brand/><h1>{archived ? 'Perfil archivado' : inactive ? 'Tarjeta temporalmente inactiva' : 'Perfil no encontrado'}</h1><p>{archived ? 'Este perfil ya no se encuentra publicado.' : inactive ? 'Este perfil no está disponible en este momento.' : 'Verifica que el enlace o QR sea correcto.'}</p></div></div>
  }

  const accent = card.accent_color || '#20e3b2'
  const saveContact = () => {
    trackEvent(card.public_id, 'vcard')
    openContactEditor(card)
  }
  const share = async () => {
    trackEvent(card.public_id, 'share')
    const shareUrl = publicCardUrl(card.public_id)
    try {
      if (navigator.share) await navigator.share({ title: card.full_name, text: card.company || '', url: shareUrl })
      else await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Native share sheets may be cancelled by the user; that is not an app error.
    }
  }

  return (
    <div className={`public-shell public-${card.theme}`} style={{ '--accent': accent } as CSSProperties}>
      <main className="public-profile">
        <div className="public-top"><div className="tiny-brand">OXXEN Connect</div><button className="circle-button" onClick={share} aria-label="Compartir"><Share2 size={18}/></button></div>
        {card.logo_url && <div className="public-logo-wrap"><img className="public-logo" src={card.logo_url} alt={`Logo ${card.company || ''}`} decoding="async" /></div>}
        <div className="public-avatar">{card.profile_image_url ? <img src={card.profile_image_url} alt={card.full_name} decoding="async"/> : <span>{card.full_name.slice(0,1)}</span>}</div>
        <h1>{card.full_name}</h1>
        <div className="public-subtitle">{card.job_title && <span>{card.job_title}</span>}{card.company && <span><Building2 size={15}/>{card.company}</span>}</div>
        {card.bio && <p className="public-bio">{card.bio}</p>}
        <button className="public-primary" onClick={saveContact}><UserPlus size={19} style={{ marginLeft: 0 }}/>{card.cta_text || 'Guardar contacto'}</button>
        <div className="public-actions">
          {card.links_order.map(key => {
            const action = actionMap.get(key)
            if (!action) return null
            return <a key={key} href={action.href} target={action.external ? '_blank' : undefined} rel={action.external ? 'noreferrer' : undefined} onClick={()=>trackEvent(card.public_id, key)}>{action.icon}<span>{action.label}</span></a>
          })}
        </div>
        <footer><span>Powered by</span><Brand compact/></footer>
      </main>
    </div>
  )
}

function openContactEditor(card: PublicCardRecord) {
  const isAndroid = /Android/i.test(navigator.userAgent)
  const fallback = `${publicBaseUrl()}/api/contact?id=${encodeURIComponent(card.public_id)}`

  if (isAndroid) {
    const phone = cleanPhone(card.phone || card.whatsapp)
    const isSamsung = /\bSM-[A-Z0-9]+/i.test(navigator.userAgent) || /SamsungBrowser/i.test(navigator.userAgent)

    const extras = [
      `S.name=${encodeURIComponent(card.full_name)}`,
      phone ? `S.phone=${encodeURIComponent(phone)}` : '',
      card.email ? `S.email=${encodeURIComponent(card.email.trim())}` : '',
      card.company ? `S.company=${encodeURIComponent(card.company)}` : '',
      card.job_title ? `S.job_title=${encodeURIComponent(card.job_title)}` : '',
      card.address ? `S.postal=${encodeURIComponent(card.address)}` : '',
      isSamsung ? 'package=com.samsung.android.app.contacts' : '',
      `S.browser_fallback_url=${encodeURIComponent(fallback)}`,
    ].filter(Boolean).join(';')

    window.location.href = `intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;${extras};end`
    return
  }

  // iPhone/iPad and desktop use vCard, which the OS/browser may import or download.
  window.location.href = fallback
}

function buildActions(card: PublicCardRecord) {
  const map = new Map<string, { label: string; href: string; icon: ReactNode; external?: boolean }>()
  if (card.whatsapp) map.set('whatsapp', { label: 'WhatsApp', href: whatsappUrl(card.whatsapp), icon: <MessageCircle size={20}/>, external: true })
  if (card.phone) map.set('phone', { label: 'Llamar', href: `tel:${cleanPhone(card.phone)}`, icon: <Phone size={20}/> })
  if (card.email) map.set('email', { label: 'Email', href: `mailto:${card.email}`, icon: <Mail size={20}/> })
  if (card.website) map.set('website', { label: 'Sitio web', href: normalizeUrl(card.website), icon: <Globe2 size={20}/>, external: true })
  if (card.maps_url || card.address) map.set('maps', { label: 'Ubicación', href: card.maps_url ? normalizeUrl(card.maps_url) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address || '')}`, icon: <MapPin size={20}/>, external: true })
  for (const key of ['instagram','facebook','tiktok','linkedin']) {
    const value = card[key as keyof PublicCardRecord]
    if (typeof value === 'string' && value) map.set(key, { label: linkLabels[key], href: normalizeSocial(key, value), icon: <span className="social-letter">{linkLabels[key][0]}</span>, external: true })
  }
  return map
}

function normalizeSocial(key: string, value: string) {
  if (/^https?:\/\//i.test(value)) return value
  const handle = value.replace(/^@/, '').trim()
  const bases: Record<string, string> = {
    instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', tiktok: 'https://tiktok.com/@', linkedin: 'https://linkedin.com/in/'
  }
  return `${bases[key]}${handle}`
}
