import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Route as RouteIcon, Folder, Settings, Plus } from 'lucide-react'
import { CREATE_EVENT } from './CreateWizard'

const LEFT = [
  { to: '/heute', icon: Home, labelKey: 'nav.today' },
  { to: '/ueberfuehrungen', icon: RouteIcon, labelKey: 'nav.transfers_short' },
]
const RIGHT = [
  { to: '/fahrzeuge', icon: Folder, labelKey: 'nav.projects' },
  { to: '/einstellungen', icon: Settings, labelKey: 'nav.settings' },
]

/** Der Zeitstrahl ist eine Ansicht in Projekte – dort bleibt der Reiter markiert. */
const ALSO_ACTIVE: Record<string, string[]> = { '/fahrzeuge': ['/zeitstrahl'] }

function Item({ to, icon: Icon, labelKey }: (typeof LEFT)[number]) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const extra = (ALSO_ACTIVE[to] ?? []).some((p) => pathname.startsWith(p))
  return (
    <NavLink
      to={to}
      className={({ isActive: routeActive }) => {
        const isActive = routeActive || extra
        return `flex flex-col items-center justify-center gap-1 min-h-[48px] min-w-0 text-[11px] leading-none ${
          isActive ? 'text-brand-700 font-extrabold' : 'text-gray-500 font-semibold'
        }`
      }}
    >
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive || extra ? 2.4 : 2} />
          <span className="truncate max-w-full">{t(labelKey)}</span>
        </>
      )}
    </NavLink>
  )
}

/** In den Protokollen hat der Assistent unten seine eigene Leiste. */
const HIDDEN_ON = ['/ueberfuehrung', '/annahme']

/**
 * Leiste unten auf dem Telefon – ersetzt dort den Hamburger. Die Hauptwege
 * liegen so unter dem Daumen; Archiv, Sprache und Rechtliches stehen in den
 * Einstellungen. In der Mitte der Plus-Knopf, der früher frei schwebte.
 * Ab md übernimmt die feste Seitenleiste.
 */
export default function BottomNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  if (HIDDEN_ON.includes(pathname)) return null
  return (
    <nav
      className="md:hidden flex-shrink-0 bg-white border-t border-gray-200 grid grid-cols-5 items-end px-2 pt-1.5"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
    >
      {LEFT.map((item) => <Item key={item.to} {...item} />)}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(CREATE_EVENT))}
        aria-label={t('nav.create')}
        className="justify-self-center -mt-5 w-14 h-14 rounded-2xl bg-brand-700 text-white shadow-lg shadow-brand-700/30 flex items-center justify-center active:bg-brand-800 active:scale-95 transition-transform"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>
      {RIGHT.map((item) => <Item key={item.to} {...item} />)}
    </nav>
  )
}
