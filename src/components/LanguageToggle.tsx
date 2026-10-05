import { useTranslation } from 'react-i18next'

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const current = i18n.language?.startsWith('en') ? 'en' : 'de'

  return (
    <div className="inline-flex gap-1 p-1 rounded-xl bg-gray-100 text-sm">
      {(['de', 'en'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => i18n.changeLanguage(lang)}
          aria-pressed={current === lang}
          className={`h-9 px-4 rounded-lg transition-colors ${
            current === lang
              ? 'bg-white text-gray-900 font-extrabold shadow-sm'
              : 'text-gray-600 font-semibold hover:text-gray-900'
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
