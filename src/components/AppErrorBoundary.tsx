import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OXXEN Connect unhandled UI error', { name: error.name, message: error.message, componentStack: info.componentStack })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="screen-center">
        <div className="empty-state">
          <h2>No pudimos mostrar esta pantalla</h2>
          <p>La información no se ha eliminado. Recarga la aplicación para intentarlo nuevamente.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      </div>
    )
  }
}
