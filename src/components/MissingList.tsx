import { useMemo, useState } from 'react'
import type { CollectionMode } from '../collection'
import type { FileTexts } from '../collectionFiles'
import { copyMissing, missingComm, missingRegular } from '../collectionText'
import { Segmented } from './Segmented'

type Kind = 'regular' | 'comm'

// Liste des pièces manquantes à copier (pour la donner à quelqu'un) : pièces courantes ou 2 €
// commémoratives, pays par pays.
export function MissingList({ owned, mode, texts }: { owned: ReadonlySet<string>; mode: CollectionMode; texts: FileTexts }) {
  const { t } = texts
  const [kind, setKind] = useState<Kind>('regular')
  // Sorte de liste qui vient d'être copiée (le message disparaît dès qu'on en change).
  const [copied, setCopied] = useState<Kind | null>(null)
  const [failed, setFailed] = useState(false)
  const countries = useMemo(
    () => (kind === 'regular' ? missingRegular(owned, mode, texts) : missingComm(owned, texts)),
    [kind, owned, mode, texts],
  )
  const heading = `${t('collMissing')} – ${t(kind === 'regular' ? 'regularTab' : 'commTab')}`

  const copy = () => {
    setFailed(false)
    copyMissing(heading, countries).then(
      () => setCopied(kind),
      () => setFailed(true),
    )
  }

  return (
    <>
      <Segmented
        label={t('collMissingList')}
        value={kind}
        onChange={setKind}
        options={[
          { id: 'regular', label: t('regularTab') },
          { id: 'comm', label: t('commTab') },
        ]}
      />
      {countries.length > 0 && (
        <button className="coll-button is-primary" onClick={copy}>
          {t('collCopy')}
        </button>
      )}
      {copied === kind && <span>{t('collCopied')}</span>}
      {failed && <span>{t('collError')}</span>}
      {countries.length ? (
        <div className="coll-missing" tabIndex={0} role="region" aria-label={heading}>
          {countries.map((c) => (
            <section key={c.name}>
              <strong>{c.name}</strong>
              <ul>
                {c.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <span className="coll-share-text">{t('collNothing')}</span>
      )}
    </>
  )
}
