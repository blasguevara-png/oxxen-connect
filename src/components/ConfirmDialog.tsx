type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', busy = false, onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={e=>{ if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="button-row">
          <button type="button" className="ghost-button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? 'Procesando...' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
