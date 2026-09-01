import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, Check, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { CUSTOMER_STATUS_LABELS, normalizeCustomerDraft, validateCustomerDraft } from '../lib/customers'
import { supabase } from '../lib/supabase'
import type { CustomerDraft, CustomerDocumentType, CustomerRecord, CustomerStatus } from '../types'

const emptyDraft: CustomerDraft = {
  business_name: '', contact_name: '', email: '', phone: '', whatsapp: '', document_type: null,
  document_number: '', address: '', notes: '', status: 'lead',
}

export function CustomerEditor() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError('')
      const { data, error: loadError } = await supabase.from('oxxen_connect_customers').select('*').eq('id', id).single()
      if (loadError || !data) setError('No pudimos cargar este cliente.')
      else {
        const customer = data as CustomerRecord
        setCode(customer.customer_code)
        setDraft({
          business_name: customer.business_name,
          contact_name: customer.contact_name,
          email: customer.email,
          phone: customer.phone,
          whatsapp: customer.whatsapp,
          document_type: customer.document_type,
          document_number: customer.document_number,
          address: customer.address,
          notes: customer.notes,
          status: customer.status,
        })
      }
      setLoading(false)
    }
    void load()
  }, [id])

  const setField = <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const normalized = normalizeCustomerDraft(draft)
      const validationError = validateCustomerDraft(normalized)
      if (validationError) throw new Error(validationError)

      if (id) {
        const { error: updateError } = await supabase.from('oxxen_connect_customers').update(normalized).eq('id', id)
        if (updateError) throw new Error('No se pudo actualizar el cliente. Verifica permisos y datos.')
        setSaved(true)
        setTimeout(()=>setSaved(false), 1800)
      } else {
        const { data, error: insertError } = await supabase.from('oxxen_connect_customers').insert(normalized).select('id').single()
        if (insertError || !data) throw new Error('No se pudo crear el cliente. Verifica permisos y datos.')
        navigate(`/admin/clientes/${data.id}`, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el cliente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading/>

  return (
    <div className="page-stack editor-page">
      <header className="page-header"><div><Link className="back-link" to={id ? `/admin/clientes/${id}` : '/admin/clientes'}><ArrowLeft size={16}/> Clientes</Link><span className="eyebrow">CLIENTE COMERCIAL</span><h1>{isNew ? 'Nuevo cliente' : `Editar ${code}`}</h1><p>Este registro comercial no reemplaza la identidad permanente de ninguna tarjeta.</p></div></header>
      <form className="form-stack" onSubmit={save}>
        <section className="panel form-section">
          <h2>Identidad comercial</h2>
          <div className="grid-2">
            <label className="field"><span>Negocio / empresa</span><input value={draft.business_name || ''} onChange={e=>setField('business_name', e.target.value)}/></label>
            <label className="field"><span>Contacto</span><input value={draft.contact_name || ''} onChange={e=>setField('contact_name', e.target.value)}/></label>
            <label className="field"><span>Tipo de documento</span><select value={draft.document_type || ''} onChange={e=>setField('document_type', (e.target.value || null) as CustomerDocumentType | null)}><option value="">Sin documento</option><option value="DNI">DNI</option><option value="RUC">RUC</option><option value="CE">CE</option><option value="PASSPORT">Pasaporte</option><option value="OTHER">Otro</option></select></label>
            <label className="field"><span>Número de documento</span><input value={draft.document_number || ''} onChange={e=>setField('document_number', e.target.value)}/></label>
          </div>
        </section>

        <section className="panel form-section">
          <h2>Contacto</h2>
          <div className="grid-2">
            <label className="field"><span>Email</span><input type="email" value={draft.email || ''} onChange={e=>setField('email', e.target.value)}/></label>
            <label className="field"><span>WhatsApp</span><input value={draft.whatsapp || ''} onChange={e=>setField('whatsapp', e.target.value)}/></label>
            <label className="field"><span>Teléfono</span><input value={draft.phone || ''} onChange={e=>setField('phone', e.target.value)}/></label>
            <label className="field"><span>Dirección</span><input value={draft.address || ''} onChange={e=>setField('address', e.target.value)}/></label>
          </div>
        </section>

        <section className="panel form-section">
          <h2>Estado y notas</h2>
          <label className="field"><span>Estado</span><select value={draft.status} onChange={e=>setField('status', e.target.value as CustomerStatus)}>{Object.entries(CUSTOMER_STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Notas internas</span><textarea rows={4} value={draft.notes || ''} onChange={e=>setField('notes', e.target.value)}/></label>
          <small>No existe eliminación definitiva desde la UI. Usa estados para administrar el ciclo comercial.</small>
        </section>

        {error && <div className="error-box">{error}</div>}
        <button className="primary-button save-button" disabled={saving}><Save size={18}/>{saving ? 'Guardando...' : saved ? <><Check size={18}/> Guardado</> : 'Guardar cliente'}</button>
      </form>
    </div>
  )
}
