import { useTranslation } from 'react-i18next'
import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdateBanner() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <RefreshCw size={16} />
        <span>{t('update_banner.message')}</span>
      </div>
      <div className="flex gap-2 flex-shrink-0 items-center">
        <button
          onClick={() => updateServiceWorker(true)}
          className="bg-white text-brand-600 font-semibold text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all"
        >
          {t('update_banner.refresh')}
        </button>
        <button onClick={() => setNeedRefresh(false)} className="text-brand-200 px-2 py-1.5"><X size={14} /></button>
      </div>
    </div>
  )
}
