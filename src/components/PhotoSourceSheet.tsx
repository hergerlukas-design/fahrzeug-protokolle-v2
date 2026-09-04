import { useEffect } from 'react'
import { Camera, Image, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  title: string
  accent?: 'brand' | 'green'
  onCamera: () => void
  onGallery: () => void
  onClose: () => void
}

const ACCENT = {
  brand: 'bg-brand-50 border-brand-200 text-brand-700 active:bg-brand-100',
  green: 'bg-green-50 border-green-200 text-green-700 active:bg-green-100',
}

export default function PhotoSourceSheet({ title, accent = 'brand', onCamera, onGallery, onClose }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-t-2xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-semibold text-gray-800">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCamera}
            className={`py-4 rounded-xl border font-medium text-sm flex flex-col items-center justify-center gap-1.5 ${ACCENT[accent]}`}
          >
            <Camera size={22} /> {t('damage.camera')}
          </button>
          <button
            type="button"
            onClick={onGallery}
            className="py-4 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 font-medium text-sm active:bg-gray-100 flex flex-col items-center justify-center gap-1.5"
          >
            <Image size={22} /> {t('damage.gallery')}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-3 rounded-xl text-sm font-medium text-gray-500 active:bg-gray-50"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
