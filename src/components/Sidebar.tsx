import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Folder, Route as RouteIcon, Settings } from 'lucide-react'

/** Dieselben Ziele wie die BottomNav auf dem Telefon – das Archiv steht in
 *  den Einstellungen. */
const ITEMS = [
  { to: '/heute', icon: Home, labelKey: 'nav.today' },
  { to: '/ueberfuehrungen', icon: RouteIcon, labelKey: 'nav.transfers' },
  { to: '/fahrzeuge', icon: Folder, labelKey: 'nav.projects' },
  { to: '/einstellungen', icon: Settings, labelKey: 'nav.settings' },
]

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <nav className="flex-1 px-2 py-2 space-y-1">
      {ITEMS.map(({ to, icon: Icon, labelKey }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
            }`
          }
        >
          <Icon size={20} className="flex-shrink-0" />
          <span className="truncate">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}

/** Impressum and Datenschutz live outside the app shell, so following them
 *  unmounts this sidebar — both pages carry their own back arrow. */
function LegalLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="border-t border-gray-100 px-4 py-3 flex flex-col items-start gap-2">
      <NavLink to="/impressum" onClick={onNavigate} className="text-xs text-gray-400 hover:text-gray-600">
        {t('settings.impressum')}
      </NavLink>
      <NavLink to="/datenschutz" onClick={onNavigate} className="text-xs text-gray-400 hover:text-gray-600">
        {t('settings.privacy')}
      </NavLink>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <img
        src="/logo.webp"
        alt=""
        className="w-7 h-7 object-contain flex-shrink-0"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      <span className="font-bold text-gray-900 text-sm truncate">Vehicle Protocol Pro</span>
    </div>
  )
}

/** Feste Seitenleiste ab md. Auf dem Telefon übernimmt die BottomNav. */
export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="pt-[env(safe-area-inset-top)]" />
      <Brand />
      <NavItems />
      <LegalLinks />
    </aside>
  )
}
