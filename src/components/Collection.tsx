import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  DENOMINATION_IDS,
  catalog,
  commIds,
  decodeShare,
  countOwned,
  readCollectionMode,
  regularIds,
  setOwned,
  useCollection,
  writeCollectionMode,
  type CollectionFilter,
  type CollectionMode,
  type CollectionTab,
  type CountryCatalog,
} from '../collection'
import { asset } from '../data'
import { useI18n } from '../i18n'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { CloseIcon } from './CloseIcon'
import { CollectionTools } from './CollectionTools'
import { Flag } from './Flag'
import { LanguageSelect } from './LanguageSelect'
import { Segmented } from './Segmented'
import { useCoinPreview, type PreviewContent } from './useCoinPreview'
import '../collection.css'

type Tab = CollectionTab
type Filter = CollectionFilter

/** La pièce (ou la ligne) passe-t-elle le filtre ? */
const shows = (filter: Filter, has: boolean) => filter === 'all' || (filter === 'owned') === has
/** Une ligne reste affichée tant qu'elle contient au moins une pièce à montrer. */
const rowShows = (filter: Filter, count: number, total: number) =>
  filter === 'all' || (filter === 'owned' ? count > 0 : count < total)

function Progress({ count, total }: { count: number; total: number }) {
  return (
    <span className="coll-progress">
      <span className="coll-progress-text">
        <b>{count}</b> / {total}
      </span>
      <span className="coll-bar" aria-hidden="true">
        <span style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
      </span>
    </span>
  )
}

/** Case qui coche ou décoche un lot de pièces (série, année, pays) ; mixte si le lot est entamé. */
function Check({
  ids,
  owned,
  title,
  readOnly,
  children,
}: {
  ids: string[]
  owned: ReadonlySet<string>
  title: string
  readOnly: boolean
  children?: React.ReactNode
}) {
  const count = countOwned(ids, owned)
  const input = useRef<HTMLInputElement>(null)
  const partial = count > 0 && count < ids.length
  useEffect(() => {
    if (input.current) input.current.indeterminate = partial
  }, [partial])
  // Collection partagée : le libellé seul, sans case.
  if (readOnly) return children ? <span className="coll-check">{children}</span> : null
  return (
    <label className="coll-check" title={title}>
      <input
        ref={input}
        type="checkbox"
        aria-label={children ? undefined : title}
        checked={ids.length > 0 && count === ids.length}
        onChange={(e) => setOwned(ids, e.target.checked)}
      />
      {children}
    </label>
  )
}

// Page « Ma collection » : résumé par pays, pièces courantes (par série ou par année) et 2 €
// commémoratives. Un clic sur une pièce la coche ; tout est gardé dans le navigateur.
// `shared` : code d'un lien de partage ; la collection de ce lien est montrée sans pouvoir être modifiée.
export function Collection({ shared, onMine, onClose }: { shared: string | null; onMine: () => void; onClose: () => void }) {
  const { t } = useI18n()
  const { nameOf, denominationLabel, commTitle } = useCoinTexts()
  // Grande image seule au survol (ordinateur) : on voit bien la pièce avant de la cocher.
  const preview = useCoinPreview()
  const mine = useCollection()
  const received = useMemo(() => (shared ? decodeShare(shared) : null), [shared])
  const owned = received?.ids ?? mine
  const readOnly = !!received
  // Un lien de partage ouvre la vue choisie par son auteur.
  const [tab, setTab] = useState<Tab>(() => received?.tab ?? (owned.size ? 'summary' : 'regular'))
  const [filter, setFilter] = useState<Filter>(() => received?.filter ?? 'all')
  const [mode, setMode] = useState<CollectionMode>(() => received?.mode ?? readCollectionMode())
  // Pays dépliés ou repliés à la main (clé « vue:pays ») ; par défaut, seule la vue par année est repliée.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  // Pays demandé depuis le résumé : on fait défiler jusqu'à lui.
  const jump = useRef<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  const view = tab === 'comm' ? 'comm' : mode
  const openByDefault = view !== 'years'
  const isOpen = (iso: string) => openByDefault !== toggled.has(`${view}:${iso}`)
  const toggle = (key: string) =>
    setToggled((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const lots = useMemo(() => catalog.map((entry) => ({ entry, regular: regularIds(entry, mode), comm: commIds(entry) })), [mode])
  const totals = useMemo(() => {
    const regular = lots.flatMap((l) => l.regular)
    const comm = lots.flatMap((l) => l.comm)
    return { regular, comm, all: [...regular, ...comm] }
  }, [lots])

  // Focus dans la page à l'ouverture, rendu au bouton à la fermeture ; Échap ferme.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      previous?.focus({ preventScroll: true })
    }
  }, [onClose])

  // Après le rendu de l'onglet demandé.
  useEffect(() => {
    if (!jump.current) return
    document.getElementById(`coll-${jump.current}`)?.scrollIntoView({ block: 'start' })
    jump.current = null
  })

  const goTo = (to: Tab, iso: string) => {
    const key = `${to === 'comm' ? 'comm' : mode}:${iso}`
    const closedByDefault = to !== 'comm' && mode === 'years'
    // Le pays demandé est déplié.
    if (toggled.has(key) !== closedByDefault) toggle(key)
    setFilter('all')
    setTab(to)
    jump.current = iso
  }

  const changeMode = (next: CollectionMode) => {
    setMode(next)
    if (!readOnly) writeCollectionMode(next)
  }

  /** Survol : aperçu ; clic : coche ou décoche (l'aperçu se referme). */
  const coinProps = (id: string, has: boolean, content: PreviewContent) => {
    const bound = preview.bind(content)
    return {
      ...bound,
      'aria-pressed': has,
      // Lecture seule : « aria-disabled » et non « disabled », qui couperait aussi le survol.
      'aria-disabled': readOnly,
      onClick: () => {
        bound.onClick()
        if (!readOnly) setOwned([id], !has)
      },
    }
  }

  const section = (entry: CountryCatalog, ids: string[], body: () => React.ReactNode) => {
    const { iso } = entry.country
    const count = countOwned(ids, owned)
    if (ids.length === 0 || !rowShows(filter, count, ids.length)) return null
    const open = isOpen(iso)
    return (
      <section className="coll-country" id={`coll-${iso}`} key={iso}>
        <header className="coll-country-head">
          <button className="coll-country-toggle" aria-expanded={open} onClick={() => toggle(`${view}:${iso}`)}>
            <Flag id={iso} />
            <span className="coll-country-name">{nameOf(entry.country)}</span>
            <Progress count={count} total={ids.length} />
          </button>
          <Check ids={ids} owned={owned} title={t('collCheckAll')} readOnly={readOnly} />
        </header>
        {open && body()}
      </section>
    )
  }

  const seriesBody = (entry: CountryCatalog) =>
    entry.series.map((row) => {
      if (!rowShows(filter, countOwned(row.ids, owned), row.ids.length)) return null
      return (
        <div className="coll-row" key={row.key}>
          <Check ids={row.ids} owned={owned} title={t('collFullSeries')} readOnly={readOnly}>
            <span className="coll-row-name">{t('seriesN', { n: row.series.index })}</span>
            {row.series.since && <small>{t('sinceYear', { year: row.series.since })}</small>}
          </Check>
          <div className="coll-cells">
            {DENOMINATION_IDS.map((d) => {
              const image = row.series.coins[d]
              if (!image) return <span key={d} />
              const id = `${row.key}/${d}`
              const has = owned.has(id)
              return (
                <button
                  key={d}
                  className={`coll-coin${shows(filter, has) ? '' : ' is-filtered'}`}
                  {...coinProps(id, has, { image })}
                >
                  <img src={asset(image)} alt="" loading="lazy" decoding="async" />
                  <span>{denominationLabel(d)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )
    })

  const yearsBody = (entry: CountryCatalog) => (
    <>
      <div className="coll-row is-year is-head" aria-hidden="true">
        <span />
        <div className="coll-cells">
          {DENOMINATION_IDS.map((d) => (
            <span key={d}>{denominationLabel(d)}</span>
          ))}
        </div>
      </div>
      {entry.years.map((row) => {
        if (!rowShows(filter, countOwned(row.ids, owned), row.ids.length)) return null
        return (
          <div className="coll-row is-year" key={row.key}>
            <Check ids={row.ids} owned={owned} title={t('collCheckAll')} readOnly={readOnly}>
              <span className="coll-row-name">{row.year}</span>
            </Check>
            <div className="coll-cells">
              {row.cells.map((id, i) => {
                if (!id) return <span key={i} className="coll-none" />
                const has = owned.has(id)
                return (
                  <button
                    key={i}
                    className={`coll-tick${shows(filter, has) ? '' : ' is-filtered'}`}
                    aria-pressed={has}
                    disabled={readOnly}
                    aria-label={`${row.year} · ${denominationLabel(DENOMINATION_IDS[i])}`}
                    onClick={() => setOwned([id], !has)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )

  const commBody = (entry: CountryCatalog) => (
    <div className="coll-comm-grid">
      {entry.comm.map(({ coin, id }) => {
        const has = owned.has(id)
        if (!shows(filter, has)) return null
        return (
          <button
            key={id}
            className="coll-coin is-comm"
            {...(coin.image
              ? coinProps(id, has, { image: coin.image })
              : { 'aria-pressed': has, 'aria-disabled': readOnly, onClick: () => !readOnly && setOwned([id], !has) })}
          >
            {coin.image ? <img src={asset(coin.image)} alt="" loading="lazy" decoding="async" /> : <span className="coll-no-image" />}
            <b>{coin.year}</b>
            <span>{commTitle(coin)}</span>
          </button>
        )
      })}
    </div>
  )

  const sections =
    tab === 'regular'
      ? lots.map((l) => section(l.entry, l.regular, () => (mode === 'years' ? yearsBody(l.entry) : seriesBody(l.entry))))
      : lots.map((l) => section(l.entry, l.comm, () => commBody(l.entry)))

  return (
    <div className="collection" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={root} onScroll={preview.hide} data-keep-panel>
      <div className="coll-top">
        <div className="coll-inner">
          <div className="coll-title-row">
            <h2 id={titleId}>{t('collection')}</h2>
            <Progress count={countOwned(totals.all, owned)} total={totals.all.length} />
            <LanguageSelect />
            <button ref={closeButton} className="icon-button" onClick={onClose} aria-label={t('close')}>
              <CloseIcon />
            </button>
          </div>
          <div className="coll-controls">
            <Segmented
              className="is-tabs"
              label={t('collection')}
              value={tab}
              onChange={setTab}
              options={[
                { id: 'regular', label: t('regularTab') },
                { id: 'comm', label: t('commTab') },
                { id: 'summary', label: t('collSummary') },
              ]}
            />
            {tab !== 'summary' && (
              <Segmented
                label={t('collStatus')}
                value={filter}
                onChange={setFilter}
                options={[
                  { id: 'all', label: t('allYears') },
                  { id: 'missing', label: t('collMissing') },
                  { id: 'owned', label: t('collOwned') },
                ]}
              />
            )}
            {tab !== 'comm' && (
              <Segmented
                label={t('regularTab')}
                value={mode}
                onChange={changeMode}
                options={[
                  { id: 'series', label: t('collBySeries') },
                  { id: 'years', label: t('collByYear') },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      <div className="coll-inner coll-body">
        {readOnly && (
          <p className="coll-shared">
            <span>{t('collSharedView')}</span>
            <button className="coll-button" onClick={onMine}>
              {t('collMine')}
            </button>
          </p>
        )}
        {tab === 'summary' ? (
          <>
            {!readOnly && <CollectionTools mode={mode} />}
            {!readOnly && <p className="coll-saved">{t('collSaved')}</p>}
            <table className="coll-summary">
              <thead>
                <tr>
                  <th scope="col">{t('countries')}</th>
                  <th scope="col">{t('regularTab')}</th>
                  <th scope="col">{t('commTab')}</th>
                  <th scope="col" className="coll-wide">
                    {t('collTotal')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lots.map(({ entry, regular, comm }) => {
                  const { iso } = entry.country
                  return (
                    <tr key={iso}>
                      <th scope="row">
                        <Flag id={iso} />
                        <span>{nameOf(entry.country)}</span>
                      </th>
                      <td>
                        <button onClick={() => goTo('regular', iso)}>
                          <Progress count={countOwned(regular, owned)} total={regular.length} />
                        </button>
                      </td>
                      <td>
                        {comm.length > 0 && (
                          <button onClick={() => goTo('comm', iso)}>
                            <Progress count={countOwned(comm, owned)} total={comm.length} />
                          </button>
                        )}
                      </td>
                      <td className="coll-wide">
                        <Progress count={countOwned(regular, owned) + countOwned(comm, owned)} total={regular.length + comm.length} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('collTotal')}</th>
                  <td>
                    <Progress count={countOwned(totals.regular, owned)} total={totals.regular.length} />
                  </td>
                  <td>
                    <Progress count={countOwned(totals.comm, owned)} total={totals.comm.length} />
                  </td>
                  <td className="coll-wide">
                    <Progress count={countOwned(totals.all, owned)} total={totals.all.length} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        ) : sections.some(Boolean) ? (
          sections
        ) : (
          <p className="coll-empty">{t('collNothing')}</p>
        )}
      </div>
      {preview.node}
    </div>
  )
}
