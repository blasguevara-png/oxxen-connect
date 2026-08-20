export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="OXXEN Connect">
      <div className="brand-mark">O</div>
      <div>
        <strong>OXXEN{compact ? '' : ' CONNECT'}</strong>
        {!compact && <span>by OXXEN GROUP</span>}
      </div>
    </div>
  )
}
