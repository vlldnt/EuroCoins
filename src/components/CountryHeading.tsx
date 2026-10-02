import { commemorativeFor, ecbPageUrl, type Country } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { Flag } from './Flag'

interface Props {
  country: Country
  /** « panel » : bandeau de la fenêtre pays ; « card » : fiche au survol de la carte. */
  variant: 'panel' | 'card'
  titleId?: string
  titleRef?: React.Ref<HTMLHeadingElement>
}

const ICONS = {
  calendar: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    </svg>
  ),
  range: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
}

// En-tête d'un pays : drapeau, nom (et nom dans sa langue), pastilles d'infos illustrées.
// Le drapeau flouté sert de fond au bandeau de la fenêtre pays.
export function CountryHeading({ country, variant, titleId, titleRef }: Props) {
  const { t, plural, textsLang } = useI18n()
  const { nameOf, nativeNameOf } = useCoinTexts()
  const name = nameOf(country)
  const native = nativeNameOf(country)
  const comm = commemorativeFor(country.iso)
  const years = comm.map((c) => c.year)
  const range = years.length ? `${Math.min(...years)} – ${Math.max(...years)}` : null
  const Title = variant === 'panel' ? 'h2' : 'strong'

  return (
    <div className={`country-heading is-${variant}`}>
      {variant === 'panel' && (
        <div className="country-heading-backdrop" aria-hidden="true">
          <Flag id={country.iso} cover />
        </div>
      )}
      <div className="country-heading-main">
        <span className="country-heading-flag" aria-hidden="true">
          <Flag id={country.iso} />
        </span>
        <div className="country-heading-names">
          <span className="country-heading-title">
            <Title id={titleId} ref={titleRef as React.Ref<HTMLHeadingElement>} tabIndex={titleRef ? -1 : undefined}>
              {name}
            </Title>
            {/* Page officielle BCE du pays (la même pour toutes ses séries) : icône seule. */}
            {variant === 'panel' && (
              <a
                className="ecb-link"
                href={ecbPageUrl(country, textsLang)}
                target="_blank"
                rel="noreferrer"
                aria-label={t('ecbOfficial')}
                title={t('ecbOfficial')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
            )}
          </span>
          {native !== name && (
            <span className="country-heading-native">{native}</span>
          )}
        </div>
      </div>
      <ul className="country-facts">
        <li title={t('euroSince', { year: country.euroSince })}>
          {ICONS.calendar}
          <span className="visually-hidden">{t('euroSince', { year: country.euroSince })}</span>
          <span aria-hidden="true">€ {country.euroSince}</span>
        </li>
        <li>
          {ICONS.layers}
          {plural('seriesOne', 'seriesMany', country.series.length)}
        </li>
        <li title={plural('commOne', 'commMany', comm.length)}>
          {ICONS.star}
          {/* Mobile : libellé court (le nombre seul) ; le libellé complet reste lu par les lecteurs d'écran. */}
          <span className="fact-long">{plural('commOne', 'commMany', comm.length)}</span>
          <span className="fact-short" aria-hidden="true">
            {comm.length}
          </span>
        </li>
        {range && (
          <li title={t('commTab')}>
            {ICONS.range}
            {range}
          </li>
        )}
      </ul>
    </div>
  )
}
