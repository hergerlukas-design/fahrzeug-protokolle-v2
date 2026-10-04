import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const TABS = [
  { to: '/fahrzeuge', labelKey: 'nav.vehicles' },
  { to: '/zeitstrahl', labelKey: 'nav.timeline' },
]

/**
 * Umschalter oben in Projekte: Fahrzeuge oder Zeitstrahl. Beides sind
 * Ansichten auf dieselben Fahrzeuge – der Zeitstrahl ist die Auswertung
 * (Lagertage, Tage draußen) und braucht deshalb keinen eigenen Reiter unten.
 */
export default function ProjekteSwitch() {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-200 mb-3">
      {TABS.map(({ to, labelKey }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `h-9 rounded-lg flex items-center justify-center text-sm ${
              isActive ? 'bg-white text-gray-900 font-extrabold shadow-sm' : 'text-gray-600 font-semibold'
            }`
          }
        >
          {t(labelKey)}
        </NavLink>
      ))}
    </div>
  )
}
