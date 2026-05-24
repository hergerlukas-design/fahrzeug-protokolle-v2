import { useTranslation } from 'react-i18next'

export default function LanguageToggle() {
  const { i18n } = useTranslation()
  const current = i18n.language?.startsWith('en') ? 'en' : 'de'

  return (
    <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden text-sm font-semibold">
      {(['de', 'en'] as const).map((lang, idx) => (
        <button
          key={lang}
          type="button"
          onClick={() => i18n.changeLanguage(lang)}
          className={`px-3 py-1.5 transition-colors ${idx > 0 ? 'border-l border-gray-200' : ''} ${
            current === lang
              ? 'bg-red-600 text-white'
              : 'bg-white text-gray-500 hover:bg-gray-50'
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
