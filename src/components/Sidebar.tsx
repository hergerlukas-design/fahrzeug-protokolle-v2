import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Folder, Archive, Settings, X } from 'lucide-react'

/** Dispatched by the hamburger in PageHeader — same event idiom as
 *  CREATE_EVENT, so no state has to be threaded through the page components. */
export const SIDEBAR_EVENT = 'vp-open-sidebar'

const ITEMS = [
  { to: '/fahrzeuge', icon: Folder, labelKey: 'nav.projects' },
  { to: '/archiv', icon: Archive, labelKey: 'nav.archive' },
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

export default function Sidebar() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handler() {
      setOpen(true)
    }
    window.addEventListener(SIDEBAR_EVENT, handler)
    return () => window.removeEventListener(SIDEBAR_EVENT, handler)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Permanent rail from md up — the phone column stays centered next to it */}
      <aside className="hidden md:flex md:w-60 md:flex-shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="pt-[env(safe-area-inset-top)]" />
        <Brand />
        <NavItems />
        <LegalLinks />
      </aside>

      {/* Drawer below md. Sits above the bottom sheets (z-40) but below the
          onboarding overlay (z-[70]). */}
      {open && (
        <div className="md:hidden">
          <div className="fixed inset-0 bg-black/40 z-[65]" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-[66] w-64 max-w-[80vw] bg-white shadow-2xl flex flex-col">
            <div className="pt-[env(safe-area-inset-top)]" />
            <div className="flex items-start justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.close')}
                className="p-3 text-gray-400 hover:text-gray-700 flex-shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            <NavItems onNavigate={() => setOpen(false)} />
            <div className="pb-[env(safe-area-inset-bottom)]">
              <LegalLinks onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
