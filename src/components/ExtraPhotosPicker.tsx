import { useRef, useState } from 'react'
import { Camera, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PhotoSourceSheet from './PhotoSourceSheet'
import type { ExtraPhoto } from '../lib/extraPhotos'

type Props = {
  items: ExtraPhoto[]
  onChange: (items: ExtraPhoto[]) => void
  accent?: 'brand' | 'green'
}

const ADD_ACCENT = {
  brand: 'border-brand-300 text-brand-700 active:bg-brand-50',
  green: 'border-green-300 text-green-600 active:bg-green-50',
}

/** Weitere Fotos unter "Bemerkungen": beliebig viele, aus Kamera oder Galerie. */
export default function ExtraPhotosPicker({ items, onChange, accent = 'brand' }: Props) {
  const { t } = useTranslation()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState(false)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const stamp = Date.now()
    onChange([
      ...items,
      ...files.map((file, i) => ({ key: `x_${stamp}_${i}`, file, previewUrl: URL.createObjectURL(file) })),
    ])
  }

  function remove(key: string) {
    const item = items.find((p) => p.key === key)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    onChange(items.filter((p) => p.key !== key))
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">{t('extra_photos.hint')}</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, i) => (
          <div key={item.key} className="relative aspect-square">
            <img
              src={item.previewUrl ?? item.url}
              alt={t('extra_photos.label', { count: i + 1 })}
              className="w-full h-full object-cover rounded-xl border border-gray-200"
            />
            <button
              type="button"
              onClick={() => remove(item.key)}
              aria-label={t('damage.remove')}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 bg-gray-50 ${ADD_ACCENT[accent]}`}
        >
          <span className="relative">
            <Camera size={24} />
            <Plus size={12} className="absolute -right-2 -top-1" />
          </span>
          <span className="text-xs text-center px-1">{t('extra_photos.add')}</span>
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

      {picking && (
        <PhotoSourceSheet
          title={t('extra_photos.picker_title')}
          accent={accent}
          onCamera={() => { setPicking(false); cameraRef.current?.click() }}
          onGallery={() => { setPicking(false); galleryRef.current?.click() }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
