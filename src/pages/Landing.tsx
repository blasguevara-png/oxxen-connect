import { ArrowRight, Nfc, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Brand } from '../components/Brand'

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav"><Brand/><Link className="ghost-button" to="/admin/login">Administrar</Link></header>
      <section className="hero">
        <div>
          <span className="eyebrow">TARJETAS INTELIGENTES · NFC + QR</span>
          <h1>Tu contacto profesional, <em>a un toque.</em></h1>
          <p>OXXEN Connect convierte una tarjeta física en una presencia digital editable. Cambia tus datos sin volver a imprimir ni reprogramar el NFC.</p>
          <div className="hero-actions"><a className="primary-button" href="mailto:contacto@oxxengroup.com">Solicitar una tarjeta <ArrowRight size={18}/></a></div>
        </div>
        <div className="hero-device"><Smartphone size={78}/><div className="signal"><Nfc size={32}/><QrCode size={32}/></div></div>
      </section>
      <section className="feature-strip">
        <article><Nfc/><h3>NFC</h3><p>Acerca la tarjeta al celular.</p></article>
        <article><QrCode/><h3>QR</h3><p>Escanea desde cualquier cámara.</p></article>
        <article><RefreshCw/><h3>Siempre editable</h3><p>Los datos cambian; la URL permanece.</p></article>
      </section>
    </div>
  )
}
