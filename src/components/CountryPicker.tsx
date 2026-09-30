import { data } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { Flag } from './Flag'

interface Props {
  selected: string | null
  onSelect: (iso: string | null) => void
}

// Accès aux pays sans passer par la carte : rangée de drapeaux (ordinateur, tablette), dont le nom
// apparaît au survol, au focus ou quand le pays est ouvert ; liste déroulante native sur mobile.
// La CSS affiche l'une ou l'autre.
export function CountryPicker({ selected, onSelect }: Props) {
  const { t, lang } = useI18n()
  const { nameOf } = useCoinTexts()
  const sorted = [...data.countries].sort((a, b) => nameOf(a).localeCompare(nameOf(b), lang))

  return (
    <>
      <nav className="country-chips" aria-label={t('countries')}>
        {sorted.map((c) => (
          <button key={c.iso} aria-pressed={selected === c.iso} onClick={() => onSelect(c.iso)} title={nameOf(c)}>
            <Flag id={c.iso} />
            {/* Toujours présent pour les lecteurs d'écran ; visible seulement au survol/focus/sélection. */}
            <span className="country-chip-name">{nameOf(c)}</span>
          </button>
        ))}
      </nav>

      <label className="country-select">
        <span className="visually-hidden">{t('countries')}</span>
        <select value={selected ?? ''} onChange={(e) => onSelect(e.target.value || null)}>
          <option value="">{t('chooseCountry')}</option>
          {sorted.map((c) => (
            <option key={c.iso} value={c.iso}>
              {nameOf(c)}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
