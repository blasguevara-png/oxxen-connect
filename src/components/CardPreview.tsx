import type { CSSProperties } from 'react'
import { Mail, MapPin, Phone, Globe2, MessageCircle, UserPlus } from 'lucide-react'
import type { CardDraft, CardRecord } from '../types'

export function CardPreview({ card }: { card: Partial<CardDraft | CardRecord> }) {
  const accent = card.accent_color || '#20e3b2'
  const dark = (card.theme || 'dark') === 'dark'

  return (
    <div className={`phone-preview ${dark ? 'theme-dark' : 'theme-light'}`} style={{ '--accent': accent } as CSSProperties}>
      <div className="phone-notch" />
      <div className="preview-card">
        {card.logo_url && <div className="preview-logo-wrap"><img className="preview-logo" src={card.logo_url} alt="Logo" /></div>}
        <div className="avatar-wrap">
          {card.profile_image_url ? <img src={card.profile_image_url} alt="Perfil" /> : <span>{(card.full_name || 'O').slice(0,1)}</span>}
        </div>
        <h3>{card.full_name || 'Nombre del cliente'}</h3>
        <p className="preview-role">{[card.job_title, card.company].filter(Boolean).join(' · ') || 'Cargo · Empresa'}</p>
        {card.bio && <p className="preview-bio">{card.bio}</p>}
        <button className="primary-preview"><UserPlus size={17}/>{card.cta_text || 'Guardar contacto'}</button>
        <div className="preview-actions">
          {card.whatsapp && <span><MessageCircle size={18}/> WhatsApp</span>}
          {card.phone && <span><Phone size={18}/> Llamar</span>}
          {card.email && <span><Mail size={18}/> Email</span>}
          {card.website && <span><Globe2 size={18}/> Web</span>}
          {card.address && <span><MapPin size={18}/> Ubicación</span>}
        </div>
        <small>OXXEN Connect</small>
      </div>
    </div>
  )
}
