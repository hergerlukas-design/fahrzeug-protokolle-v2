import { useTranslation } from 'react-i18next'
import { Warehouse } from 'lucide-react'
import { CAMPUS_LABEL, isCampus } from '../lib/timeline'

/**
 * Knopf "Campus" neben einem Ortsfeld.
 *
 * Der Zeitstrahl muss aus dem Ort lesen, ob ein Fahrzeug auf den Campus kam
 * oder ihn verließ – und der Campus hieß in den Protokollen jedes Mal anders
 * ("CarHndling Campus", "Carhandling Cambus"). Der Knopf trägt ihn immer
 * gleich ein. Ist der Ort schon der Campus, leert ein zweiter Tipp das Feld.
 */
export default function CampusChip({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const on = isCampus(value)
  return (
    <button
      type="button"
      onClick={() => onChange(on ? '' : CAMPUS_LABEL)}
      aria-pressed={on}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
        on ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-300 active:bg-gray-50'
      }`}
    >
      <Warehouse size={12} /> {t('common.campus')}
    </button>
  )
}
