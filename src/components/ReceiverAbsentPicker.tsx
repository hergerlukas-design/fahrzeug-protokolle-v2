import { useTranslation } from 'react-i18next'
import { KeyRound } from 'lucide-react'
import { RECEIVER_ABSENT_REASONS, type ReceiverAbsent } from '../lib/protocols'

/**
 * "Empfänger nicht anwesend": statt der Unterschrift wird festgehalten, wo der
 * Schlüssel ist. Ein Schalter, darunter die üblichen Orte und eine Notiz.
 * `value === null` heißt: der Empfänger unterschreibt wie gewohnt.
 */
export default function ReceiverAbsentPicker({
  value,
  onChange,
}: {
  value: ReceiverAbsent | null
  onChange: (value: ReceiverAbsent | null) => void
}) {
  const { t } = useTranslation()
  const on = value !== null
  const needsNote = value?.reason === 'other' && !value.note?.trim()

  return (
    <div className={`rounded-xl border ${on ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <label className="flex items-center gap-3 px-3 py-3 cursor-pointer">
        <KeyRound size={18} className={on ? 'text-amber-700' : 'text-gray-500'} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-gray-900">{t('receiver_absent.toggle')}</span>
          <span className="block text-xs font-medium text-gray-600">{t('receiver_absent.toggle_hint')}</span>
        </span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? { reason: 'mailbox' } : null)}
          className="w-5 h-5 accent-amber-600 flex-shrink-0"
        />
      </label>

      {on && (
        <div className="px-3 pb-3 space-y-3">
          <fieldset>
            <legend className="text-xs font-bold text-gray-700 mb-1.5">{t('receiver_absent.where')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {RECEIVER_ABSENT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={value.reason === r}
                  onClick={() => onChange({ ...value, reason: r })}
                  className={`min-h-[44px] px-2 rounded-xl text-sm text-left leading-tight ${
                    value.reason === r
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-white border border-amber-200 text-gray-800 font-semibold'
                  }`}
                >
                  {t(`receiver_absent.reason_${r}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="block text-xs font-bold text-gray-700 mb-1.5">
              {t('receiver_absent.note_label')}
              {value.reason !== 'other' && <span className="font-medium text-gray-500"> ({t('receiver_absent.optional')})</span>}
            </span>
            <textarea
              rows={2}
              value={value.note ?? ''}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              placeholder={t('receiver_absent.note_placeholder')}
              className="w-full bg-white border border-amber-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>
          {needsNote && <p className="text-xs font-semibold text-amber-800">{t('receiver_absent.note_required')}</p>}
          <p className="text-xs font-medium text-gray-600">{t('receiver_absent.photo_tip')}</p>
        </div>
      )}
    </div>
  )
}
