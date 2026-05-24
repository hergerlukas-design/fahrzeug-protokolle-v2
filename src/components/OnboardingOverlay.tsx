import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'vp_onboarding_done'
export const TUTORIAL_EVENT = 'vp-open-tutorial'

export default function OnboardingOverlay() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => !localStorage.getItem(STORAGE_KEY))
  const [step, setStep] = useState(0)

  const slides = t('onboarding.slides', { returnObjects: true }) as Array<{
    icon: string
    title: string
    text: string
  }>

  useEffect(() => {
    function handleReopen() {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(TUTORIAL_EVENT, handleReopen)
    return () => window.removeEventListener(TUTORIAL_EVENT, handleReopen)
  }, [])

  if (!open) return null

  const slide = slides[step]
  const isLast = step === slides.length - 1

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={dismiss}
          className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1"
        >
          {t('onboarding.skip')}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
        <div className="text-7xl">{slide.icon}</div>
        <h2 className="text-2xl font-bold text-gray-900 whitespace-pre-line leading-tight">
          {slide.title}
        </h2>
        <p className="text-base text-gray-500 leading-relaxed max-w-xs">
          {slide.text}
        </p>
      </div>

      <div className="px-6 pb-10 flex flex-col items-center gap-6">
        <div className="flex gap-2 items-center">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`inline-block rounded-full transition-all duration-300 ${
                i === step ? 'w-5 h-2 bg-brand-600' : 'w-2 h-2 bg-gray-300'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
          className="w-full max-w-xs py-4 rounded-2xl bg-brand-600 text-white font-semibold text-lg active:scale-95 transition-transform"
        >
          {isLast ? t('onboarding.start') : t('onboarding.next')}
        </button>
      </div>
    </div>
  )
}
