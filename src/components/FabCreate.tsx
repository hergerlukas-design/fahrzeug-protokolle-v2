import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { CREATE_EVENT } from './CreateWizard'

/**
 * The floating create button for wide screens. On the phone the plus sits
 * in the middle of the BottomNav instead.
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
      className="hidden md:flex absolute right-4 bottom-4 z-20 w-14 h-14 rounded-full bg-brand-700 text-white shadow-lg items-center justify-center active:bg-brand-800 active:scale-95 transition-transform"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  )
}
