import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Folder, Plus, Settings } from 'lucide-react'
import { CREATE_EVENT } from './CreateWizard'

export default function BottomNav() {
  const { t } = useTranslation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex max-w-2xl mx-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <NavLink
        to="/fahrzeuge"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
            isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-700'
          }`
        }
      >
        <Folder size={22} />
        <span className="text-xs leading-tight">{t('nav.projects')}</span>
      </NavLink>

      <button
        onClick={() => window.dispatchEvent(new CustomEvent(CREATE_EVENT))}
        className="flex-1 flex flex-col items-center justify-center py-1 gap-0.5 text-gray-400"
      >
        <span className="w-11 h-11 bg-brand-600 rounded-full flex items-center justify-center text-white -mt-4 shadow-lg">
          <Plus size={24} strokeWidth={2.5} />
        </span>
        <span className="text-xs leading-tight">{t('nav.create')}</span>
      </button>

      <NavLink
        to="/einstellungen"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
            isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-700'
          }`
        }
      >
        <Settings size={22} />
        <span className="text-xs leading-tight">{t('nav.settings')}</span>
      </NavLink>
    </nav>
  )
}
