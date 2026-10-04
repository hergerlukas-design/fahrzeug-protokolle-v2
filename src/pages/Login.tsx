import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { login } from '../lib/auth'
import LanguageToggle from '../components/LanguageToggle'

export default function Login() {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (login(pin)) {
      navigate('/ueberfuehrung', { replace: true })
    } else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-white px-8">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <img
            src="/carhandling.png"
            alt="CarHandling"
            className="h-32 object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-center text-gray-900 mb-1">
          Vehicle Protocol Pro
        </h1>
        <p className="text-center text-gray-600 text-[15px] font-semibold mb-4">{t('login.subtitle')}</p>

        <div className="flex justify-center mb-6">
          <LanguageToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {t('login.pin_label')}
            </label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setError(false)
              }}
              className="w-full h-14 px-4 rounded-2xl border-0 bg-gray-100 text-2xl font-bold tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{t('login.wrong_pin')}</p>
          )}

          <button
            type="submit"
            className="w-full h-14 rounded-2xl bg-brand-700 text-white font-extrabold text-base hover:bg-brand-800 active:scale-[0.98] transition-all"
          >
            {t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
