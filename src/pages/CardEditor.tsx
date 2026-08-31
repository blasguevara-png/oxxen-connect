import { ChangeEvent, FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, Copy, Download, ExternalLink, ImagePlus, LockKeyhole, QrCode, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { CardPreview } from '../components/CardPreview'
import { Loading } from '../components/Loading'
import { copyText, downloadText, LINK_ORDER, publicCardUrl, slugify } from '../lib/helpers'
import { optimizeImage, storagePathFromPublicUrl } from '../lib/images'
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
  const [publicId, setPublicId] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [processingMedia, setProcessingMedia] = useState(false)
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
      if (loadError) setError('No pudimos cargar esta tarjeta. Intenta nuevamente.')
      else {
        const card = data as CardRecord
        const { id: _id, public_id, deleted_at: _deletedAt, created_at: _created, updated_at: _updated, ...rest } = card
        setPublicId(public_id)
        setDraft({ ...emptyDraft, ...rest, links_order: Array.isArray(rest.links_order) ? rest.links_order : [...LINK_ORDER] })
      }
      setLoading(false)
    }
    void load()
  }, [id])

  useEffect(() => {
    if (!publicId) {
      setQrData('')
      setQrSvg('')
      return
    }
    const url = publicCardUrl(publicId)
    void QRCode.toDataURL(url, { width: 1600, margin: 4, errorCorrectionLevel: 'M' }).then(setQrData)
    void QRCode.toString(url, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' }).then(setQrSvg)
  }, [publicId])

  useEffect(() => {
    if (window.location.hash === '#qr') setTimeout(()=>document.getElementById('qr')?.scrollIntoView({ behavior: 'smooth' }), 250)
  }, [loading])

  useEffect(() => () => {
    if (profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview)
    if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
  }, [profilePreview, logoPreview])

  const previewDraft = useMemo(() => ({ ...draft, profile_image_url: profilePreview || draft.profile_image_url, logo_url: logoPreview || draft.logo_url }), [draft, profilePreview, logoPreview])

  const setField = (key: keyof CardDraft, value: string | boolean | ThemeMode) => setDraft(prev => ({ ...prev, [key]: value }))
  const nameChange = (value: string) => setDraft(prev => ({ ...prev, full_name: value, slug: prev.slug || slugify(value) }))

  const chooseFile = async (kind: 'profile' | 'logo', e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessingMedia(true)
    setError('')
    try {
      const optimized = await optimizeImage(file, kind)
      const url = URL.createObjectURL(optimized)
      if (kind === 'profile') {
        if (profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview)
        setProfileFile(optimized)
        setProfilePreview(url)
      } else {
        if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
        setLogoFile(optimized)
        setLogoPreview(url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la imagen.')
    } finally {
      setProcessingMedia(false)
    }
  }

  async function upload(cardId: string, file: File, kind: 'profile' | 'logo') {
    const path = `${cardId}/${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`
    const { data, error: uploadError } = await supabase.storage.from('oxxen-connect-media').upload(path, file, {
      upsert: false,
      contentType: 'image/webp',
      cacheControl: '31536000',
    })
    if (uploadError) throw new Error('No se pudo subir la imagen. Intenta nuevamente.')
    const publicUrl = supabase.storage.from('oxxen-connect-media').getPublicUrl(data.path).data.publicUrl
    return { publicUrl, path: data.path }
  }

  async function removeStoredMedia(url: string | null | undefined) {
    const path = storagePathFromPublicUrl(url)
    if (!path) return
    await supabase.storage.from('oxxen-connect-media').remove([path])
  }

  const validateSlug = async () => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) throw new Error('El alias solo puede usar minúsculas, números y guiones.')
    let q = supabase.from('oxxen_connect_cards').select('id').eq('slug', draft.slug)
    if (id) q = q.neq('id', id)
    const [cardsResult, aliasResult] = await Promise.all([
      q.limit(1),
      supabase.from('oxxen_connect_card_aliases').select('card_id').eq('alias', draft.slug).limit(2),
    ])
    if (cardsResult.error || aliasResult.error) throw new Error('No se pudo validar el alias. Intenta nuevamente.')
    if (cardsResult.data?.length) throw new Error('Ese alias ya está siendo utilizado por otro cliente.')
    if ((aliasResult.data || []).some(row => row.card_id !== id)) throw new Error('Ese alias pertenece al historial permanente de otra tarjeta y no puede reutilizarse.')
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (processingMedia) return
    setError(''); setSaving(true); setSaved(false)
    const uploadedPaths: string[] = []
    try {
      if (!draft.full_name.trim()) throw new Error('El nombre es obligatorio.')
      if (!draft.slug.trim()) throw new Error('El alias es obligatorio.')
      await validateSlug()

      const payload = { ...draft, full_name: draft.full_name.trim(), slug: draft.slug.trim(), links_order: draft.links_order }
      let cardId = id
      let permanentId = publicId

      if (id) {
        const { error: updateError } = await supabase.from('oxxen_connect_cards').update(payload).eq('id', id)
        if (updateError) throw new Error('No se pudo guardar la tarjeta. Revisa los datos e intenta nuevamente.')
      } else {
        const { data, error: insertError } = await supabase.from('oxxen_connect_cards').insert(payload).select('id,public_id').single()
        if (insertError) throw new Error('No se pudo crear la tarjeta. Revisa el alias e intenta nuevamente.')
        cardId = data.id
        permanentId = data.public_id
        setPublicId(data.public_id)
      }

      const oldProfileUrl = draft.profile_image_url
      const oldLogoUrl = draft.logo_url
      const mediaUpdates: Record<string, string> = {}
      if (cardId && profileFile) {
        const uploaded = await upload(cardId, profileFile, 'profile')
        mediaUpdates.profile_image_url = uploaded.publicUrl
        uploadedPaths.push(uploaded.path)
      }
      if (cardId && logoFile) {
        const uploaded = await upload(cardId, logoFile, 'logo')
        mediaUpdates.logo_url = uploaded.publicUrl
        uploadedPaths.push(uploaded.path)
      }
      if (cardId && Object.keys(mediaUpdates).length) {
        const { error: mediaError } = await supabase.from('oxxen_connect_cards').update(mediaUpdates).eq('id', cardId)
        if (mediaError) throw new Error('La tarjeta se guardó, pero no se pudieron vincular las imágenes nuevas.')
        if (mediaUpdates.profile_image_url) await removeStoredMedia(oldProfileUrl)
        if (mediaUpdates.logo_url) await removeStoredMedia(oldLogoUrl)
        setDraft(prev => ({ ...prev, ...mediaUpdates }))
        uploadedPaths.length = 0
      }

      if (profilePreview.startsWith('blob:')) URL.revokeObjectURL(profilePreview)
      if (logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
      setProfilePreview(''); setLogoPreview('')
      setProfileFile(null); setLogoFile(null); setSaved(true)
      if (!id && cardId) navigate(`/admin/clientes/${cardId}`, { replace: true })
      if (!permanentId && cardId) {
        const { data } = await supabase.from('oxxen_connect_cards').select('public_id').eq('id', cardId).single()
        if (data?.public_id) setPublicId(data.public_id)
      }
      setTimeout(()=>setSaved(false), 2200)
    } catch (err) {
      if (uploadedPaths.length) await supabase.storage.from('oxxen-connect-media').remove(uploadedPaths)
      setError(err instanceof Error ? err.message : 'No se pudo guardar la tarjeta.')
    } finally { setSaving(false) }
  }

  const downloadPng = () => {
    if (!qrData || !publicId) return
    const a = document.createElement('a'); a.href = qrData; a.download = `qr-${draft.slug || publicId}-1600px.png`; a.click()
  }

  if (loading) return <Loading/>

  return (
    <div className="page-stack editor-page">
      <header className="page-header"><div><Link className="back-link" to="/admin/clientes"><ArrowLeft size={16}/> Clientes</Link><h1>{isNew ? 'Nueva tarjeta' : 'Editar tarjeta'}</h1><p>La URL permanente es la que se graba en el NFC y QR físico.</p></div>{publicId && <a className="ghost-button" href={publicCardUrl(publicId)} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Ver perfil</a>}</header>
      <form onSubmit={save} className="editor-grid">
        <div className="form-stack">
          <Section title="Identidad">
            <div className="grid-2"><Field label="Nombre completo *"><input value={draft.full_name} onChange={e=>nameChange(e.target.value)} required /></Field><Field label="Empresa / negocio"><input value={draft.company || ''} onChange={e=>setField('company', e.target.value)} /></Field></div>
            <div className="grid-2"><Field label="Cargo"><input value={draft.job_title || ''} onChange={e=>setField('job_title', e.target.value)} /></Field><Field label="Alias público"><div className="prefix-input"><span>/p/</span><input value={draft.slug} onChange={e=>setField('slug', slugify(e.target.value))} required /></div><small>El alias puede cambiar. El QR/NFC usa un identificador permanente independiente.</small></Field></div>
            {publicId ? <div className="nfc-note"><strong><LockKeyhole size={14}/> URL permanente protegida</strong><p>{publicCardUrl(publicId)}</p><p>Está vinculada al QR/NFC físico y no puede modificarse.</p></div> : <div className="nfc-note"><strong><LockKeyhole size={14}/> URL permanente</strong><p>Se generará automáticamente al guardar la tarjeta por primera vez.</p></div>}
            <Field label="Descripción corta"><textarea rows={3} value={draft.bio || ''} onChange={e=>setField('bio', e.target.value)} maxLength={220}/></Field>
            <div className="upload-grid"><UploadBox label="Foto de perfil" preview={profilePreview || draft.profile_image_url || ''} onChange={e=>void chooseFile('profile', e)}/><UploadBox label="Logo / banner actual" preview={logoPreview || draft.logo_url || ''} onChange={e=>void chooseFile('logo', e)}/></div>
            {processingMedia && <small>Optimizando imagen antes de subirla…</small>}
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
          <button className="primary-button save-button" disabled={saving || processingMedia}><Save size={18}/>{saving ? 'Guardando...' : saved ? <><Check size={18}/> Guardado</> : 'Guardar tarjeta'}</button>
        </div>

        <aside className="editor-aside">
          <div className="sticky-preview"><h3>Vista previa móvil</h3><CardPreview card={previewDraft}/></div>
          {publicId ? <div id="qr" className="panel qr-panel"><div className="panel-title"><QrCode size={20}/><h3>QR + NFC permanente</h3></div>{qrData && <img className="qr-image" src={qrData} alt={`QR de ${draft.slug}`} />}<code>{publicCardUrl(publicId)}</code><div className="button-row"><button type="button" className="ghost-button" onClick={()=>copyText(publicCardUrl(publicId))}><Copy size={16}/> Copiar URL</button><button type="button" className="ghost-button" onClick={downloadPng}><Download size={16}/> PNG alta calidad</button><button type="button" className="ghost-button" onClick={()=>downloadText(`qr-${draft.slug || publicId}.svg`, qrSvg, 'image/svg+xml')}><Download size={16}/> SVG</button></div><div className="nfc-note"><strong>URL para grabar en NFC</strong><p>Esta URL no depende del nombre ni del alias. Puedes editar los datos sin reprogramar la tarjeta física.</p></div></div> : <div className="panel qr-panel"><div className="panel-title"><QrCode size={20}/><h3>QR + NFC</h3></div><p>Guarda primero la tarjeta para generar su URL permanente y su QR definitivo.</p></div>}
        </aside>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="panel form-section"><h2>{title}</h2>{children}</section> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function UploadBox({ label, preview, onChange }: { label: string; preview: string; onChange: (e: ChangeEvent<HTMLInputElement>)=>void }) { return <label className="upload-box"><span>{label}</span><div className="upload-preview">{preview ? <img src={preview} alt={label}/> : <ImagePlus size={28}/>}</div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange}/><small>JPG, PNG o WEBP · se optimiza automáticamente</small></label> }
