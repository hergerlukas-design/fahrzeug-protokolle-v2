import { NavLink } from 'react-router-dom'

const TABS = [
  { path: '/fahrzeuge', label: 'Fahrzeuge', icon: '🚗' },
  { path: '/archiv', label: 'Archiv', icon: '🔍' },
  { path: '/einstellungen', label: 'Einstellungen', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              isActive ? 'text-brand-600' : 'text-gray-500'
            }`
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span className="text-xs leading-tight">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
