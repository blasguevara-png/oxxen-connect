type Props = { message: string; tone?: 'success' | 'error' }

export function Toast({ message, tone = 'success' }: Props) {
  if (!message) return null
  return <div className={`toast toast-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{message}</div>
}
