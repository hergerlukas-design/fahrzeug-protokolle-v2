import { useState, useEffect } from 'react'

const SLIDES = [
  {
    icon: '🚗',
    title: 'Willkommen bei\nVehicle Protocol Pro',
    text: 'Dein digitales Übergabeprotokoll für Fahrzeuge — schnell, übersichtlich und auch offline nutzbar.',
  },
  {
    icon: '📁',
    title: 'Fahrzeuge & Projekte',
    text: 'Organisiere Fahrzeuge in Projektordnern. Tippe auf ein Projekt, um alle zugehörigen Fahrzeuge zu sehen.',
  },
  {
    icon: '📋',
    title: 'Protokoll erstellen',
    text: 'Erstelle Annahme- oder Überführungsprotokolle direkt am Fahrzeug — mit Fotos, Schadensdokumentation und Unterschrift.',
  },
  {
    icon: '📄',
    title: 'PDF exportieren',
    text: 'Fertige Protokolle lassen sich als PDF speichern oder teilen. Fotos und Unterschriften werden direkt eingebettet.',
  },
  {
    icon: '📶',
    title: 'Auch offline',
    text: 'Die App funktioniert auch ohne Internet. Protokolle werden automatisch synchronisiert, sobald du wieder online bist.',
  },
]

const STORAGE_KEY = 'vp_onboarding_done'
export const TUTORIAL_EVENT = 'vp-open-tutorial'

export default function OnboardingOverlay() {
  const [open, setOpen] = useState(() => !localStorage.getItem(STORAGE_KEY))
  const [step, setStep] = useState(0)

  useEffect(() => {
    function handleReopen() {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(TUTORIAL_EVENT, handleReopen)
    return () => window.removeEventListener(TUTORIAL_EVENT, handleReopen)
  }, [])

  if (!open) return null

  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1

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
          Überspringen
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
          {SLIDES.map((_, i) => (
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
          {isLast ? "Los geht's" : 'Weiter'}
        </button>
      </div>
    </div>
  )
}
