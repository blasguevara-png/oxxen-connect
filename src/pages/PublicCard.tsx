import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Building2, Download, Globe2, Mail, MapPin, MessageCircle, Phone, Share2, UserPlus } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Loading } from '../components/Loading'
import { trackEvent } from '../lib/analytics'
import { cleanPhone, downloadText, makeVCard, normalizeUrl, whatsappUrl } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import type { CardRecord } from '../types'

const linkLabels: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn' }

export function PublicCard() {
  const { slug = '' } = useParams()
  const [card, setCard] = useState<CardRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const tracked = useRef(false)

  useEffect(() => {
    tracked.current = false
    const load = async () => {
      const { data } = await supabase.from('oxxen_connect_cards').select('*').eq('slug', slug).eq('active', true).maybeSingle()
      setCard((data || null) as CardRecord | null)
      setLoading(false)
    }
    void load()
  }, [slug])

  useEffect(() => {
    if (!card || tracked.current) return
    tracked.current = true
    trackEvent(card.id, 'view', { path: window.location.pathname })
  }, [card])

  const actionMap = useMemo(() => card ? buildActions(card) : new Map<string, { label: string; href: string; icon: ReactNode; external?: boolean }>(), [card])

  if (loading) return <div className="public-shell"><Loading/></div>
  if (!card) return <div className="public-shell"><div className="inactive-card"><Brand/><h1>Tarjeta temporalmente inactiva</h1><p>Este perfil no está disponible en este momento.</p></div></div>

  const accent = card.accent_color || '#20e3b2'
  const saveContact = () => { trackEvent(card.id, 'vcard'); downloadText(`${card.slug}.vcf`, makeVCard(card), 'text/vcard;charset=utf-8') }
  const share = async () => {
    if (navigator.share) await navigator.share({ title: card.full_name, text: card.company || '', url: window.location.href })
    else await navigator.clipboard.writeText(window.location.href)
  }

  return (
    <div className={`public-shell public-${card.theme}`} style={{ '--accent': accent } as CSSProperties}>
      <main className="public-profile">
        <div className="public-top"><div className="tiny-brand">OXXEN Connect</div><button className="circle-button" onClick={share} aria-label="Compartir"><Share2 size={18}/></button></div>
        {card.logo_url && <img className="public-logo" src={card.logo_url} alt={`Logo ${card.company || ''}`} />}
        <div className="public-avatar">{card.profile_image_url ? <img src={card.profile_image_url} alt={card.full_name}/> : <span>{card.full_name.slice(0,1)}</span>}</div>
        <h1>{card.full_name}</h1>
        <div className="public-subtitle">{card.job_title && <span>{card.job_title}</span>}{card.company && <span><Building2 size={15}/>{card.company}</span>}</div>
        {card.bio && <p className="public-bio">{card.bio}</p>}
        <button className="public-primary" onClick={saveContact}><UserPlus size={19}/>{card.cta_text || 'Guardar contacto'}<Download size={16}/></button>
        <div className="public-actions">
          {card.links_order.map(key => {
            const action = actionMap.get(key)
            if (!action) return null
            return <a key={key} href={action.href} target={action.external ? '_blank' : undefined} rel={action.external ? 'noreferrer' : undefined} onClick={()=>trackEvent(card.id, key)}>{action.icon}<span>{action.label}</span></a>
          })}
        </div>
        <footer><span>Powered by</span><Brand compact/></footer>
      </main>
    </div>
  )
}

function buildActions(card: CardRecord) {
  const map = new Map<string, { label: string; href: string; icon: ReactNode; external?: boolean }>()
  if (card.whatsapp) map.set('whatsapp', { label: 'WhatsApp', href: whatsappUrl(card.whatsapp), icon: <MessageCircle size={20}/>, external: true })
  if (card.phone) map.set('phone', { label: 'Llamar', href: `tel:${cleanPhone(card.phone)}`, icon: <Phone size={20}/> })
  if (card.email) map.set('email', { label: 'Email', href: `mailto:${card.email}`, icon: <Mail size={20}/> })
  if (card.website) map.set('website', { label: 'Sitio web', href: normalizeUrl(card.website), icon: <Globe2 size={20}/>, external: true })
  if (card.maps_url || card.address) map.set('maps', { label: 'Ubicación', href: card.maps_url ? normalizeUrl(card.maps_url) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address || '')}`, icon: <MapPin size={20}/>, external: true })
  for (const key of ['instagram','facebook','tiktok','linkedin']) {
    const value = card[key as keyof CardRecord]
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
