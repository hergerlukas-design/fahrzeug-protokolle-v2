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
    <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-50 px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-6">
          <img
            src="/logo.webp"
            alt="CarHandling"
            className="h-20 object-contain"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-1">
          Vehicle Protocol Pro
        </h1>
        <p className="text-center text-gray-500 text-sm mb-4">{t('login.subtitle')}</p>

        <div className="flex justify-center mb-6">
          <LanguageToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-4 py-3 rounded-xl border border-gray-300 text-lg tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{t('login.wrong_pin')}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-base hover:bg-brand-700 active:scale-95 transition-all"
          >
            {t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
