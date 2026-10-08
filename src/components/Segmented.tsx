// Choix exclusif présenté comme une rangée de boutons (onglets, filtre, suivi par série ou par année).
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`coll-segmented ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
