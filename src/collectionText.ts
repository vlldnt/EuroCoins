import { catalog, type CollectionMode } from './collection'
import type { FileTexts } from './collectionFiles'
import type { DenominationId } from './data'

// Liste des pièces manquantes, en texte à copier pour l'envoyer à quelqu'un :
//   France
//   - Série 1: 1 cent, 1 euro
// Un pays auquel il ne manque rien n'apparaît pas.

export interface MissingCountry {
  name: string
  lines: string[]
}

/** Pièces courantes manquantes, pays par pays : une ligne par série (ou par année, selon le suivi). */
export function missingRegular(owned: ReadonlySet<string>, mode: CollectionMode, texts: FileTexts): MissingCountry[] {
  return catalog.flatMap((entry) => {
    const rows =
      mode === 'years'
        ? entry.years.map((row) => ({ label: String(row.year), ids: row.ids }))
        : entry.series.map((row) => ({ label: texts.t('seriesN', { n: row.series.index }), ids: row.ids }))
    const lines = rows.flatMap(({ label, ids }) => {
      const missing = ids.filter((id) => !owned.has(id)).map((id) => texts.denominationLabel(id.split('/')[2] as DenominationId))
      return missing.length ? [`${label}: ${missing.join(', ')}`] : []
    })
    return lines.length ? [{ name: texts.nameOf(entry.country), lines }] : []
  })
}

/** 2 € commémoratives manquantes, pays par pays : une ligne par année. */
export function missingComm(owned: ReadonlySet<string>, texts: FileTexts): MissingCountry[] {
  return catalog.flatMap((entry) => {
    const byYear = new Map<number, string[]>()
    for (const { coin, id } of entry.comm) {
      if (owned.has(id)) continue
      byYear.set(coin.year, [...(byYear.get(coin.year) ?? []), texts.commTitle(coin)])
    }
    // Un point-virgule entre deux pièces : leurs titres contiennent souvent des virgules.
    const lines = [...byYear].map(([year, titles]) => `${year}: ${titles.join(' ; ')}`)
    return lines.length ? [{ name: texts.nameOf(entry.country), lines }] : []
  })
}

/** Texte brut : lisible partout (SMS, messagerie, courriel sans mise en forme). */
export const missingText = (heading: string, countries: MissingCountry[]) =>
  [heading, ...countries.map((c) => [c.name, ...c.lines.map((line) => `- ${line}`)].join('\n'))].join('\n\n')

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Même liste mise en forme (pays en gras, liste à puces), pour les courriels et les traitements de texte. */
export const missingHtml = (heading: string, countries: MissingCountry[]) =>
  `<p><b>${escape(heading)}</b></p>` +
  countries.map((c) => `<p><b>${escape(c.name)}</b></p><ul>${c.lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>`).join('')

/** Copie la liste dans les deux formats ; le logiciel où l'on colle prend celui qu'il sait afficher. */
export async function copyMissing(heading: string, countries: MissingCountry[]) {
  const text = missingText(heading, countries)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([missingHtml(heading, countries)], { type: 'text/html' }),
      }),
    ])
  } catch {
    // Navigateur sans copie mise en forme : texte seul.
    await navigator.clipboard.writeText(text)
  }
}
