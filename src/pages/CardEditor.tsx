import { ChangeEvent, FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Copy, Download, ExternalLink, ImagePlus, QrCode, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CardPreview } from '../components/CardPreview'
import { Loading } from '../components/Loading'
import { copyText, downloadText, LINK_ORDER, publicCardUrl, slugify } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import type { CardDraft, CardRecord, ThemeMode } from '../types'

const emptyDraft: CardDraft = {
  slug: '', full_name: '', company: '', job_title: '', bio: '', whatsapp: '', phone: '', email: '', website: '',
  instagram: '', facebook: '', tiktok: '', linkedin: '', address: '', maps_url: '', cta_text: 'Guardar contacto',
  accent_color: '#20e3b2', theme: 'dark', profile_image_url: '', logo_url: '', active: true, links_order: [...LINK_ORDER],
}

export function CardEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [draft, setDraft] = useState<CardDraft>(emptyDraft)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [profilePreview, setProfilePreview] = useState('')
  const [logoPreview, setLogoPreview] = useState('')
  const [qrData, setQrData] = useState('')
  const [qrSvg, setQrSvg] = useState('')

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data, error: loadError } = await supabase.from('oxxen_connect_cards').select('*').eq('id', id).single()
      if (loadError) setError(loadError.message)
      else {
        const card = data as CardRecord
        const { id: _id, created_at: _created, updated_at: _updated, ...rest } = card
        setDraft({ ...emptyDraft, ...rest, links_order: Array.isArray(rest.links_order) ? rest.links_order : [...LINK_ORDER] })
      }
      setLoading(false)
    }
    void load()
  }, [id])

  useEffect(() => {
    if (!draft.slug) {
      setQrData('')
      setQrSvg('')
      return
    }
    const url = publicCardUrl(draft.slug)
    void QRCode.toDataURL(url, { width: 640, margin: 2 }).then(setQrData)
    void QRCode.toString(url, { type: 'svg', margin: 2 }).then(setQrSvg)
  }, [draft.slug])

  useEffect(() => {
    if (window.location.hash === '#qr') setTimeout(()=>document.getElementById('qr')?.scrollIntoView({ behavior: 'smooth' }), 250)
  }, [loading])

  const previewDraft = useMemo(() => ({ ...draft, profile_image_url: profilePreview || draft.profile_image_url, logo_url: logoPreview || draft.logo_url }), [draft, profilePreview, logoPreview])

  const setField = (key: keyof CardDraft, value: string | boolean | ThemeMode) => setDraft(prev => ({ ...prev, [key]: value }))
  const nameChange = (value: string) => setDraft(prev => ({ ...prev, full_name: value, slug: prev.slug || slugify(value) }))

  const chooseFile = (kind: 'profile' | 'logo', e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return alert('La imagen debe pesar menos de 5 MB.')
    const url = URL.createObjectURL(file)
    if (kind === 'profile') { setProfileFile(file); setProfilePreview(url) }
    else { setLogoFile(file); setLogoPreview(url) }
  }

  async function upload(cardId: string, file: File, kind: 'profile' | 'logo') {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${cardId}/${kind}-${Date.now()}.${ext}`
    const { error: uploadError } = await supabase.storage.from('oxxen-connect-media').upload(path, file, { upsert: true })
    if (uploadError) throw uploadError
    return supabase.storage.from('oxxen-connect-media').getPublicUrl(path).data.publicUrl
  }

  const validateSlug = async () => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) throw new Error('El slug solo puede usar minúsculas, números y guiones.')
    let q = supabase.from('oxxen_connect_cards').select('id').eq('slug', draft.slug)
    if (id) q = q.neq('id', id)
    const { data, error: slugError } = await q.limit(1)
    if (slugError) throw slugError
    if (data?.length) throw new Error('Ese slug ya está siendo utilizado por otro cliente.')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setSaving(true); setSaved(false)
    try {
      if (!draft.full_name.trim()) throw new Error('El nombre es obligatorio.')
      if (!draft.slug.trim()) throw new Error('El slug es obligatorio.')
      await validateSlug()

      const payload = { ...draft, full_name: draft.full_name.trim(), slug: draft.slug.trim(), links_order: draft.links_order }
      let cardId = id
      if (id) {
        const { error: updateError } = await supabase.from('oxxen_connect_cards').update(payload).eq('id', id)
        if (updateError) throw updateError
      } else {
        const { data, error: insertError } = await supabase.from('oxxen_connect_cards').insert(payload).select('id').single()
        if (insertError) throw insertError
        cardId = data.id
      }

      const mediaUpdates: Record<string, string> = {}
      if (cardId && profileFile) mediaUpdates.profile_image_url = await upload(cardId, profileFile, 'profile')
      if (cardId && logoFile) mediaUpdates.logo_url = await upload(cardId, logoFile, 'logo')
      if (cardId && Object.keys(mediaUpdates).length) {
        const { error: mediaError } = await supabase.from('oxxen_connect_cards').update(mediaUpdates).eq('id', cardId)
        if (mediaError) throw mediaError
        setDraft(prev => ({ ...prev, ...mediaUpdates }))
      }

      setProfileFile(null); setLogoFile(null); setSaved(true)
      if (!id && cardId) navigate(`/admin/clientes/${cardId}`, { replace: true })
      setTimeout(()=>setSaved(false), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  const downloadPng = () => {
    if (!qrData) return
    const a = document.createElement('a'); a.href = qrData; a.download = `qr-${draft.slug}.png`; a.click()
  }

  if (loading) return <Loading/>

  return (
    <div className="page-stack editor-page">
      <header className="page-header"><div><Link className="back-link" to="/admin/clientes"><ArrowLeft size={16}/> Clientes</Link><h1>{isNew ? 'Nueva tarjeta' : 'Editar tarjeta'}</h1><p>La URL del perfil será la que se grabe en NFC y QR.</p></div>{!isNew && draft.slug && <a className="ghost-button" href={`/p/${draft.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Ver perfil</a>}</header>
      <form onSubmit={save} className="editor-grid">
        <div className="form-stack">
          <Section title="Identidad">
            <div className="grid-2"><Field label="Nombre completo *"><input value={draft.full_name} onChange={e=>nameChange(e.target.value)} required /></Field><Field label="Empresa / negocio"><input value={draft.company || ''} onChange={e=>setField('company', e.target.value)} /></Field></div>
            <div className="grid-2"><Field label="Cargo"><input value={draft.job_title || ''} onChange={e=>setField('job_title', e.target.value)} /></Field><Field label="Slug público *"><div className="prefix-input"><span>/p/</span><input value={draft.slug} onChange={e=>setField('slug', slugify(e.target.value))} required /></div></Field></div>
            <Field label="Descripción corta"><textarea rows={3} value={draft.bio || ''} onChange={e=>setField('bio', e.target.value)} maxLength={220}/></Field>
            <div className="upload-grid"><UploadBox label="Foto de perfil" preview={profilePreview || draft.profile_image_url || ''} onChange={e=>chooseFile('profile', e)}/><UploadBox label="Logo" preview={logoPreview || draft.logo_url || ''} onChange={e=>chooseFile('logo', e)}/></div>
          </Section>

          <Section title="Contacto">
            <div className="grid-2"><Field label="WhatsApp"><input placeholder="51999999999" value={draft.whatsapp || ''} onChange={e=>setField('whatsapp', e.target.value)} /></Field><Field label="Teléfono"><input value={draft.phone || ''} onChange={e=>setField('phone', e.target.value)} /></Field></div>
            <div className="grid-2"><Field label="Email"><input type="email" value={draft.email || ''} onChange={e=>setField('email', e.target.value)} /></Field><Field label="Sitio web"><input placeholder="https://..." value={draft.website || ''} onChange={e=>setField('website', e.target.value)} /></Field></div>
            <Field label="Dirección"><input value={draft.address || ''} onChange={e=>setField('address', e.target.value)} /></Field>
            <Field label="Enlace Google Maps"><input placeholder="https://maps.google.com/..." value={draft.maps_url || ''} onChange={e=>setField('maps_url', e.target.value)} /></Field>
          </Section>

          <Section title="Redes sociales">
            <div className="grid-2"><Field label="Instagram"><input value={draft.instagram || ''} onChange={e=>setField('instagram', e.target.value)} /></Field><Field label="Facebook"><input value={draft.facebook || ''} onChange={e=>setField('facebook', e.target.value)} /></Field><Field label="TikTok"><input value={draft.tiktok || ''} onChange={e=>setField('tiktok', e.target.value)} /></Field><Field label="LinkedIn"><input value={draft.linkedin || ''} onChange={e=>setField('linkedin', e.target.value)} /></Field></div>
          </Section>

          <Section title="Apariencia y estado">
            <div className="grid-3"><Field label="CTA principal"><input value={draft.cta_text} onChange={e=>setField('cta_text', e.target.value)} /></Field><Field label="Color de acento"><input type="color" value={draft.accent_color} onChange={e=>setField('accent_color', e.target.value)} /></Field><Field label="Tema"><select value={draft.theme} onChange={e=>setField('theme', e.target.value as ThemeMode)}><option value="dark">Oscuro</option><option value="light">Claro</option></select></Field></div>
            <label className="switch-row"><input type="checkbox" checked={draft.active} onChange={e=>setField('active', e.target.checked)} /><span>Perfil activo y visible públicamente</span></label>
          </Section>

          {error && <div className="error-box">{error}</div>}
          <button className="primary-button save-button" disabled={saving}><Save size={18}/>{saving ? 'Guardando...' : saved ? <><Check size={18}/> Guardado</> : 'Guardar tarjeta'}</button>
        </div>

        <aside className="editor-aside">
          <div className="sticky-preview"><h3>Vista previa móvil</h3><CardPreview card={previewDraft}/></div>
          {draft.slug && <div id="qr" className="panel qr-panel"><div className="panel-title"><QrCode size={20}/><h3>QR + NFC</h3></div>{qrData && <img className="qr-image" src={qrData} alt={`QR de ${draft.slug}`} />}<code>{publicCardUrl(draft.slug)}</code><div className="button-row"><button type="button" className="ghost-button" onClick={()=>copyText(publicCardUrl(draft.slug))}><Copy size={16}/> Copiar URL</button><button type="button" className="ghost-button" onClick={downloadPng}><Download size={16}/> PNG</button><button type="button" className="ghost-button" onClick={()=>downloadText(`qr-${draft.slug}.svg`, qrSvg, 'image/svg+xml')}><Download size={16}/> SVG</button></div><div className="nfc-note"><strong>URL para grabar en NFC</strong><p>Graba únicamente esta URL en el chip; los datos se actualizan desde OXXEN Connect sin reprogramar la tarjeta.</p></div></div>}
        </aside>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="panel form-section"><h2>{title}</h2>{children}</section> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function UploadBox({ label, preview, onChange }: { label: string; preview: string; onChange: (e: ChangeEvent<HTMLInputElement>)=>void }) { return <label className="upload-box"><span>{label}</span><div className="upload-preview">{preview ? <img src={preview} alt={label}/> : <ImagePlus size={28}/>}</div><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange}/><small>PNG, JPG, WEBP o SVG · máx. 5 MB</small></label> }
