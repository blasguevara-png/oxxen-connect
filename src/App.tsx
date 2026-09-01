import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AdminGuard } from './components/AdminGuard'
import { AdminLayout } from './components/AdminLayout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Cards } from './pages/Cards'
import { CardEditor } from './pages/CardEditor'
import { PublicCard } from './pages/PublicCard'
import { AuditLog } from './pages/AuditLog'
import { Orders } from './pages/Orders'
import { OrderEditor } from './pages/OrderEditor'
import { CustomerDetail } from './pages/CustomerDetail'
import { NfcInventory } from './pages/NfcInventory'
import { NfcAssetEditor } from './pages/NfcAssetEditor'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing/>}/>
        <Route path="/p/:slug" element={<PublicCard/>}/>
        <Route path="/admin/login" element={<Login/>}/>
        <Route element={<AdminGuard/>}>
          <Route path="/admin" element={<AdminLayout/>}>
            <Route index element={<Dashboard/>}/>
            <Route path="clientes" element={<Cards/>}/>
            <Route path="clientes/nuevo" element={<CardEditor/>}/>
            <Route path="clientes/:customerId/resumen" element={<CustomerDetail/>}/>
            <Route path="clientes/:id" element={<CardEditor/>}/>
            <Route path="pedidos" element={<Orders/>}/>
            <Route path="pedidos/nuevo" element={<OrderEditor/>}/>
            <Route path="pedidos/:id" element={<OrderEditor/>}/>
            <Route path="inventario-nfc" element={<NfcInventory/>}/>
            <Route path="inventario-nfc/:id" element={<NfcAssetEditor/>}/>
            <Route path="actividad" element={<AuditLog/>}/>
          </Route>
        </Route>
        <Route path="*" element={<div className="screen-center"><div className="empty-state"><h2>404</h2><p>Página no encontrada.</p></div></div>}/>
      </Routes>
    </BrowserRouter>
  )
}
