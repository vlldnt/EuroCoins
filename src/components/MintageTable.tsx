import { Fragment, useMemo } from 'react'
import { data, type Country } from '../data'
import { mintageYears, mintagesFor, type YearMintage } from '../mintages'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'

// Tableau repliable des tirages par année et par valeur faciale (données Numista).
export function MintageTable({ country }: { country: Country }) {
  const { t, lang } = useI18n()
  const { denominationLabel } = useCoinTexts()
  const byDenomination = useMemo(() => mintagesFor(country.iso), [country.iso])
  const years = useMemo(() => mintageYears(byDenomination), [byDenomination])

  const full = useMemo(() => new Intl.NumberFormat(lang), [lang])
  const compact = useMemo(
    () => new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }),
    [lang],
  )

  if (years.length === 0) return null

  // Cellule : tirage de circulation abrégé ; à défaut, tirage des coffrets marqué d'un astérisque.
  const cell = (m: YearMintage | undefined) => {
    if (!m) return <td className="is-empty" title={t('mintageNone')}>—</td>
    const [circulation, sets] = m
    if (circulation === null) return <td className="is-empty" title={t('mintageUnknown')}>?</td>
    if (circulation > 0) {
      const title = [
        t('mintage', { count: full.format(circulation) }),
        sets ? t('mintageSets', { count: full.format(sets) }) : '',
      ].filter(Boolean)
      return <td title={title.join('\n')}>{compact.format(circulation)}</td>
    }
    if (sets) {
      return (
        <td className="is-sets" title={t('mintageSets', { count: full.format(sets) })}>
          {compact.format(sets)}*
        </td>
      )
    }
    return <td className="is-empty" title={t('mintageNone')}>—</td>
  }

  return (
    <details className="about mintages">
      <summary>{t('mintagesByYear')}</summary>
      <div className="mintage-scroll" tabIndex={0} role="region" aria-label={t('mintagesByYear')}>
        <table className="mintage-table">
          <thead>
            <tr>
              <th scope="col">{t('mintageYear')}</th>
              {data.denominations.map((d) => (
                <th scope="col" key={d.id}>
                  {denominationLabel(d.id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year}>
                <th scope="row">{year}</th>
                {data.denominations.map((d) => (
                  <Fragment key={d.id}>{cell(byDenomination[d.id]?.[year])}</Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mintage-legend">
        {t('mintageSetsOnly')}{' '}
        {t('mintagesSource')}{' '}
        <a href="https://numista.com" target="_blank" rel="noreferrer">
          Numista
        </a>
      </p>
    </details>
  )
}

