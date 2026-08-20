export function Loading({ label = 'Cargando...' }: { label?: string }) {
  return <div className="loading"><span className="spinner" />{label}</div>
}
