// Précalcule les tracés SVG de la carte d'Europe (projection conique conforme)
// pour ne pas embarquer le fond de carte mondial dans le bundle.
// Usage : npm run build-map

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { geoConicConformal, geoPath, geoCentroid } from 'd3-geo'
import { feature } from 'topojson-client'
import world from 'world-atlas/countries-50m.json' with { type: 'json' }
import { COUNTRIES } from './countries.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'src', 'data', 'europe-map.json')
const WIDTH = 1000

// Zone à cadrer : toute la zone euro, de l'ouest du Portugal à Chypre et de Malte au nord de la Finlande.
const FOCUS_POINTS = [
  [-9.8, 36.9], // Cap Saint-Vincent (Portugal)
  [-10.6, 52], // Ouest de l'Irlande
  [14.5, 34.6], // Sous Malte (un peu de mer, voire la côte africaine)
  [35.5, 34.2], // Chypre
  [28.5, 70.1], // Nord de la Finlande
]
// Marge dessinée autour de la zone cadrée, pour que l'écran puisse s'élargir sans laisser de vide
// (on y voit le nord de l'Afrique, la Russie…).
const MARGIN = 0.6
const PADDING = 28

// Pays trop petits pour être cliqués à cette échelle : on ajoute une pastille.
const MICROSTATES = new Set(['ad', 'mc', 'sm', 'va', 'mt', 'lu'])

const byNumeric = new Map(COUNTRIES.map((c) => [c.numeric, c]))
const features = feature(world, world.objects.countries).features

const projection = geoConicConformal()
  .rotate([-12, 0])
  .parallels([38, 62])
  .fitWidth(WIDTH, { type: 'MultiPoint', coordinates: FOCUS_POINTS })

const projected = FOCUS_POINTS.map((p) => projection(p))
const xs = projected.map(([x]) => x)
const ys = projected.map(([, y]) => y)
const focus = {
  x: Math.min(...xs) - PADDING,
  y: Math.min(...ys) - PADDING,
  width: Math.max(...xs) - Math.min(...xs) + 2 * PADDING,
  height: Math.max(...ys) - Math.min(...ys) + 2 * PADDING,
}
const bounds = {
  x: focus.x - focus.width * MARGIN,
  y: focus.y - focus.height * MARGIN,
  width: focus.width * (1 + 2 * MARGIN),
  height: focus.height * (1 + 2 * MARGIN),
}
projection.clipExtent([
  [bounds.x, bounds.y],
  [bounds.x + bounds.width, bounds.y + bounds.height],
])
const round = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]))

const toPath = geoPath(projection).digits(1)
// Les pays hors zone euro ne sont qu'un décor : une précision au pixel suffit.
const toCoarsePath = geoPath(projection).digits(0)

const shapes = features
  .map((f) => {
    const iso = byNumeric.get(String(f.id))?.iso ?? null
    return { iso, d: (iso ? toPath(f) : toCoarsePath(f)) ?? '' }
  })
  .filter((s) => s.d)
  // Les pays de la zone euro sont dessinés en dernier pour que leur contour reste visible.
  .sort((a, b) => Number(!!a.iso) - Number(!!b.iso))

const markers = features
  .filter((f) => MICROSTATES.has(byNumeric.get(String(f.id))?.iso))
  .map((f) => {
    const [x, y] = projection(geoCentroid(f))
    return { iso: byNumeric.get(String(f.id)).iso, x: Math.round(x), y: Math.round(y) }
  })

await writeFile(OUT, JSON.stringify({ focus: round(focus), bounds: round(bounds), shapes, markers }) + '\n')
console.log(`${shapes.length} tracés, ${markers.length} pastilles → ${path.relative(ROOT, OUT)}`)
