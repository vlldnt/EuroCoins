import { useId } from 'react'
import type { CoinLayout, CommLayout } from '../settings'
import { useI18n } from '../i18n'

type Layout = CoinLayout | CommLayout

const LABELS = {
  circle: 'layoutCircle',
  row: 'layoutRow',
  grid: 'layoutGrid',
  mosaic: 'layoutGrid',
  years: 'layoutByYear',
} as const

const ICONS: Record<Layout, React.ReactNode> = {
  circle: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="19" cy="9" r="2" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="5" cy="9" r="2" />
    </svg>
  ),
  row: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="2.6" cy="12" r="1.4" />
      <circle cx="6.2" cy="12" r="1.7" />
      <circle cx="10.4" cy="12" r="2" />
      <circle cx="15" cy="12" r="2.2" />
      <circle cx="20.2" cy="12" r="2.6" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <circle cx="9" cy="18" r="2.2" />
      <circle cx="15" cy="18" r="2.2" />
    </svg>
  ),
  mosaic: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].flatMap((y) =>
        [5, 12, 19].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />),
      )}
    </svg>
  ),
  // Une ligne par année : étiquette d'année à gauche, pièces à droite.
  years: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {[5, 12, 19].map((y) => (
        <g key={y}>
          <rect x="1" y={y - 1.2} width="6" height="2.4" rx="1.2" />
          <circle cx="11.5" cy={y} r="2.4" />
          <circle cx="17.5" cy={y} r="2.4" />
        </g>
      ))}
    </svg>
  ),
}

// Choix de disposition (mémorisé par l'appelant) : boutons radio natifs, navigables aux flèches.
export function LayoutPicker<L extends Layout>({
  options,
  value,
  onChange,
}: {
  options: readonly L[]
  value: L
  onChange: (value: L) => void
}) {
  const { t } = useI18n()
  const name = useId()

  return (
    <fieldset className="layout-picker">
      <legend className="visually-hidden">{t('coinLayout')}</legend>
      {options.map((option) => (
        <label key={option} title={t(LABELS[option])}>
          <input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />
          {ICONS[option]}
          <span className="visually-hidden">{t(LABELS[option])}</span>
        </label>
      ))}
    </fieldset>
  )
}
