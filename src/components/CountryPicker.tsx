import { data, type Country } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { Flag } from './Flag'

interface Props {
  selected: string | null
  onSelect: (iso: string | null) => void
}

// Pays groupés par année d'entrée dans l'euro (puis par nom), de la plus ancienne à la plus récente.
function useCountriesByYear() {
  const { lang } = useI18n()
  const { nameOf } = useCoinTexts()
  const groups = new Map<number, Country[]>()
  for (const c of [...data.countries].sort(
    (a, b) => a.euroSince - b.euroSince || nameOf(a).localeCompare(nameOf(b), lang),
  )) {
    if (!groups.has(c.euroSince)) groups.set(c.euroSince, [])
    groups.get(c.euroSince)!.push(c)
  }
  return [...groups.entries()]
}

// Liste des pays posée sur la gauche de la carte (ordinateur, tablette) : une colonne de drapeaux sur
// fond transparent ; le nom apparaît en fondu au survol / focus et reste affiché pour le pays ouvert.
export function CountryList({ selected, onSelect }: Props) {
  const { t } = useI18n()
  const { nameOf } = useCoinTexts()
  const groups = useCountriesByYear()
  let index = 0 // rang d'apparition, pour l'entrée en cascade

  return (
    <nav id="countries-list" className="country-list" aria-label={t('countries')} tabIndex={-1} data-keep-panel>
      {groups.map(([year, countries]) => (
        <section key={year} className="country-list-group" aria-label={String(year)}>
          <h2 className="country-list-year" aria-hidden="true">
            {year}
          </h2>
          <ul>
            {countries.map((c) => (
              <li key={c.iso} style={{ '--i': index++ } as React.CSSProperties}>
                <button aria-pressed={selected === c.iso} onClick={() => onSelect(c.iso)}>
                  <Flag id={c.iso} />
                  <span className="country-list-name">{nameOf(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

// Mobile : liste déroulante native, dans le même ordre (année d'entrée dans l'euro).
export function CountrySelect({ selected, onSelect }: Props) {
  const { t } = useI18n()
  const { nameOf } = useCoinTexts()
  const groups = useCountriesByYear()

  return (
    <label className="country-select">
      <span className="visually-hidden">{t('countries')}</span>
      <select value={selected ?? ''} onChange={(e) => onSelect(e.target.value || null)}>
        <option value="">{t('chooseCountry')}</option>
        {groups.map(([year, countries]) => (
          <optgroup key={year} label={String(year)}>
            {countries.map((c) => (
              <option key={c.iso} value={c.iso}>
                {nameOf(c)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}
