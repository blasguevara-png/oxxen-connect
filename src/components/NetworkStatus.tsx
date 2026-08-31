import { useEffect, useState } from 'react'

export function NetworkStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null
  return <div className="network-banner" role="status">Sin conexión. Los cambios no se enviarán hasta recuperar internet.</div>
}
