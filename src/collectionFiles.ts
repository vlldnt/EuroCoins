import type { CommemorativeCoin, Country, DenominationId, Series } from './data'
import type { Messages } from './i18n'
import { catalog, validIds, type CollectionMode } from './collection'

// Export et import de la collection : Excel (.xlsx, lisible par Google Sheets), CSV et JSON.
// Tout fichier exporté peut être réimporté ; le modèle vide est le même fichier, sans rien de coché.

export type FileFormat = 'xlsx' | 'csv' | 'json'

/** Textes dans la langue de l'interface, fournis par le composant. */
export interface FileTexts {
  t: (key: keyof Messages, vars?: Record<string, string | number>) => string
  nameOf: (country: Country) => string
  denominationLabel: (id: DenominationId) => string
  commTitle: (coin: CommemorativeCoin) => string
}

export interface ImportResult {
  ids: string[]
  /** Lignes cochées qui ne correspondent à aucune pièce du catalogue. */
  unknown: number
}

/** « Série 2 (depuis 2022) ». */
export function seriesLabel(texts: FileTexts, series: Series): string {
  const name = texts.t('seriesN', { n: series.index })
  return series.since ? `${name} (${texts.t('sinceYear', { year: series.since })})` : name
}

/** Une case est cochée dès qu'elle contient quelque chose, sauf un « non » explicite. */
const NO = new Set(['', '0', '-', 'n', 'no', 'non', 'false', 'faux', 'nein', 'nee'])
export const isMarked = (value: unknown) => !NO.has(String(value ?? '').trim().toLowerCase())

/** Garde les identifiants du catalogue, compte les autres. */
export function keepKnown(ids: Iterable<string>): ImportResult {
  const known = new Set<string>()
  let unknown = 0
  for (const id of ids) {
    if (validIds.has(id)) known.add(id)
    else unknown++
  }
  return { ids: [...known], unknown }
}

// ----- JSON -----

function toJson(owned: ReadonlySet<string>, mode: CollectionMode): string {
  return JSON.stringify({ app: 'EuroCoins', kind: 'collection', version: 1, exportedAt: new Date().toISOString(), mode, owned: [...owned].sort() }, null, 2)
}

function fromJson(text: string): ImportResult {
  const parsed = JSON.parse(text) as unknown
  const list = Array.isArray(parsed) ? parsed : (parsed as { owned?: unknown })?.owned
  return keepKnown(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
}

// ----- CSV : une ligne par pièce, identifiant en première colonne, case en dernière -----

const csvCell = (value: string) => (/[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

function toCsv(owned: ReadonlySet<string>, mode: CollectionMode, texts: FileTexts): string {
  const { t } = texts
  const lines = [['id', t('countries'), t('collCategory'), t('collCoin'), t('collHave')]]
  const push = (id: string, country: string, category: string, coin: string) =>
    lines.push([id, country, category, coin, owned.has(id) ? 'x' : ''])
  for (const entry of catalog) {
    const name = texts.nameOf(entry.country)
    for (const row of entry.series) {
      for (const id of row.ids) {
        push(id, name, t('regularTab'), `${seriesLabel(texts, row.series)} · ${texts.denominationLabel(id.split('/')[2] as DenominationId)}`)
      }
    }
    if (mode === 'years') {
      for (const row of entry.years) {
        for (const id of row.ids) push(id, name, t('regularTab'), `${row.year} · ${texts.denominationLabel(id.split('/')[2] as DenominationId)}`)
      }
    }
    for (const { coin, id } of entry.comm) push(id, name, t('commTab'), `${coin.year} · ${texts.commTitle(coin)}`)
  }
  // BOM + point-virgule : Excel ouvre le fichier directement, accents compris.
  return `﻿${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`
}

/** Lecture d'un CSV (séparateur « ; », « , » ou tabulation, guillemets doublés). */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const separator = [';', '\t', ','].find((s) => firstLine.includes(s)) ?? ';'
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === separator) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

function fromCsv(text: string): ImportResult {
  const marked: string[] = []
  for (const row of parseCsv(text)) {
    const id = row[0]?.trim()
    if (!id || id === 'id' || row.length < 2) continue
    if (isMarked(row[row.length - 1])) marked.push(id)
  }
  return keepKnown(marked)
}

// ----- fichiers -----

const MIME: Record<FileFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
}

function download(content: BlobPart, name: string, format: FileFormat) {
  const url = URL.createObjectURL(new Blob([content], { type: MIME[format] }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.${format}`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Télécharge la collection ; `owned` vide = modèle à remplir à la main. */
export async function exportCollection(format: FileFormat, owned: ReadonlySet<string>, mode: CollectionMode, texts: FileTexts) {
  const name = owned.size ? `eurocoins-collection-${new Date().toISOString().slice(0, 10)}` : 'eurocoins-collection-template'
  if (format === 'json') return download(toJson(owned, mode), name, format)
  if (format === 'csv') return download(toCsv(owned, mode, texts), name, format)
  // Excel : bibliothèque lourde, chargée seulement à la demande.
  const { buildWorkbook } = await import('./collectionXlsx')
  download(await buildWorkbook(owned, mode, texts), name, format)
}

/** Lit un fichier exporté par le site ou rempli à la main (le format est déduit du contenu). */
export async function importCollection(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer()
  const head = new Uint8Array(buffer.slice(0, 2))
  // Un .xlsx est une archive ZIP : il commence par « PK ».
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const { readWorkbook } = await import('./collectionXlsx')
    return readWorkbook(buffer)
  }
  const text = new TextDecoder().decode(buffer)
  return /^﻿?\s*[[{]/.test(text) ? fromJson(text) : fromCsv(text)
}
