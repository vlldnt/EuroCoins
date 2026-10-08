import { useI18n } from '../i18n'

// Bouton d'en-tête qui ouvre la page « Ma collection ».
export function CollectionButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n()
  return (
    <button className="collection-trigger" onClick={onOpen} aria-haspopup="dialog" aria-label={t('collection')}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l3 3 5-6" />
      </svg>
      <span className="collection-trigger-label">{t('collection')}</span>
    </button>
  )
}
