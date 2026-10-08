// Génère les pages statiques du site à partir du build Vite (dist/index.html) : une vraie page HTML
// par pays, par pièce courante, par pièce commémorative, par valeur faciale et par année, avec son
// titre, sa description, ses balises de partage et ses données structurées, plus sitemap.xml et
// robots.txt. Sans cela, les moteurs de recherche ne voient qu'une page vide (appli rendue en JS).
//
// Deux sortes de pages :
//  - pages de l'appli (pays, pièces) : le contenu statique est dans <div id="root">, l'appli le
//    remplace à son démarrage et affiche la même vue (voir src/navigation.ts) ;
//  - pages sans appli (une valeur faciale dans tous les pays, commémoratives par année) : HTML seul.
//
// Usage : lancé par `npm run build` après vite build ; `npm run build-pages` pour le relancer seul.
// Les adresses et les titres viennent de src/routes.ts et src/pageMeta.ts, partagés avec l'appli.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGE_LANGS, createRoutes } from '../src/routes.ts'
import { pageMeta, valueLabel } from '../src/pageMeta.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
// Adresse publique du site (URL absolues : canonical, partage, sitemap).
const SITE = (process.env.SITE_URL ?? 'https://eurocoins.vieilledent.eu').replace(/\/$/, '')
const SITE_NAME = 'EuroCoins'

const readJson = async (file) => JSON.parse(await readFile(path.join(ROOT, file), 'utf8'))
const data = await readJson('src/data/coins.json')
const mintages = (await readJson('src/data/mintages.json')).countries

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const abs = (pathname) => SITE + pathname.split('#')[0]

// Gabarit : le index.html produit par Vite, débarrassé de ce qu'une exécution précédente a injecté.
const template = (await readFile(path.join(DIST, 'index.html'), 'utf8'))
  .replace(/<!--seo-->[\s\S]*?<!--\/seo-->\n?/g, '')
  .replace(/<!--static-->[\s\S]*?<!--\/static-->/g, '')
if (!template.includes('<div id="root"></div>')) throw new Error('dist/index.html : <div id="root"></div> introuvable')

const sitemap = []
let written = 0

for (const lang of PAGE_LANGS) await buildLanguage(lang)

await writeFile(path.join(DIST, 'sitemap.xml'), sitemapXml(sitemap))
await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`)
console.log(`Pages statiques : ${written} fichiers, ${sitemap.length} adresses dans sitemap.xml`)

async function buildLanguage(lang) {
  const messages = (await import(`../src/i18n/locales/${lang}.ts`)).default
  const texts = await readJson(`public/i18n/${lang}.json`)
  const routes = createRoutes(data, lang)
  const t = (key, vars) => messages[key].replace(/\{(\w+)\}/g, (m, name) => (vars && name in vars ? String(vars[name]) : m))
  const numbers = new Intl.NumberFormat(lang)
  const regionNames = new Intl.DisplayNames([lang], { type: 'region' })

  // Mêmes règles que src/i18n/useCoinTexts.ts : textes BCE de la langue, repli sur coins.json.
  const nameOf = (country) => {
    const name = regionNames.of(country.iso.toUpperCase())
    return name && name.toUpperCase() !== country.iso.toUpperCase() ? name : country.name
  }
  const commTitle = (c) => (c.image && texts.commemorative[c.image]?.title) || c.title
  const commDescription = (c) => (c.image && texts.commemorative[c.image]?.description) || c.description
  const regularDescription = (image) => texts.regular?.[image] ?? ''
  const countryDescription = (country) => texts.countries[country.iso]?.description ?? country.description
  const mintageText = (c) =>
    c.mintage !== null ? t('mintage', { count: numbers.format(c.mintage) }) : c.joint ? t('mintageVariable') : ''
  const ctx = {
    t,
    countries: data.countries,
    commemorative: data.commemorative,
    nameOf,
    commTitle,
    commDescription,
    regularDescription,
  }

  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), lang)
  const countries = [...data.countries].sort(byName)
  const countryOf = (iso) => data.countries.find((c) => c.iso === iso)
  const commFor = (iso) => data.commemorative.filter((c) => c.country === iso).sort((a, b) => b.year - a.year)
  const years = [...new Set(data.commemorative.map((c) => c.year))].sort((a, b) => b - a)
  const seriesLabel = (country, s) => (country.series.length > 1 ? t('seriesN', { n: s.index }) : t('currentSeries'))
  const seriesTag = (s) => s.note ?? (s.since ? t('sinceYear', { year: s.since }) : '')
  const coinAlt = (country, id, s) => `${nameOf(country)} — ${valueLabel(t, id)} (${t('seriesN', { n: s.index })})`
  const commAlt = (c) => `${nameOf(countryOf(c.country))} ${c.year} — ${commTitle(c)}`
  const commPath = (c) => (routes.hasCommPage(c) ? routes.pathOf({ kind: 'comm', iso: c.country, coin: c }) : null)

  // ----- morceaux de page -----

  const img = (src, alt, size, lazy = true) =>
    `<img src="${esc(src)}" alt="${esc(alt)}" width="${size}" height="${size}"${lazy ? ' loading="lazy"' : ''} decoding="async">`
  const link = (href, label) => `<a href="${esc(href)}">${label}</a>`
  const links = (items) => `<ul class="static-links">${items.map(([href, label]) => `<li>${link(href, esc(label))}</li>`).join('')}</ul>`
  const tag = (text) => (text ? ` <span class="static-tag">${esc(text)}</span>` : '')
  const paragraphs = (blocks) =>
    [...new Set(blocks.flatMap((b) => b.split('\n')).map((p) => p.trim()).filter(Boolean))].map((p) => `<p>${esc(p)}</p>`).join('')

  const denominationLinks = () => data.denominations.map((d) => [routes.denominationPath(d.id), valueLabel(t, d.id)])

  /** Carte d'une commémorative dans une grille : visuel, « année — titre », tirage. */
  const commCard = (c, { withCountry = false } = {}) => {
    const href = commPath(c)
    const label = esc(`${withCountry ? `${nameOf(countryOf(c.country))} — ` : `${c.year} — `}${commTitle(c)}`)
    const picture = c.image ? img(c.image, '', 112) : `<small>${esc(t('comingSoon'))}</small>`
    return `<li>${href ? `<a href="${esc(href)}">${picture}</a>` : picture}${href ? link(href, label) : `<span>${label}</span>`}${
      c.joint ? `<small>${esc(t('jointIssue'))}</small>` : ''
    }${mintageText(c) ? `<small>${esc(mintageText(c))}</small>` : ''}</li>`
  }

  const breadcrumb = (crumbs) => ({
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(href) })),
  })
  const website = { '@type': 'WebSite', '@id': `${SITE}/#website`, name: SITE_NAME, url: `${SITE}/`, inLanguage: lang }
  const itemList = (items) => ({
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, url: abs(href) })),
  })

  /** Enveloppe commune : logo, fil d'Ariane, contenu, liens vers les autres rubriques. */
  const layout = (crumbs, body) => `<header class="static-top">
<a class="static-brand" href="${routes.base}"><img src="/icons/logo.webp" alt="" width="32" height="32">${SITE_NAME}</a>
<nav class="static-crumbs"><ol>${crumbs
    .map(([name, href], i) => `<li>${i < crumbs.length - 1 ? link(href, esc(name)) : `<span aria-current="page">${esc(name)}</span>`}</li>`)
    .join('')}</ol></nav>
</header>
<main>
${body}
</main>
<footer class="static-foot">
<h2>${esc(t('seoByDenomination'))}</h2>
${links(denominationLinks())}
<h2>${esc(t('commTab'))}</h2>
${links([[routes.yearsPath(), t('seoByYear')]])}
<p>${esc(t('sourceLabel'))} <a href="https://www.ecb.europa.eu/euro/coins/html/index.${lang}.html" rel="noreferrer">${esc(t('ecb'))}</a></p>
</footer>`

  /** Écrit une page. `standalone` : page sans appli (pas de script). */
  async function write(pathname, { title, description, image, crumbs, body, jsonld, standalone = false, canonical = pathname, listed = true }) {
    const url = abs(canonical)
    const imageUrl = SITE + (image ?? '/icons/icon-512.png')
    const graph = { '@context': 'https://schema.org', '@graph': [website, breadcrumb(crumbs), ...jsonld(url)] }
    const head = `<!--seo-->
    <link rel="canonical" href="${esc(url)}" />
    <link rel="alternate" hreflang="${lang}" href="${esc(url)}" />
    <link rel="alternate" hreflang="x-default" href="${esc(url)}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${lang}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta name="twitter:card" content="summary" />
    <script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
    <!--/seo-->
  </head>`
    let html = template
      .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, (_, a, b) => a + esc(description) + b)
      .replace('</head>', () => head)
      .replace(
        '<div id="root"></div>',
        () => `<div id="root"><!--static--><div class="static-page${standalone ? '' : ' is-fallback'}">${layout(crumbs, body)}</div><!--/static--></div>`,
      )
    if (standalone) {
      html = html.replace(/\s*<script type="module"[^>]*><\/script>/g, '').replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
    }
    const file = path.join(DIST, pathname, 'index.html')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, html)
    written++
    if (listed) sitemap.push({ loc: url, lang, images: image ? [SITE + image] : [] })
  }

  const home = [t('seoHome'), routes.base]
  const collection = (meta, items) => (url) => [
    { '@type': 'CollectionPage', name: meta.title, description: meta.description, url, inLanguage: lang, isPartOf: { '@id': website['@id'] }, mainEntity: itemList(items) },
  ]
  const coinPage = (meta, image, caption) => (url) => [
    {
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      url,
      inLanguage: lang,
      isPartOf: { '@id': website['@id'] },
      primaryImageOfPage: { '@type': 'ImageObject', contentUrl: SITE + image, caption },
    },
  ]

  // ----- accueil (et racine du site, qui renvoie vers la page d'accueil de la langue) -----
  {
    const meta = pageMeta({ kind: 'home' }, ctx)
    const body = `<h1>${esc(t('subtitle', { count: data.countries.length }))}</h1>
<p class="static-lead">${esc(meta.description)}</p>
<h2>${esc(t('countries'))}</h2>
<ul class="static-coins">${countries
      .map((c) => {
        const href = routes.pathOf({ kind: 'country', iso: c.iso })
        const image = c.series.at(-1)?.coins['2e']
        return `<li>${image ? `<a href="${href}">${img(image, '', 112)}</a>` : ''}${link(href, esc(nameOf(c)))}<small>${esc(t('euroSince', { year: c.euroSince }))}</small></li>`
      })
      .join('')}</ul>
<h2>${esc(t('seoByYear'))}</h2>
${links(years.map((y) => [routes.yearPath(y), String(y)]))}`
    const page = {
      ...meta,
      crumbs: [home],
      body,
      jsonld: collection(meta, countries.map((c) => [nameOf(c), routes.pathOf({ kind: 'country', iso: c.iso })])),
    }
    await write(routes.base, page)
    if (lang === PAGE_LANGS[0]) await write('/', { ...page, canonical: routes.base, listed: false })
  }

  // ----- ma collection (page de l'appli : le contenu vit dans le navigateur de chacun) -----
  {
    const meta = pageMeta({ kind: 'collection' }, ctx)
    const pathname = routes.pathOf({ kind: 'collection' })
    await write(pathname, {
      ...meta,
      crumbs: [home, [t('collection'), pathname]],
      body: `<h1>${esc(t('collection'))}</h1>\n<p class="static-lead">${esc(meta.description)}</p>`,
      jsonld: (url) => [{ '@type': 'WebPage', name: meta.title, description: meta.description, url, inLanguage: lang, isPartOf: { '@id': website['@id'] } }],
    })
  }

  // ----- pays -----
  for (const country of countries) {
    const name = nameOf(country)
    const countryPath = routes.pathOf({ kind: 'country', iso: country.iso })
    const commListPath = routes.pathOf({ kind: 'commList', iso: country.iso })
    const coins = commFor(country.iso)
    const seriesNewestFirst = [...country.series].reverse()
    const countryCrumb = [name, countryPath]
    const coinRoute = (id, s) => ({ kind: 'coin', iso: country.iso, denomination: id, series: s.index })

    // Fiche du pays : séries courantes, graphismes, commémoratives.
    {
      const meta = pageMeta({ kind: 'country', iso: country.iso }, ctx)
      const body = `<h1>${esc(meta.title)}</h1>
<p class="static-lead">${esc(t('euroSince', { year: country.euroSince }))}. ${esc(meta.description)}</p>
<h2>${esc(t('regularTab'))}</h2>
${seriesNewestFirst
  .map(
    (s) => `<h3>${esc(seriesLabel(country, s))}${tag(seriesTag(s))}</h3>
<ul class="static-coins">${data.denominations
      .filter((d) => s.coins[d.id])
      .map((d) => {
        const href = routes.pathOf(coinRoute(d.id, s))
        return `<li><a href="${esc(href)}">${img(s.coins[d.id], coinAlt(country, d.id, s), 112)}</a>${link(href, esc(valueLabel(t, d.id)))}</li>`
      })
      .join('')}</ul>`,
  )
  .join('\n')}
<h2>${esc(t('aboutDesigns'))}</h2>
${paragraphs(countryDescription(country))}
<h2>${link(commListPath, esc(t('commTab')))}</h2>
${coins.length ? `<ul class="static-coins">${coins.map((c) => commCard(c)).join('')}</ul>` : `<p>${esc(t('noCommemorative'))}</p>`}`
      await write(countryPath, {
        ...meta,
        image: country.series.at(-1)?.coins['2e'],
        crumbs: [home, countryCrumb],
        body,
        jsonld: collection(meta, [
          ...data.denominations.map((d) => [`${valueLabel(t, d.id)} – ${name}`, routes.pathOf(coinRoute(d.id, country.series.at(-1))).split('#')[0]]),
          ...coins.filter(commPath).map((c) => [`${c.year} – ${commTitle(c)}`, commPath(c)]),
        ]),
      })
    }

    // Une page par valeur faciale du pays : chaque graphisme (d'une série à l'autre) et les tirages.
    for (const d of data.denominations) {
      const latest = routes.latestSeriesWith(country, d.id)
      if (latest === null) continue
      const value = valueLabel(t, d.id)
      const route = { kind: 'coin', iso: country.iso, denomination: d.id, series: latest }
      const meta = pageMeta(route, ctx)
      // Graphismes distincts, du plus récent au plus ancien, avec les séries qui les portent.
      const designs = []
      for (const s of seriesNewestFirst) {
        const image = s.coins[d.id]
        if (!image) continue
        const known = designs.find((x) => x.image === image)
        if (known) known.series.push(s)
        else designs.push({ image, series: [s] })
      }
      const byYear = mintages[country.iso]?.[d.id] ?? {}
      const mintageRows = Object.keys(byYear)
        .sort((a, b) => b - a)
        .map((year) => {
          const [circulation, sets] = byYear[year]
          const main = circulation === null ? t('mintageUnknown') : circulation > 0 ? t('mintage', { count: numbers.format(circulation) }) : sets ? '' : t('mintageNone')
          return `<tr><th scope="row">${year}</th><td>${esc(main)}</td><td>${sets ? esc(t('mintageSets', { count: numbers.format(sets) })) : ''}</td></tr>`
        })
      const body = `<h1>${esc(meta.title)}</h1>
${designs
  .map(({ image, series }, i) => {
    const oldest = series.at(-1)
    return `<figure class="static-figure">${img(image, coinAlt(country, d.id, series[0]), 280, i > 0)}
<figcaption><h2>${esc(t('seoNationalSide'))} — ${esc(series.map((s) => seriesLabel(country, s)).reverse().join(', '))}${tag(seriesTag(oldest))}</h2>
${paragraphs([regularDescription(image)])}</figcaption></figure>`
  })
  .join('\n')}
${
  mintageRows.length
    ? `<h2>${esc(t('mintagesByYear'))}</h2>
<table class="static-table"><thead><tr><th scope="col">${esc(t('mintageYear'))}</th><th scope="col" colspan="2">${esc(value)} – ${esc(name)}</th></tr></thead>
<tbody>${mintageRows.join('')}</tbody></table>
<p>${esc(t('mintagesSource'))} <a href="https://numista.com" rel="noreferrer">Numista</a></p>`
    : ''
}
<h2>${esc(name)} — ${esc(t('regularTab'))}</h2>
${links([
  ...data.denominations
    .filter((o) => o.id !== d.id && routes.latestSeriesWith(country, o.id) !== null)
    .map((o) => [routes.pathOf({ kind: 'coin', iso: country.iso, denomination: o.id, series: routes.latestSeriesWith(country, o.id) }), valueLabel(t, o.id)]),
  [commListPath, t('commTab')],
])}
<p>${link(routes.denominationPath(d.id), esc(t('seoDenomTitle', { value, count: data.countries.length })))}</p>`
      await write(routes.pathOf(route), {
        ...meta,
        image: designs[0].image,
        crumbs: [home, countryCrumb, [value, routes.pathOf(route)]],
        body,
        jsonld: coinPage(meta, designs[0].image, coinAlt(country, d.id, designs[0].series[0])),
      })
    }

    if (coins.length === 0) continue

    // Liste des commémoratives du pays, par année.
    {
      const meta = pageMeta({ kind: 'commList', iso: country.iso }, ctx)
      const coinYears = [...new Set(coins.map((c) => c.year))]
      const body = `<h1>${esc(meta.title)}</h1>
<p class="static-lead">${esc(meta.description)}</p>
${coinYears
  .map(
    (y) => `<h2>${link(routes.yearPath(y), String(y))}</h2>
<ul class="static-coins">${coins.filter((c) => c.year === y).map((c) => commCard(c)).join('')}</ul>`,
  )
  .join('\n')}`
      await write(commListPath, {
        ...meta,
        image: coins.find((c) => c.image)?.image,
        crumbs: [home, countryCrumb, [t('commTab'), commListPath]],
        body,
        jsonld: collection(meta, coins.filter(commPath).map((c) => [`${c.year} – ${commTitle(c)}`, commPath(c)])),
      })
    }

    // Une page par pièce commémorative (celles qui ont un visuel).
    const withPage = coins.filter(commPath)
    for (const [i, coin] of withPage.entries()) {
      const meta = pageMeta({ kind: 'comm', iso: country.iso, coin }, ctx)
      const neighbours = [
        withPage[i + 1] && [commPath(withPage[i + 1]), `‹ ${withPage[i + 1].year} — ${commTitle(withPage[i + 1])}`],
        withPage[i - 1] && [commPath(withPage[i - 1]), `${withPage[i - 1].year} — ${commTitle(withPage[i - 1])} ›`],
      ].filter(Boolean)
      const body = `<h1>${esc(meta.title)}</h1>
<figure class="static-figure">${img(coin.image, commAlt(coin), 280, false)}
<figcaption>${coin.joint ? `<p><strong>${esc(t('jointIssue'))}</strong></p>` : ''}
${paragraphs([commDescription(coin)])}
${coin.mintage !== null ? `<p>${esc(mintageText(coin))}</p>` : ''}</figcaption></figure>
${links([...neighbours, [commListPath, `${name} — ${t('commTab')}`], [routes.yearPath(coin.year), t('seoYearTitle', { year: coin.year, count: data.commemorative.filter((c) => c.year === coin.year).length })]])}`
      await write(commPath(coin), {
        ...meta,
        image: coin.image,
        crumbs: [home, countryCrumb, [t('commTab'), commListPath], [`${coin.year} — ${commTitle(coin)}`, commPath(coin)]],
        body,
        jsonld: coinPage(meta, coin.image, commAlt(coin)),
      })
    }
  }

  // ----- une valeur faciale dans tous les pays (page sans appli) -----
  for (const d of data.denominations) {
    const value = valueLabel(t, d.id)
    const meta = { title: t('seoDenomTitle', { value, count: data.countries.length }), description: t('seoDenomDescription', { value }) }
    const entries = countries
      .map((c) => ({ country: c, series: c.series.find((s) => s.index === routes.latestSeriesWith(c, d.id)) }))
      .filter((e) => e.series)
    const hrefOf = (e) => routes.pathOf({ kind: 'coin', iso: e.country.iso, denomination: d.id, series: e.series.index })
    const body = `<h1>${esc(meta.title)}</h1>
<p class="static-lead">${esc(meta.description)}</p>
<ul class="static-coins">${entries
      .map((e) => {
        const count = new Set(e.country.series.map((s) => s.coins[d.id]).filter(Boolean)).size
        return `<li><a href="${esc(hrefOf(e))}">${img(e.series.coins[d.id], coinAlt(e.country, d.id, e.series), 112)}</a>${link(hrefOf(e), esc(nameOf(e.country)))}${
          count > 1 ? `<small>${esc(t('seriesMany', { count }))}</small>` : ''
        }</li>`
      })
      .join('')}</ul>`
    await write(routes.denominationPath(d.id), {
      ...meta,
      image: entries[0]?.series.coins[d.id],
      crumbs: [home, [value, routes.denominationPath(d.id)]],
      body,
      standalone: true,
      jsonld: collection(meta, entries.map((e) => [`${value} – ${nameOf(e.country)}`, hrefOf(e)])),
    })
  }

  // ----- commémoratives par année (pages sans appli) -----
  {
    const meta = { title: t('seoYearsTitle'), description: t('seoYearsDescription', { count: data.commemorative.length, from: years.at(-1) }) }
    const body = `<h1>${esc(meta.title)}</h1>
<p class="static-lead">${esc(meta.description)}</p>
${links(years.map((y) => [routes.yearPath(y), `${y} (${data.commemorative.filter((c) => c.year === y).length})`]))}
<h2>${esc(t('countries'))}</h2>
${links(countries.filter((c) => commFor(c.iso).length).map((c) => [routes.pathOf({ kind: 'commList', iso: c.iso }), nameOf(c)]))}`
    await write(routes.yearsPath(), {
      ...meta,
      image: data.commemorative.findLast((c) => c.image)?.image,
      crumbs: [home, [t('commTab'), routes.yearsPath()]],
      body,
      standalone: true,
      jsonld: collection(meta, years.map((y) => [String(y), routes.yearPath(y)])),
    })
  }
  for (const [i, year] of years.entries()) {
    const coins = data.commemorative
      .filter((c) => c.year === year)
      .sort((a, b) => byName(countryOf(a.country), countryOf(b.country)))
    const meta = { title: t('seoYearTitle', { year, count: coins.length }), description: t('seoYearDescription', { year }) }
    const body = `<h1>${esc(meta.title)}</h1>
<p class="static-lead">${esc(meta.description)}</p>
<ul class="static-coins">${coins.map((c) => commCard(c, { withCountry: true })).join('')}</ul>
${links([years[i + 1] && [routes.yearPath(years[i + 1]), `‹ ${years[i + 1]}`], years[i - 1] && [routes.yearPath(years[i - 1]), `${years[i - 1]} ›`]].filter(Boolean))}`
    await write(routes.yearPath(year), {
      ...meta,
      image: coins.find((c) => c.image)?.image,
      crumbs: [home, [t('commTab'), routes.yearsPath()], [String(year), routes.yearPath(year)]],
      body,
      standalone: true,
      jsonld: collection(meta, coins.filter(commPath).map((c) => [commAlt(c), commPath(c)])),
    })
  }
}

function sitemapXml(entries) {
  const lastmod = data.generatedAt.slice(0, 10)
  const urls = entries.map(
    ({ loc, lang, images }) => `  <url>
    <loc>${esc(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="${lang}" href="${esc(loc)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}" />${images.map((src) => `\n    <image:image><image:loc>${esc(src)}</image:loc></image:image>`).join('')}
  </url>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`
}
