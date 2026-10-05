import { useTranslation } from 'react-i18next'
import { Camera, Check, X } from 'lucide-react'

/**
 * Bausteine der Protokoll-Assistenten (Überführung, Annahme): Fortschritt in
 * Segmenten, Schritt-Titel mit kurzer Anleitung, Fotokacheln und die feste
 * Leiste unten. Jedes Protokoll behält seine Farbe – grün die Überführung,
 * Markenrot die Annahme.
 */
export type WizardAccent = 'brand' | 'green'

const ACCENT = {
  brand: {
    bar: 'bg-brand-700',
    primary: 'bg-brand-700 active:bg-brand-800',
    current: 'border-brand-700 bg-brand-50 text-brand-800',
  },
  green: {
    bar: 'bg-green-700',
    primary: 'bg-green-700 active:bg-green-800',
    current: 'border-green-700 bg-green-50 text-green-800',
  },
} as const

/** Der große Knopf rechts in der Leiste: Weiter bzw. Speichern. */
export function WizardPrimary({ accent, className = '', ...props }: { accent: WizardAccent } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`flex-1 h-[54px] rounded-2xl text-white font-extrabold text-base disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${ACCENT[accent].primary} ${className}`}
    />
  )
}

/** Fortschritt als Segmente, ein Segment je Schritt – für den Kopf der Seite. */
export function WizardProgress({ step, total, accent }: { step: number; total: number; accent: WizardAccent }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-colors duration-300 ${i <= step ? ACCENT[accent].bar : 'bg-gray-200'}`}
        />
      ))}
    </div>
  )
}

/** Groß der Name des Schritts, darunter in einem Satz, was zu tun ist. */
export function WizardIntro({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 pt-5 flex flex-col gap-1">
      <h2 className="text-[22px] font-extrabold tracking-tight text-gray-900 leading-tight">{title}</h2>
      {hint && <p className="text-[15px] font-medium text-gray-600 leading-snug">{hint}</p>}
    </div>
  )
}

/**
 * Feste Leiste unten: Zurück und Weiter bleiben unter dem Daumen, egal wie
 * lang der Schritt ist. `sticky` statt `fixed`, damit sie in der Spalte der
 * Seite bleibt – am Desktop steht daneben die Seitenleiste.
 */
export function WizardFooter({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <>
    {/* Abstand zum Inhalt; bei kurzen Schritten schiebt mt-auto die Leiste nach unten. */}
    <div className="h-6 flex-shrink-0" />
    <div
      className="sticky bottom-0 z-10 mt-auto bg-white border-t border-gray-200 px-4 pt-3"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="flex gap-2">{children}</div>
      {note}
    </div>
    </>
  )
}

/**
 * Fotofeld mit drei Zuständen: erledigt (Foto mit grünem Haken), gerade dran
 * (Rahmen in der Farbe des Protokolls – das erste noch offene Feld) und offen
 * (gestrichelt).
 */
export function PhotoTile({
  label, src, current, accent, onPick, onRemove,
}: {
  label: string
  src: string | null
  current: boolean
  accent: WizardAccent
  onPick: () => void
  onRemove?: () => void
}) {
  const { t } = useTranslation()
  if (src) {
    return (
      <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-gray-800">
        <img src={src} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-6 pb-2">
          <span className="text-[13px] font-extrabold text-white">{label}</span>
        </div>
        <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center">
          <Check size={14} strokeWidth={3} />
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('common.delete')}
            className="absolute top-1 right-1 w-9 h-9 rounded-full flex items-center justify-center"
          >
            <span className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X size={15} />
            </span>
          </button>
        )}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full aspect-[4/3] rounded-2xl flex flex-col items-center justify-center gap-1.5 text-sm transition-colors ${
        current
          ? `border-2 font-extrabold ${ACCENT[accent].current}`
          : 'border-[1.5px] border-dashed border-gray-400 bg-gray-50 text-gray-700 font-semibold active:bg-gray-100'
      }`}
    >
      <Camera size={26} strokeWidth={2} />
      {label}
    </button>
  )
}
