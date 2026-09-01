import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { supabase } from '../lib/supabase'
import { CustomerDetail } from './CustomerDetail'

type Resolution = 'loading' | 'customer' | 'card' | 'missing'

export function CustomerRouteResolver() {
  const { id = '' } = useParams()
  const [resolution, setResolution] = useState<Resolution>('loading')

  useEffect(() => {
    const resolve = async () => {
      setResolution('loading')
      const customer = await supabase.from('oxxen_connect_customers').select('id').eq('id', id).maybeSingle()
      if (!customer.error && customer.data) { setResolution('customer'); return }
      const card = await supabase.from('oxxen_connect_cards').select('id').eq('id', id).maybeSingle()
      if (!card.error && card.data) { setResolution('card'); return }
      setResolution('missing')
    }
    if (id) void resolve()
    else setResolution('missing')
  }, [id])

  if (resolution === 'loading') return <Loading label="Resolviendo cliente..."/>
  if (resolution === 'card') return <Navigate to={`/admin/tarjetas/${id}`} replace/>
  if (resolution === 'customer') return <CustomerDetail/>
  return <div className="empty-state"><h2>Registro no disponible</h2><p>No encontramos un cliente ni una tarjeta legacy con este identificador.</p></div>
}
