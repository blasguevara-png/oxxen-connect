import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { NetworkStatus } from './components/NetworkStatus'
import './styles.css'
import './logo-overrides.css'
import './sprint2.css'
import './mfa.css'
import './editor-preview-fix.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <NetworkStatus />
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
