import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { CREATE_EVENT } from './CreateWizard'

/**
 * The create button the bottom nav used to carry.
 *
 * Positioned absolute inside the content column (not fixed to the viewport),
 * so it stays with the phone column when the permanent sidebar shifts it on
 * wide screens. z-20 puts it above the page content and its sticky headers
 * (z-10) but below every sheet overlay (z-30) — an opening bottom sheet
 * therefore covers it without any extra state.
 */
export default function FabCreate() {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(CREATE_EVENT))}
      aria-label={t('nav.create')}
      className="absolute right-4 bottom-4 z-20 w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center active:bg-brand-700 active:scale-95 transition-transform"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  )
}
