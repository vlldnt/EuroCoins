import ExcelJS from 'exceljs'
import {
  AD, AT, BE, BG, CY, DE, EE, ES, FI, FR, GR, HR, IE, IT, LT, LU, LV, MC, MT, NL, PT, SI, SK, SM, VA,
} from 'country-flag-icons/string/3x2'
import { DENOMINATION_IDS, catalog, type CollectionMode, type CountryCatalog } from './collection'
import { isMarked, keepKnown, seriesLabel, type FileTexts, type ImportResult, flagEmoji } from './collectionFiles'

// Classeur Excel de la collection (chargé à la demande : voir collectionFiles.ts).
//   1. « Résumé » : totaux par pays, calculés par des formules (ils suivent ce qu'on coche à la main).
//   2. Deux onglets « Manquantes » (pièces courantes, puis 2 € commémoratives) : une ligne par pays,
//      les pièces qui manquent regroupées par série (ou par année). Ils se recalculent quand on
//      coche une pièce.
//   3. « Toutes les pièces » : liste complète avec un filtre sur le statut (je l'ai / il me manque).
//   4. Un onglet par pays, drapeau compris : séries courantes, puis commémoratives 2 €.
// Dans les onglets pays, la colonne A (masquée) porte l'identifiant de la ligne : c'est elle que
// l'import relit, les libellés peuvent donc être traduits ou retouchés sans conséquence. La colonne K
// (masquée) calcule ce qui manque sur la ligne, pour les onglets « Manquantes ».

const FLAGS: Record<string, string> = {
  ad: AD, at: AT, be: BE, bg: BG, cy: CY, de: DE, ee: EE, es: ES, fi: FI, fr: FR, gr: GR, hr: HR, ie: IE,
  it: IT, lt: LT, lu: LU, lv: LV, mc: MC, mt: MT, nl: NL, pt: PT, si: SI, sk: SK, sm: SM, va: VA,
}

// Couleurs du classeur (ARGB) : bleu euro du site, vert des cases cochées.
const BLUE = 'FF2455C9'
const WHITE = 'FFFFFFFF'
const GREEN = 'FFBFE8C8'
const RED = 'FFFBD9D6'
const GREY = 'FFE3E6EC'
const LINE = 'FFB8C0D0'
const MUTED = 'FF56607A'

// Première colonne des cases à cocher (C) : une colonne par valeur faciale, de C à J.
const FIRST = 3
const LAST = FIRST + DENOMINATION_IDS.length - 1
const col = (n: number) => String.fromCharCode(64 + n)
// Colonne masquée « ce qui manque sur cette ligne ».
const HELPER = LAST + 1

const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: LINE } },
  left: { style: 'thin', color: { argb: LINE } },
  bottom: { style: 'thin', color: { argb: LINE } },
  right: { style: 'thin', color: { argb: LINE } },
}
const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

/** « fr » → 🇫🇷 (affiché en lettres « FR » par Excel sous Windows). */

/** Drapeau SVG → PNG (Excel n'affiche pas le SVG partout). */
function flagPng(svg: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 180
      canvas.height = 120
      const context = canvas.getContext('2d')
      if (!context) return resolve(null)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => resolve(null)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg width="180" height="120" '))}`
  })
}

const quoteSheet = (name: string) => `'${name.replace(/'/g, "''")}'`
const text = (value: string) => `"${value.replace(/"/g, '""')}"`

/** Un groupe du rapport des manquantes : une série, une année. */
interface Group {
  name: string
  /** Cellule(s) de la colonne K qui donnent ce qui manque dans le groupe. */
  helper: string
  missing: string[]
}

interface Block {
  range: string
  owned: number
  total: number
  groups: Group[]
}

/** Une ligne de l'onglet « Toutes les pièces ». */
interface ListLine {
  country: string
  category: string
  coin: string
  ref: string
  owned: boolean
}

interface CountrySheet {
  name: string
  regular: Block
  comm: Block | null
  lines: ListLine[]
}

export async function buildWorkbook(owned: ReadonlySet<string>, mode: CollectionMode, texts: FileTexts): Promise<ArrayBuffer> {
  const { t } = texts
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'EuroCoins'
  workbook.created = new Date()
  // Les totaux sont recalculés à l'ouverture, même si le tableur garde les valeurs enregistrées.
  workbook.calcProperties.fullCalcOnLoad = true

  // Créés d'abord pour être les trois premiers onglets, remplis une fois les pays connus.
  const summary = workbook.addWorksheet(t('collSummary'), { properties: { tabColor: { argb: BLUE } }, views: [{ showGridLines: false }] })
  const missingName = (category: string) => `${t('collMissing')} – ${category}`.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31)
  // Noms trop longs pour être distincts une fois coupés : la famille de pièces seule.
  const distinct = missingName(t('regularTab')) !== missingName(t('commTab'))
  const [missingRegular, missingComm] = [t('regularTab'), t('commTab')].map((category) =>
    workbook.addWorksheet(distinct ? missingName(category) : category.slice(0, 31), {
      properties: { tabColor: { argb: BLUE } },
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    }),
  )
  const list = workbook.addWorksheet(t('collFullList').slice(0, 31), { properties: { tabColor: { argb: BLUE } }, views: [{ state: 'frozen', ySplit: 1 }] })

  const names = new Set<string>()
  const sheets: CountrySheet[] = []
  for (const entry of catalog) sheets.push(await countrySheet(workbook, entry, owned, mode, texts, names))

  fillSummary(summary, sheets, texts)
  fillList(list, sheets, texts)
  fillMissing(missingRegular, `${t('collMissing')} – ${t('regularTab')}`, sheets.map((s) => ({ name: s.name, groups: s.regular.groups })), mode === 'years' ? 'lines' : 'blocks', texts)
  fillMissing(missingComm, `${t('collMissing')} – ${t('commTab')}`, sheets.map((s) => ({ name: s.name, groups: s.comm?.groups ?? [] })), 'ranges', texts)
  return workbook.xlsx.writeBuffer()
}

async function countrySheet(
  workbook: ExcelJS.Workbook,
  entry: CountryCatalog,
  owned: ReadonlySet<string>,
  mode: CollectionMode,
  texts: FileTexts,
  names: Set<string>,
): Promise<CountrySheet> {
  const { t } = texts
  const { country } = entry
  const countryName = texts.nameOf(country)
  // Nom d'onglet : 31 caractères au plus, sans [ ] : * ? / \, et unique.
  let name = `${flagEmoji(country.iso)} ${countryName.replace(/[[\]:*?/\\]/g, ' ')}`.slice(0, 31)
  if (names.has(name)) name = `${name.slice(0, 28)} ${country.iso.toUpperCase()}`
  names.add(name)

  const sheet = workbook.addWorksheet(name, { views: [{ showGridLines: false }] })
  sheet.columns = [{ width: 4, hidden: true }, { width: 30 }, ...DENOMINATION_IDS.map(() => ({ width: 12 })), { width: 6, hidden: true }]
  const here = quoteSheet(name)
  const lines: ListLine[] = []

  // En-tête : drapeau et nom du pays.
  sheet.getRow(1).height = 48
  const png = FLAGS[country.iso] ? await flagPng(FLAGS[country.iso]) : null
  if (png) {
    sheet.addImage(workbook.addImage({ base64: png, extension: 'png' }), { tl: { col: 1.15, row: 0.2 }, ext: { width: 60, height: 40 } })
  }
  sheet.mergeCells(1, FIRST, 1, LAST)
  Object.assign(sheet.getCell(1, FIRST), {
    value: countryName,
    font: { size: 24, bold: true },
    alignment: { vertical: 'middle' },
  })
  sheet.mergeCells(2, 2, 2, LAST)
  Object.assign(sheet.getCell(2, 2), { value: t('collMark'), font: { size: 12, italic: true, color: { argb: MUTED } } })

  let r = 4
  const title = (value: string) => {
    sheet.mergeCells(r, 2, r, LAST)
    Object.assign(sheet.getCell(r, 2), { value, font: { size: 15, bold: true, color: { argb: BLUE } } })
    sheet.getRow(r).height = 26
    r++
  }
  const header = (labels: string[]) => {
    labels.forEach((label, i) => {
      Object.assign(sheet.getCell(r, 2 + i), {
        value: label,
        font: { size: 12, bold: true, color: { argb: WHITE } },
        fill: solid(BLUE),
        border,
        alignment: { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true },
      })
    })
    sheet.getRow(r).height = 26
    r++
  }
  const label = (value: string | number) => {
    Object.assign(sheet.getCell(r, 2), { value, font: { size: 13, bold: true }, border, alignment: { horizontal: 'left', vertical: 'middle' } })
  }
  // Case à cocher : un « x », proposé dans une liste déroulante (pratique au doigt dans Sheets).
  const mark = (column: number, id: string) => {
    const cell = sheet.getCell(r, column)
    Object.assign(cell, {
      value: owned.has(id) ? 'x' : null,
      font: { size: 14, bold: true },
      border,
      alignment: { horizontal: 'center', vertical: 'middle' },
      dataValidation: { type: 'list', allowBlank: true, formulae: ['"x"'], showErrorMessage: false },
    })
    return `${here}!${cell.address}`
  }
  // Cases remplies en vert, où qu'elles soient dans le bloc.
  const highlight = (range: string) => {
    const first = range.split(':')[0]
    sheet.addConditionalFormatting({
      ref: range,
      rules: [{ type: 'expression', priority: 1, formulae: [`LEN(TRIM(${first}))>0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } }],
    })
  }
  const denominations = DENOMINATION_IDS.map((d) => texts.denominationLabel(d))

  // Grille des pièces courantes (une ligne par série ou par année, une colonne par valeur).
  const grid = (heading: string, firstColumn: string, rows: { key: string; name: string | number; cells: (string | null)[] }[], listed: boolean): Block => {
    title(heading)
    header([firstColumn, ...denominations])
    const start = r
    const block: Block = { range: '', owned: 0, total: 0, groups: [] }
    for (const row of rows) {
      sheet.getCell(r, 1).value = row.key
      label(row.name)
      row.cells.forEach((id, i) => {
        if (!id) {
          Object.assign(sheet.getCell(r, FIRST + i), { fill: solid(GREY), border })
          return
        }
        const ref = mark(FIRST + i, id)
        block.total++
        if (owned.has(id)) block.owned++
        if (listed) lines.push({ country: countryName, category: t('regularTab'), coin: `${row.name} · ${denominations[i]}`, ref, owned: owned.has(id) })
      })
      // Colonne K : les valeurs faciales qui manquent sur la ligne (libellés pris dans l'en-tête).
      const valid = row.cells.flatMap((id, i) => (id ? [{ id, i, letter: col(FIRST + i) }] : []))
      const lacking = valid.filter((c) => !owned.has(c.id)).map((c) => denominations[c.i])
      sheet.getCell(r, HELPER).value = {
        formula: `_xlfn.TEXTJOIN(", ",TRUE,${valid.map((c) => `IF(LEN(TRIM(${c.letter}${r}))=0,${c.letter}$${start - 1},"")`).join(',')})`,
        result: lacking.join(', '),
      }
      block.groups.push({ name: String(row.name), helper: `${here}!${col(HELPER)}${r}`, missing: lacking })
      sheet.getRow(r).height = 26
      r++
    }
    block.range = `${col(FIRST)}${start}:${col(LAST)}${r - 1}`
    highlight(block.range)
    r++
    return block
  }

  const bySeries = grid(
    t('regularTab'),
    t('collBySeries'),
    entry.series.map((row) => ({
      key: row.key,
      name: seriesLabel(texts, row.series),
      cells: DENOMINATION_IDS.map((d) => (row.series.coins[d] ? `${row.key}/${d}` : null)),
    })),
    mode === 'series',
  )
  let regular = bySeries
  if (mode === 'years' && entry.years.length) {
    regular = grid(
      `${t('regularTab')} – ${t('collByYear')}`,
      t('mintageYear'),
      entry.years.map((row) => ({ key: row.key, name: row.year, cells: row.cells })),
      true,
    )
  }

  // Commémoratives : une ligne par pièce, la case en colonne C, le titre sur le reste de la largeur.
  // L'année n'est écrite qu'une fois : ses lignes sont fusionnées dans la colonne B.
  let comm: Block | null = null
  if (entry.comm.length) {
    title(t('commTab'))
    sheet.mergeCells(r, FIRST + 1, r, LAST)
    header([t('mintageYear'), t('collHave'), t('collCoin')])
    const start = r
    const block: Block = { range: '', owned: 0, total: entry.comm.length, groups: [] }
    const years = [...new Set(entry.comm.map((c) => c.coin.year))]
    for (const year of years) {
      const first = r
      const lacking: string[] = []
      for (const { coin, id } of entry.comm.filter((c) => c.coin.year === year)) {
        const coinTitle = texts.commTitle(coin)
        sheet.getCell(r, 1).value = id
        const ref = mark(FIRST, id)
        sheet.mergeCells(r, FIRST + 1, r, LAST)
        Object.assign(sheet.getCell(r, FIRST + 1), { value: coinTitle, font: { size: 12 }, border, alignment: { vertical: 'middle', wrapText: true } })
        // Colonne K : le titre tant que la case est vide.
        sheet.getCell(r, HELPER).value = { formula: `IF(LEN(TRIM(${col(FIRST)}${r}))=0,${col(FIRST + 1)}${r},"")`, result: owned.has(id) ? '' : coinTitle }
        // Titre long : deux lignes.
        sheet.getRow(r).height = coinTitle.length > 75 ? 36 : 26
        if (owned.has(id)) block.owned++
        else lacking.push(coinTitle)
        lines.push({ country: countryName, category: t('commTab'), coin: `${coin.year} · ${coinTitle}`, ref, owned: owned.has(id) })
        r++
      }
      if (r - 1 > first) sheet.mergeCells(first, 2, r - 1, 2)
      Object.assign(sheet.getCell(first, 2), { value: year, font: { size: 13, bold: true }, border, alignment: { horizontal: 'left', vertical: 'middle' } })
      block.groups.push({ name: String(year), helper: `${here}!${col(HELPER)}${first}:${col(HELPER)}${r - 1}`, missing: lacking })
    }
    block.range = `${col(FIRST)}${start}:${col(FIRST)}${r - 1}`
    highlight(block.range)
    comm = block
  }

  return { name, regular, comm, lines }
}

function fillSummary(sheet: ExcelJS.Worksheet, sheets: CountrySheet[], texts: FileTexts) {
  const { t } = texts
  sheet.columns = [{ width: 32 }, ...Array.from({ length: 7 }, () => ({ width: 17 }))]

  sheet.mergeCells('A1:H1')
  Object.assign(sheet.getCell('A1'), { value: `EuroCoins – ${t('collection')}`, font: { size: 24, bold: true }, alignment: { vertical: 'middle' } })
  sheet.getRow(1).height = 44
  for (const [row, value] of [[2, t('collGuide')], [3, t('collGuideFilter')]] as const) {
    sheet.mergeCells(row, 1, row, 8)
    Object.assign(sheet.getCell(row, 1), { value, font: { size: 12, color: { argb: MUTED } }, alignment: { wrapText: true, vertical: 'top' } })
    sheet.getRow(row).height = 36
  }

  const head = (row: number, column: number, value: string) => {
    Object.assign(sheet.getCell(row, column), {
      value,
      font: { size: 12, bold: true, color: { argb: WHITE } },
      fill: solid(BLUE),
      border,
      alignment: { horizontal: column === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true },
    })
  }
  // Deux niveaux d'en-tête : la famille de pièces, puis « je l'ai / total / il me manque ».
  sheet.mergeCells('B5:D5')
  sheet.mergeCells('E5:G5')
  head(5, 1, '')
  head(5, 2, t('regularTab'))
  head(5, 5, t('commTab'))
  head(5, 8, '')
  const columns = [t('countries'), t('collHave'), t('collTotal'), t('collLack'), t('collHave'), t('collTotal'), t('collLack'), '%']
  columns.forEach((value, i) => head(6, 1 + i, value))
  sheet.getRow(5).height = 26
  sheet.getRow(6).height = 26

  const first = 7
  let r = first
  const number = (column: number, value: ExcelJS.CellValue, bold = false) => {
    Object.assign(sheet.getCell(r, column), { value, font: { size: 13, bold }, border, alignment: { horizontal: 'center', vertical: 'middle' } })
  }
  const percent = (ownedCount: number, total: number, bold = false) => {
    number(8, { formula: `IF(C${r}+F${r}=0,0,(B${r}+E${r})/(C${r}+F${r}))`, result: total ? ownedCount / total : 0 }, bold)
    sheet.getCell(r, 8).numFmt = '0%'
  }
  for (const { name, regular, comm } of sheets) {
    Object.assign(sheet.getCell(r, 1), { value: name, font: { size: 13, bold: true }, border, alignment: { vertical: 'middle' } })
    number(2, { formula: `COUNTA(${quoteSheet(name)}!${regular.range})`, result: regular.owned })
    number(3, regular.total)
    number(4, { formula: `C${r}-B${r}`, result: regular.total - regular.owned })
    number(5, comm ? { formula: `COUNTA(${quoteSheet(name)}!${comm.range})`, result: comm.owned } : 0)
    number(6, comm?.total ?? 0)
    number(7, { formula: `F${r}-E${r}`, result: (comm?.total ?? 0) - (comm?.owned ?? 0) })
    percent(regular.owned + (comm?.owned ?? 0), regular.total + (comm?.total ?? 0))
    sheet.getRow(r).height = 24
    r++
  }
  const last = r - 1
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: last, column: 8 } }

  // Ligne de total (hors du filtre).
  const sum = (pick: (s: CountrySheet) => number) => sheets.reduce((n, s) => n + pick(s), 0)
  const totals = [
    sum((s) => s.regular.owned),
    sum((s) => s.regular.total),
    sum((s) => s.regular.total - s.regular.owned),
    sum((s) => s.comm?.owned ?? 0),
    sum((s) => s.comm?.total ?? 0),
    sum((s) => (s.comm?.total ?? 0) - (s.comm?.owned ?? 0)),
  ]
  r++
  Object.assign(sheet.getCell(r, 1), { value: t('collTotal'), font: { size: 13, bold: true }, border, fill: solid(GREY), alignment: { vertical: 'middle' } })
  totals.forEach((result, i) => {
    const letter = col(2 + i)
    number(2 + i, { formula: `SUM(${letter}${first}:${letter}${last})`, result }, true)
    sheet.getCell(r, 2 + i).fill = solid(GREY)
  })
  percent(totals[0] + totals[3], totals[1] + totals[4], true)
  sheet.getCell(r, 8).fill = solid(GREY)
  sheet.getRow(r).height = 28
}

function fillList(sheet: ExcelJS.Worksheet, sheets: CountrySheet[], texts: FileTexts) {
  const { t } = texts
  const have = t('collHave')
  const lack = t('collLack')
  sheet.columns = [{ width: 28 }, { width: 26 }, { width: 80 }, { width: 20 }]
  ;[t('countries'), t('collCategory'), t('collCoin'), t('collStatus')].forEach((value, i) => {
    Object.assign(sheet.getCell(1, 1 + i), {
      value,
      font: { size: 12, bold: true, color: { argb: WHITE } },
      fill: solid(BLUE),
      border,
      alignment: { vertical: 'middle' },
    })
  })
  sheet.getRow(1).height = 26

  let r = 2
  for (const { name, lines } of sheets) {
    for (const line of lines) {
      const values: ExcelJS.CellValue[] = [
        name,
        line.category,
        line.coin,
        // Le statut suit la case de l'onglet du pays.
        { formula: `IF(LEN(TRIM(${line.ref}))>0,${text(have)},${text(lack)})`, result: line.owned ? have : lack },
      ]
      values.forEach((value, i) => {
        Object.assign(sheet.getCell(r, 1 + i), { value, font: { size: 12 }, border, alignment: { vertical: 'middle' } })
      })
      r++
    }
  }
  const last = Math.max(r - 1, 2)
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: 4 } }
  const fill = (argb: string) => ({ fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb } } })
  sheet.addConditionalFormatting({
    ref: `D2:D${last}`,
    rules: [
      { type: 'expression', priority: 1, formulae: [`$D2=${text(have)}`], style: fill(GREEN) },
      { type: 'expression', priority: 2, formulae: [`$D2=${text(lack)}`], style: fill(RED) },
    ],
  })
}

// Onglet « Manquantes » d'une famille de pièces : une ligne par pays, ce qui manque dans la cellule.
//   blocks  « Série 1: » puis « - 1 euro, 2 euros », une ligne vide entre deux séries ;
//   lines   « 2003: 1 euro, 2 euros », une ligne par année ;
//   ranges  « 2012: titre; titre », une ligne par année (plusieurs commémoratives la même année).
// Une ligne par groupe pour les années : une cellule Excel ne s'affiche pas au-delà de 409 points
// de haut, soit une trentaine de lignes de texte.
function fillMissing(
  sheet: ExcelJS.Worksheet,
  heading: string,
  countries: { name: string; groups: Group[] }[],
  layout: 'blocks' | 'lines' | 'ranges',
  texts: FileTexts,
) {
  sheet.columns = [{ width: 26 }, { width: 130 }]
  Object.assign(sheet.getCell('A1'), { value: heading, font: { size: 22, bold: true }, alignment: { vertical: 'middle' } })
  sheet.getRow(1).height = 40
  ;[texts.t('countries'), texts.t('collMissing')].forEach((value, i) => {
    Object.assign(sheet.getCell(3, 1 + i), {
      value,
      font: { size: 12, bold: true, color: { argb: WHITE } },
      fill: solid(BLUE),
      border,
      alignment: { vertical: 'middle' },
    })
  })
  sheet.getRow(3).height = 26

  const formulaOf = (g: Group) => {
    if (layout === 'blocks') return `IF(${g.helper}="","",${text(`${g.name}:`)}&CHAR(10)&"- "&${g.helper})`
    if (layout === 'lines') return `IF(${g.helper}="","",${text(`${g.name}: `)}&${g.helper})`
    return `IF(_xlfn.TEXTJOIN("",TRUE,${g.helper})="","",${text(`${g.name}: `)}&_xlfn.TEXTJOIN("; ",TRUE,${g.helper}))`
  }
  const resultOf = (g: Group) => (layout === 'blocks' ? `${g.name}:\n- ${g.missing.join(', ')}` : `${g.name}: ${g.missing.join(layout === 'ranges' ? '; ' : ', ')}`)
  const between = layout === 'blocks' ? 'CHAR(10)&CHAR(10)' : 'CHAR(10)'

  countries.forEach(({ name, groups }, n) => {
    const r = 4 + n
    Object.assign(sheet.getCell(r, 1), { value: name, font: { size: 12, bold: true }, border, alignment: { vertical: 'top' } })
    const result = groups.filter((g) => g.missing.length).map(resultOf).join(layout === 'blocks' ? '\n\n' : '\n')
    Object.assign(sheet.getCell(r, 2), {
      value: groups.length ? { formula: `_xlfn.TEXTJOIN(${between},TRUE,${groups.map(formulaOf).join(',')})`, result } : '',
      font: { size: 11 },
      border,
      alignment: { vertical: 'top', wrapText: true },
    })
    // Pays auquel il ne manque rien : ligne masquée (elle reste là, ses formules aussi).
    if (!result) sheet.getRow(r).hidden = true
  })
}

/** Relit un classeur : seules comptent la colonne A (identifiant) et les cases de la ligne. */
export async function readWorkbook(buffer: ArrayBuffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const marked: string[] = []
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const key = row.getCell(1).text.trim()
      if (!key.includes('/')) return
      if (key.startsWith('c/')) {
        if (isMarked(row.getCell(FIRST).text)) marked.push(key)
        return
      }
      DENOMINATION_IDS.forEach((d, i) => {
        if (isMarked(row.getCell(FIRST + i).text)) marked.push(`${key}/${d}`)
      })
    })
  })
  return keepKnown(marked)
}
