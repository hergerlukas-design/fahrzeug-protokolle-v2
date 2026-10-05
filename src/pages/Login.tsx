import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, Delete } from 'lucide-react'
import { login } from '../lib/auth'
import LanguageToggle from '../components/LanguageToggle'

/** Länger wird kein PIN – schützt nur davor, dass die Punkte aus dem Bild laufen. */
const MAX_LENGTH = 12
/** So viele Punkte stehen mindestens da, auch bevor getippt wird. */
const MIN_DOTS = 4

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function Login() {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  function enter(value: string) {
    if (login(value)) {
      navigate('/heute', { replace: true })
      return true
    }
    return false
  }

  function type(char: string) {
    if (pin.length >= MAX_LENGTH) return
    const next = pin + char
    setError(false)
    setPin(next)
    // Stimmt der PIN, geht es ohne weiteren Tipp hinein. Ein falscher wird
    // erst beim Bestätigen gemeldet – sonst stünde nach jeder Ziffer ein Fehler da.
    if (next.length >= MIN_DOTS) enter(next)
  }

  function erase() {
    setError(false)
    setPin((p) => p.slice(0, -1))
  }

  function submit() {
    if (!pin) return
    if (!enter(pin)) {
      setError(true)
      setPin('')
    }
  }

  // Am Rechner geht der PIN auch über die Tastatur.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Backspace') erase()
      else if (e.key === 'Enter') submit()
      else if (e.key.length === 1 && e.key !== ' ') type(e.key)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const dots = Math.max(MIN_DOTS, pin.length)
  const key = 'h-16 rounded-2xl text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform'

  return (
    <div className="flex flex-col items-center min-h-dvh bg-white px-8 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex-1 w-full max-w-[300px] flex flex-col items-center justify-center gap-7">
        <img
          src="/carhandling.png"
          alt="CarHandling"
          className="h-28 object-contain"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />

        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Vehicle Protocol Pro</h1>
          <p className="text-[15px] font-semibold text-gray-600">
            {t('login.subtitle')} · {t('login.pin_label')}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div
            className={`flex gap-3.5 ${error ? 'animate-[shake_0.3s] motion-reduce:animate-none' : ''}`}
            role="status"
            aria-label={t('login.pin_entered', { count: pin.length })}
          >
            {Array.from({ length: dots }, (_, i) => (
              <span
                key={i}
                className={`w-3.5 h-3.5 rounded-full ${
                  i < pin.length ? 'bg-brand-700' : error ? 'border-2 border-red-500' : 'border-2 border-gray-400'
                }`}
              />
            ))}
          </div>
          <p className={`text-sm font-semibold text-red-600 h-5 ${error ? '' : 'invisible'}`} aria-live="polite">
            {error ? t('login.wrong_pin') : ''}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3.5 w-full">
          {DIGITS.map((d) => (
            <button key={d} type="button" onClick={() => type(d)} className={`${key} bg-gray-100 text-gray-900 active:bg-gray-200`}>
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={submit}
            disabled={!pin}
            aria-label={t('login.submit')}
            className={`${key} bg-brand-700 text-white active:bg-brand-800 disabled:opacity-30`}
          >
            <Check size={26} strokeWidth={2.5} />
          </button>
          <button type="button" onClick={() => type('0')} className={`${key} bg-gray-100 text-gray-900 active:bg-gray-200`}>
            0
          </button>
          <button
            type="button"
            onClick={erase}
            disabled={!pin}
            aria-label={t('login.erase')}
            className={`${key} text-gray-900 active:bg-gray-100 disabled:opacity-30`}
          >
            <Delete size={26} />
          </button>
        </div>

        <LanguageToggle />
      </div>

      <div className="flex gap-5 text-[13px] font-semibold">
        <Link to="/impressum" className="text-brand-700">{t('settings.impressum')}</Link>
        <Link to="/datenschutz" className="text-brand-700">{t('settings.privacy')}</Link>
      </div>
    </div>
  )
}
