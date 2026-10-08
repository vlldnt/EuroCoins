import { useMemo, useRef, useState } from 'react'
import {
  encodeShare,
  replaceCollection,
  setOwned,
  useCollection,
  type CollectionFilter,
  type CollectionMode,
  type CollectionTab,
} from '../collection'
import { exportCollection, importCollection, type FileFormat, type FileTexts, type ImportResult } from '../collectionFiles'
import { useI18n, type Lang, type Messages } from '../i18n'
import { loadFileTexts } from '../i18n/fileTexts'
import { LANGUAGES } from '../i18n/languages'
import { useCoinTexts } from '../i18n/useCoinTexts'
import { shareUrl } from '../navigation'
import { Segmented } from './Segmented'

// Noms de formats : identiques dans toutes les langues.
const FORMATS: { id: FileFormat; label: string }[] = [
  { id: 'xlsx', label: 'Excel / Google Sheets (.xlsx)' },
  { id: 'csv', label: 'CSV' },
  { id: 'json', label: 'JSON' },
]
const NOTHING: ReadonlySet<string> = new Set()

type Menu = 'export' | 'template'

// Outils de la collection : export, import, modèle vide à remplir à la main, remise à zéro.
export function CollectionTools({ mode }: { mode: CollectionMode }) {
  const { t, lang, languageName } = useI18n()
  const { nameOf, denominationLabel, commTitle } = useCoinTexts()
  const owned = useCollection()
  // Langue du fichier exporté : celle du site, sauf choix contraire (fichier destiné à quelqu'un d'autre).
  const [chosenLang, setChosenLang] = useState<Lang | null>(null)
  const fileLang = chosenLang ?? lang
  const [menu, setMenu] = useState<Menu | null>(null)
  const [busy, setBusy] = useState(false)
  // Fichier lu, en attente du choix « ajouter » ou « remplacer ».
  const [pending, setPending] = useState<ImportResult | null>(null)
  const [notice, setNotice] = useState<keyof Messages | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  // Partage en cours : la vue sur laquelle le lien s'ouvrira (onglet et filtre).
  const [share, setShare] = useState<{ tab: CollectionTab; filter: CollectionFilter } | null>(null)
  // Le lien porte la collection telle qu'elle est à cet instant.
  const link = share && shareUrl(encodeShare(owned, mode, share.tab, share.filter))
  const fileInput = useRef<HTMLInputElement>(null)

  const texts = useMemo<FileTexts>(() => ({ t, nameOf, denominationLabel, commTitle }), [t, nameOf, denominationLabel, commTitle])

  const run = async (task: () => Promise<void>) => {
    setMenu(null)
    setNotice(null)
    setPending(null)
    setConfirmReset(false)
    setShare(null)
    setBusy(true)
    try {
      await task()
    } catch {
      setNotice('collError')
    } finally {
      setBusy(false)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Le même fichier doit pouvoir être choisi deux fois de suite.
    e.target.value = ''
    if (!file) return
    void run(async () => {
      const result = await importCollection(file)
      if (result.ids.length) setPending(result)
      else setNotice('collImportNone')
    })
  }

  // Choisit la vue d'arrivée du lien et le copie ; si la copie est refusée (page non sécurisée,
  // autorisation), le lien reste affiché pour être copié à la main.
  const shareView = (tab: CollectionTab, filter: CollectionFilter) => {
    setShare({ tab, filter })
    void navigator.clipboard?.writeText(shareUrl(encodeShare(owned, mode, tab, filter))).catch(() => {})
  }

  const languages = useMemo(
    () =>
      LANGUAGES.map((l) => ({ code: l.code, name: languageName(l.code, l.code) })).sort((a, b) => a.name.localeCompare(b.name)),
    [languageName],
  )
  const exportTo = (format: FileFormat, source: ReadonlySet<string>) =>
    run(async () => exportCollection(format, source, mode, fileLang === lang ? texts : await loadFileTexts(fileLang)))

  const menuButton = (id: Menu, label: string, source: ReadonlySet<string>) => (
    <div className="coll-menu">
      <button className="coll-button" aria-expanded={menu === id} disabled={busy} onClick={() => setMenu(menu === id ? null : id)}>
        {label}
      </button>
      {menu === id && (
        <div className="coll-menu-list">
          <label className="coll-menu-lang">
            <span>{t('language')}</span>
            <select value={fileLang} onChange={(e) => setChosenLang(e.target.value as Lang)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {FORMATS.filter((f) => id === 'export' || f.id !== 'json').map((f) => (
            <button key={f.id} onClick={() => void exportTo(f.id, source)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="coll-tools">
      <div className="coll-tools-row">
        {menuButton('export', t('collExport'), owned)}
        <button className="coll-button" disabled={busy} onClick={() => fileInput.current?.click()}>
          {t('collImport')}
        </button>
        <input ref={fileInput} type="file" accept=".xlsx,.csv,.json,.txt" hidden onChange={onFile} />
        {menuButton('template', t('collTemplate'), NOTHING)}
        {owned.size > 0 && (
          <button
            className="coll-button"
            disabled={busy}
            aria-expanded={!!share}
            onClick={() => {
              setMenu(null)
              setNotice(null)
              setPending(null)
              setConfirmReset(false)
              shareView('summary', 'all')
            }}
          >
            {t('collShare')}
          </button>
        )}
        {owned.size > 0 && (
          <button className="coll-button is-quiet" disabled={busy} onClick={() => setConfirmReset(true)}>
            {t('collReset')}
          </button>
        )}
      </div>

      <div className="coll-notice" role="status">
        {pending && (
          <>
            <span>{t('collImportFound', { count: pending.ids.length })}</span>
            <button
              className="coll-button is-primary"
              onClick={() => {
                setOwned(pending.ids, true)
                setPending(null)
              }}
            >
              {t('collMerge')}
            </button>
            <button
              className="coll-button"
              onClick={() => {
                replaceCollection(pending.ids)
                setPending(null)
              }}
            >
              {t('collReplace')}
            </button>
            <button className="coll-button is-quiet" onClick={() => setPending(null)}>
              {t('collCancel')}
            </button>
          </>
        )}
        {confirmReset && (
          <>
            <span>{t('collResetConfirm')}</span>
            <button
              className="coll-button is-primary"
              onClick={() => {
                replaceCollection([])
                setConfirmReset(false)
              }}
            >
              {t('collReset')}
            </button>
            <button className="coll-button is-quiet" onClick={() => setConfirmReset(false)}>
              {t('collCancel')}
            </button>
          </>
        )}
        {share && link && (
          <>
            {/* Sur quoi le lien s'ouvre : le résumé, ou un onglet avec son filtre. */}
            <Segmented
              label={t('collShare')}
              value={share.tab}
              onChange={(tab) => shareView(tab, tab === 'summary' ? 'all' : share.filter)}
              options={[
                { id: 'summary', label: t('collSummary') },
                { id: 'regular', label: t('regularTab') },
                { id: 'comm', label: t('commTab') },
              ]}
            />
            {share.tab !== 'summary' && (
              <Segmented
                label={t('collStatus')}
                value={share.filter}
                onChange={(filter) => shareView(share.tab, filter)}
                options={[
                  { id: 'all', label: t('allYears') },
                  { id: 'missing', label: t('collMissing') },
                  { id: 'owned', label: t('collOwned') },
                ]}
              />
            )}
            <span className="coll-share-text">{t('collShareCopied')}</span>
            <input className="coll-link" readOnly value={link} aria-label={t('collShare')} onFocus={(e) => e.target.select()} />
          </>
        )}
        {notice && <span>{t(notice)}</span>}
      </div>
    </div>
  )
}
