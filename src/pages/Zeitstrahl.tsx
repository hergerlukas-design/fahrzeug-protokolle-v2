import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Download, GanttChart, Pencil, Trash2, Users } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ProjekteSwitch from '../components/ProjekteSwitch'
import { SkeletonList } from '../components/Skeleton'
import { errorText } from '../lib/supabase'
import {
  addCorrection,
  addDays,
  berlinDay,
  buildSegments,
  countNights,
  dayCells,
  daysBetween,
  deleteCorrection,
  fetchTimelineData,
  longAbsence,
  type CorrectionKind,
  type DayCell,
  type NightCounts,
  type Segment,
  type TimelineData,
  type TimelineVehicle,
} from '../lib/timeline'

type Span = 'month' | 'quarter' | 'custom'

interface Row {
  vehicle: TimelineVehicle
  segments: Segment[]
  cells: DayCell[]
  counts: NightCounts
  absence: number | null
}

interface Group {
  id: string
  name: string
  color: string | null
  rows: Row[]
  counts: NightCounts
}

const NO_CUSTOMER = '__none__'

/** Die zuletzt gewählten Kunden – nur eine Bequemlichkeit, deshalb darf der
 *  Speicher fehlen oder leer sein. */
const SELECTION_KEY = 'vp_timeline_customers'

function loadSelection(): string[] {
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveSelection(ids: string[]) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(ids))
  } catch {
    // Privater Modus o.ä. – dann eben ohne Gedächtnis.
  }
}

/** Erster und letzter Tag des Zeitraums, der im Monat `anchor` (YYYY-MM) beginnt. */
function rangeOf(anchor: string, span: Span): { from: string; to: string } {
  const from = `${anchor}-01`
  const months = span === 'month' ? 1 : 3
  const [y, m] = anchor.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10)
  return { from, to: addDays(next, -1) }
}

/** Wie lang ein frei gewählter Zeitraum höchstens sein darf – drei Jahre. Mehr
 *  liest niemand aus einem Balken, und beim Tippen eines Datums entstehen
 *  kurz Jahre wie 0002, die sonst Millionen Tage erzeugten. */
const MAX_RANGE_DAYS = 3 * 366

/** Ab wie vielen Tagen der Balken ohne Lücken zwischen den Tagen gezeichnet wird. */
const DENSE_FROM_DAYS = 45

function isPlausibleDay(day: string): boolean {
  const y = Number(day.slice(0, 4))
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && y >= 2000 && y <= 2100
}

function shiftMonth(anchor: string, n: number): string {
  const [y, m] = anchor.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

function sum(counts: NightCounts[]): NightCounts {
  return counts.reduce(
    (a, c) => ({ campus: a.campus + c.campus, extern: a.extern + c.extern, unklar: a.unklar + c.unklar }),
    { campus: 0, extern: 0, unklar: 0 }
  )
}

function fmt(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}.${m}.`
}

/** Die Farbe eines Tages. Bewegt wurde das Fahrzeug an einem Tag "unterwegs" –
 *  gezählt wird trotzdem die Nacht. */
function cellClass(c: DayCell): string {
  const base =
    c.night === 'ausserhalb'
      ? 'bg-gray-100'
      : c.moved
      ? 'bg-amber-400'
      : c.night === 'campus'
      ? 'bg-green-500'
      : c.night === 'extern'
      ? 'bg-sky-400'
      : 'bg-red-400'
  return c.planned && c.night !== 'ausserhalb' ? `${base} opacity-40` : base
}

function Bar({ cells, today, dense }: { cells: DayCell[]; today: string; dense: boolean }) {
  if (dense) {
    // Lange Zeiträume: gleiche Tage am Stück als ein Block, sonst stünden bei
    // einem Jahr 365 Elemente je Zeile im Dokument.
    const runs: { cls: string; n: number; key: string }[] = []
    for (const c of cells) {
      const cls = cellClass(c)
      const last = runs[runs.length - 1]
      if (last && last.cls === cls) last.n++
      else runs.push({ cls, n: 1, key: c.day })
    }
    const todayAt = cells.findIndex((c) => c.day === today)
    return (
      <div className="relative flex h-3 rounded overflow-hidden">
        {runs.map((r) => (
          <div key={r.key} className={r.cls} style={{ flexGrow: r.n, flexBasis: 0 }} />
        ))}
        {todayAt >= 0 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-gray-900"
            style={{ left: `${((todayAt + 0.5) / cells.length) * 100}%` }}
          />
        )}
      </div>
    )
  }
  return (
    <div className={`flex h-3 ${dense ? '' : 'gap-px'}`}>
      {cells.map((c) => (
        <div
          key={c.day}
          className={`flex-1 min-w-0 first:rounded-l last:rounded-r ${cellClass(c)} ${
            c.day === today ? 'ring-2 ring-gray-900 ring-inset' : ''
          }`}
        />
      ))}
    </div>
  )
}

/** Tageszahlen bzw. Monatsanfänge über den Balken. */
function Axis({ days, dense, locale }: { days: string[]; dense: boolean; locale: string }) {
  if (dense) {
    // Ein Block je Monat, so breit wie seine Tage im Zeitraum. Bei mehr als
    // gut einem Jahr steht nur noch an jedem Quartalsanfang eine Beschriftung.
    const months: { key: string; n: number }[] = []
    for (const d of days) {
      const key = d.slice(0, 7)
      const last = months[months.length - 1]
      if (last && last.key === key) last.n++
      else months.push({ key, n: 1 })
    }
    const sparse = months.length > 14
    return (
      <div className="flex text-[9px] text-gray-400 leading-none h-3">
        {months.map((m, i) => {
          const month = Number(m.key.slice(5))
          const show = !sparse || month % 3 === 1
          const withYear = i === 0 || month === 1
          const label = new Date(`${m.key}-01T00:00:00Z`).toLocaleDateString(locale, {
            month: 'short',
            ...(withYear ? { year: '2-digit' } : {}),
            timeZone: 'UTC',
          })
          return (
            <div
              key={m.key}
              className="min-w-0 overflow-visible whitespace-nowrap border-l border-gray-200 pl-0.5 first:border-l-0 first:pl-0"
              style={{ flexGrow: m.n, flexBasis: 0 }}
            >
              {show ? label : ''}
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className={`flex ${dense ? '' : 'gap-px'} text-[9px] text-gray-400 leading-none h-3`}>
      {days.map((d) => {
        const dayNo = Number(d.slice(8))
        const label = dense
          ? dayNo === 1
            ? new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' })
            : ''
          : dayNo === 1 || dayNo % 5 === 0
          ? String(dayNo)
          : ''
        return (
          <div key={d} className="flex-1 min-w-0 overflow-visible whitespace-nowrap">
            {label}
          </div>
        )
      })}
    </div>
  )
}

function Counts({ counts }: { counts: NightCounts }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold tabular-nums flex-shrink-0">
      <span className="text-green-700" title={t('timeline.nights_campus')}>
        {counts.campus} <span className="font-normal text-gray-400">{t('timeline.short_campus')}</span>
      </span>
      <span className="text-sky-700" title={t('timeline.nights_extern')}>
        {counts.extern} <span className="font-normal text-gray-400">{t('timeline.short_extern')}</span>
      </span>
      {counts.unklar > 0 && (
        <span className="text-red-600" title={t('timeline.nights_unclear')}>
          {counts.unklar} <span className="font-normal text-red-400">?</span>
        </span>
      )}
    </div>
  )
}

const CORRECTION_KINDS: CorrectionKind[] = ['campus_an', 'campus_ab', 'eingang', 'abgang']

/** Eine Korrektur im Entstehen: was, an welchem Tag, und in welchen Grenzen. */
interface Draft {
  kind: CorrectionKind
  day: string
  note: string
  /** Frei wählbare Art – aus "Korrektur eintragen". Aus einer Lücke heraus steht sie fest. */
  free: boolean
  min?: string
  max?: string
}

function SegmentList({
  segments,
  from,
  to,
  onFix,
  onDelete,
  busy,
}: {
  segments: Segment[]
  from: string
  to: string
  /** null: Korrekturen sind nicht möglich (Migration fehlt). */
  onFix: ((kind: CorrectionKind, s: Segment) => void) | null
  onDelete: (id: string) => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const visible = segments.filter((s) => s.from <= to && (s.to === null || s.to >= from))
  if (visible.length === 0) return <p className="text-xs text-gray-400 py-2">{t('timeline.no_movements')}</p>
  return (
    <ul className="mt-2 space-y-1.5">
      {visible.map((s) => {
        // Welche Korrektur die Lücke schließt, sagt ihr Grund.
        const fixes: CorrectionKind[] =
          s.state !== 'unklar'
            ? []
            : s.reason === 'missing_return'
            ? ['campus_an']
            : s.reason === 'missing_departure'
            ? ['campus_ab']
            : ['campus_an', 'campus_ab']
        return (
          <li key={s.from} className="flex gap-2 text-xs">
            <span className="text-gray-500 tabular-nums whitespace-nowrap w-24 flex-shrink-0">
              {fmt(s.from)}–{s.to ? fmt(s.to) : '…'}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`font-semibold ${
                  s.state === 'campus'
                    ? 'text-green-700'
                    : s.state === 'extern'
                    ? 'text-sky-700'
                    : s.state === 'ausserhalb'
                    ? 'text-gray-500'
                    : 'text-red-600'
                }`}
              >
                {t(`timeline.state_${s.state}`)}
              </span>
              {s.reason && <span className="text-red-600"> · {t(`timeline.reason_${s.reason}`)}</span>}
              {s.start && (
                <span className="block text-gray-500 break-words">
                  {t(`timeline.source_${s.start.source}`)} {fmt(s.start.day)}
                  {s.start.source === 'correction'
                    ? ` · ${t(`timeline.kind_${correctionKindOf(s)}`)}${s.start.label ? `: ${s.start.label}` : ''}`
                    : `: ${s.start.label.replace(/\s*\n\s*/g, ', ') || '—'}`}
                </span>
              )}
              {onFix && fixes.length > 0 && (
                <span className="flex flex-wrap gap-1.5 mt-1">
                  {fixes.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onFix(k, s)}
                      className="px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-medium active:bg-red-100"
                    >
                      {t(`timeline.fix_${k}`)}
                    </button>
                  ))}
                </span>
              )}
            </span>
            {s.start?.source === 'correction' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(s.start!.sourceId)}
                className="p-1 -m-1 text-gray-400 active:text-red-600 flex-shrink-0 self-start disabled:opacity-40"
                aria-label={t('timeline.delete_correction')}
                title={t('timeline.delete_correction')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Aus dem Zustand nach der Korrektur zurück auf ihre Art – für die Anzeige. */
function correctionKindOf(s: Segment): CorrectionKind {
  if (s.start?.entry) return 'eingang'
  if (s.state === 'ausserhalb') return 'abgang'
  return s.state === 'extern' ? 'campus_ab' : 'campus_an'
}

function CorrectionForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const outside = (!!draft.min && draft.day < draft.min) || (!!draft.max && draft.day > draft.max)
  return (
    <div className="mt-2 p-3 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
      {draft.free ? (
        <select
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as CorrectionKind })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {CORRECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`timeline.kind_${k}`)}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm font-semibold text-gray-900">{t(`timeline.kind_${draft.kind}`)}</p>
      )}
      <p className="text-[11px] text-gray-500">{t(`timeline.kind_${draft.kind}_hint`)}</p>
      <div className="flex gap-2">
        <input
          type="date"
          value={draft.day}
          min={draft.min}
          max={draft.max}
          onChange={(e) => setDraft({ ...draft, day: e.target.value })}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="text"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder={t('timeline.note_placeholder')}
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      {outside && <p className="text-[11px] text-amber-700">{t('timeline.outside_gap')}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 active:bg-gray-100">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !draft.day}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-700 text-white active:bg-brand-800 disabled:opacity-50"
        >
          {busy ? t('timeline.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

/** Aufgeklappte Zeile: Abschnitte mit Quelle, Knöpfe für die Lücken, Korrekturen. */
function VehicleDetails({
  row,
  from,
  to,
  today,
  correctionsAvailable,
  onChanged,
}: {
  row: Row
  from: string
  to: string
  today: string
  correctionsAvailable: boolean
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
      setDraft(null)
    } catch (err) {
      setError(errorText(err, t('timeline.save_error')))
    } finally {
      setBusy(false)
    }
  }

  function fix(kind: CorrectionKind, s: Segment) {
    const max = s.to && s.to < today ? s.to : today
    setDraft({ kind, day: s.from <= max ? s.from : max, note: '', free: false, min: s.from, max })
  }

  // Die lange Abwesenheit ist der letzte, offene Abschnitt "extern".
  const away = row.absence ? row.segments.find((s) => s.state === 'extern' && s.to === null) : undefined

  return (
    <div className="px-3 pb-3">
      {row.absence && (
        <div className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
          {t('timeline.long_absence', { days: row.absence })}
          {correctionsAvailable && away && (
            <button
              type="button"
              onClick={() => setDraft({ kind: 'campus_an', day: today, note: '', free: false, min: away.from, max: today })}
              className="block mt-1 font-semibold underline"
            >
              {t('timeline.fix_campus_an')}
            </button>
          )}
        </div>
      )}
      <SegmentList
        segments={row.segments}
        from={from}
        to={to}
        onFix={correctionsAvailable ? fix : null}
        onDelete={(id) => {
          if (window.confirm(t('timeline.delete_confirm'))) run(() => deleteCorrection(id))
        }}
        busy={busy}
      />
      {draft && (
        <CorrectionForm
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onCancel={() => setDraft(null)}
          onSave={() =>
            run(() =>
              addCorrection({ vehicle_id: row.vehicle.id, occurred_on: draft.day, kind: draft.kind, note: draft.note })
            )
          }
        />
      )}
      {error && <p className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{error}</p>}
      {correctionsAvailable && !draft && (
        <button
          type="button"
          onClick={() => setDraft({ kind: 'campus_an', day: today, note: '', free: true, max: today })}
          className="mt-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 active:text-gray-800"
        >
          <Pencil size={12} /> {t('timeline.add_correction')}
        </button>
      )}
    </div>
  )
}

/** Kundenauswahl von unten – statt einer Chip-Reihe, die im Kopf bis zu vier
 *  Zeilen belegte. Archivierte Kunden stehen am Ende, für alte Abrechnungen. */
function CustomerSheet({
  customers,
  active,
  onToggle,
  onAll,
  onClose,
}: {
  customers: TimelineData['customers']
  active: string[]
  onToggle: (id: string) => void
  onAll: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const entries = [
    ...customers.filter((c) => !c.is_archived),
    { id: NO_CUSTOMER, name: t('timeline.no_customer'), color: null, is_archived: false },
    ...customers.filter((c) => c.is_archived),
  ]

  const row = (id: string, name: string, color: string | null, on: boolean, onClick: () => void, muted = false) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-left active:bg-gray-50"
    >
      <span
        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
          on ? 'bg-brand-700 border-brand-600 text-white' : 'border-gray-300'
        }`}
      >
        {on && <Check size={14} />}
      </span>
      {color !== undefined && id !== 'all' && (
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color ?? '#9ca3af' }} />
      )}
      <span className={`flex-1 min-w-0 truncate text-sm ${muted ? 'text-gray-400' : 'text-gray-800'}`}>{name}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white rounded-t-2xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <p className="text-base font-semibold text-gray-800 mb-2">{t('timeline.customers')}</p>
        <div className="overflow-y-auto -mx-2 px-2">
          {row('all', t('timeline.all_customers'), null, active.length === 0, onAll)}
          <div className="border-t border-gray-100 my-1" />
          {entries.map((c) =>
            row(
              c.id,
              c.is_archived ? `${c.name} · ${t('timeline.archived')}` : c.name,
              c.color,
              active.includes(c.id),
              () => onToggle(c.id),
              c.is_archived
            )
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full py-3 rounded-xl text-sm font-semibold bg-brand-700 text-white active:bg-brand-800"
        >
          {t('timeline.done')}
        </button>
      </div>
    </div>
  )
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function Zeitstrahl() {
  const { t, i18n } = useTranslation()
  const today = berlinDay(new Date())
  const [anchor, setAnchor] = useState(today.slice(0, 7))
  const [span, setSpan] = useState<Span>('month')
  // Frei gewählter Zeitraum – beim Umschalten übernimmt er den gerade gezeigten.
  const [custom, setCustom] = useState(() => rangeOf(today.slice(0, 7), 'month'))
  // Leer heißt: alle Kunden.
  const [selected, setSelected] = useState<string[]>(loadSelection)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [data, setData] = useState<TimelineData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTimelineData()
      .then(setData)
      .catch((err) => setError(errorText(err, t('timeline.load_error'))))
  }, [t])

  // Nach einer Korrektur neu laden – die alte Ansicht bleibt so lange stehen.
  async function reload() {
    setData(await fetchTimelineData())
  }

  const { from, to } = span === 'custom' ? custom : rangeOf(anchor, span)
  const length = daysBetween(from, to).length
  const dense = length > DENSE_FROM_DAYS

  function chooseSpan(next: Span) {
    if (next === span) return
    if (next === 'custom') setCustom({ from, to })
    else if (span === 'custom') setAnchor(from.slice(0, 7))
    setSpan(next)
  }

  /** Ein Datum des freien Zeitraums ändern. Liegt Von hinter Bis, zieht das
   *  andere Ende mit; länger als MAX_RANGE_DAYS wird er nicht. */
  function setCustomDay(which: 'from' | 'to', day: string) {
    if (!isPlausibleDay(day)) return
    let next = { ...custom, [which]: day }
    // Überholt ein Ende das andere, schrumpft der Zeitraum auf diesen einen Tag.
    if (next.from > next.to) next = { from: day, to: day }
    if (daysBetween(next.from, next.to).length > MAX_RANGE_DAYS) {
      next =
        which === 'from'
          ? { from: next.from, to: addDays(next.from, MAX_RANGE_DAYS - 1) }
          : { from: addDays(next.to, -(MAX_RANGE_DAYS - 1)), to: next.to }
    }
    setCustom(next)
  }

  /** Vor und zurück: Monat und Quartal springen um ihre Länge, ein freier
   *  Zeitraum um seine Anzahl Tage. */
  function step(dir: 1 | -1) {
    if (span === 'custom') setCustom({ from: addDays(from, dir * length), to: addDays(to, dir * length) })
    else setAnchor(shiftMonth(anchor, dir * (span === 'month' ? 1 : 3)))
  }

  // Abschnitte hängen nicht am Zeitraum – nur einmal je Datenstand bauen.
  const segmentsOf = useMemo(() => {
    const map = new Map<string, Segment[]>()
    if (data) for (const [id, mv] of data.movementsOf) map.set(id, buildSegments(mv))
    return map
  }, [data])

  // Gemerkte Kunden, die es nicht mehr gibt, zählen nicht – sonst bliebe die
  // Liste leer, ohne dass ein Chip als gewählt zu sehen wäre.
  const active = useMemo(
    () => (data ? selected.filter((id) => id === NO_CUSTOMER || data.customers.some((c) => c.id === id)) : selected),
    [data, selected]
  )

  function toggleCustomer(id: string) {
    const next = active.includes(id) ? active.filter((x) => x !== id) : [...active, id]
    setSelected(next)
    saveSelection(next)
  }

  const customerNames = (id: string) =>
    id === NO_CUSTOMER ? t('timeline.no_customer') : data?.customers.find((c) => c.id === id)?.name ?? ''
  const customerSummary =
    active.length === 0
      ? t('timeline.all_customers')
      : active.length <= 2
      ? active.map(customerNames).join(', ')
      : t('timeline.customers_count', { count: active.length })

  function clearCustomers() {
    setSelected([])
    saveSelection([])
  }

  const groups = useMemo<Group[]>(() => {
    if (!data) return []
    const rowOf = (v: TimelineVehicle): Row | null => {
      const movements = data.movementsOf.get(v.id) ?? []
      const segments = segmentsOf.get(v.id) ?? []
      const cells = dayCells(segments, movements, from, to, today)
      if (cells.every((c) => c.night === 'ausserhalb')) return null
      return { vehicle: v, segments, cells, counts: countNights(cells), absence: longAbsence(segments, today) }
    }
    const rows = new Map<string, Row>()
    for (const v of data.vehicles) {
      const r = rowOf(v)
      if (r && (!onlyIssues || r.counts.unklar > 0 || r.absence)) rows.set(v.id, r)
    }

    const buckets = [
      ...data.customers.map((c) => ({ id: c.id, name: c.name, color: c.color, archived: c.is_archived })),
      { id: NO_CUSTOMER, name: t('timeline.no_customer'), color: null, archived: false },
    ]
    return buckets
      .filter((b) => active.length === 0 || active.includes(b.id))
      .map((b) => {
        const members = [...rows.values()].filter((r) => {
          const cs = data.customersOf.get(r.vehicle.id) ?? []
          return b.id === NO_CUSTOMER ? cs.length === 0 : cs.includes(b.id)
        })
        return { id: b.id, name: b.name, color: b.color, rows: members, counts: sum(members.map((r) => r.counts)) }
      })
      .filter((g) => g.rows.length > 0)
  }, [data, segmentsOf, from, to, today, active, onlyIssues, t])

  // Über mehrere Kunden: ein Fahrzeug, das bei zweien steht, zählt einmal.
  const total = useMemo(() => {
    const unique = new Map<string, NightCounts>()
    for (const g of groups) for (const r of g.rows) unique.set(r.vehicle.id, r.counts)
    return { vehicles: unique.size, counts: sum([...unique.values()]) }
  }, [groups])

  const days = useMemo(() => daysBetween(from, to), [from, to])

  const title = new Date(`${from}T00:00:00Z`).toLocaleDateString(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const periodLabel =
    span === 'month'
      ? title
      : `${new Date(`${from}T00:00:00Z`).toLocaleDateString(i18n.language, { month: 'short', timeZone: 'UTC' })} – ${new Date(
          `${to}T00:00:00Z`
        ).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric', timeZone: 'UTC' })}`

  function exportCsv() {
    const header = [
      t('timeline.csv_customer'),
      t('timeline.csv_plate'),
      t('timeline.csv_model'),
      t('timeline.nights_campus'),
      t('timeline.nights_extern'),
      t('timeline.nights_unclear'),
    ]
    const lines = [header.map(csvCell).join(';')]
    for (const g of groups) {
      for (const r of g.rows) {
        lines.push(
          [g.name, r.vehicle.license_plate, r.vehicle.brand_model ?? '', r.counts.campus, r.counts.extern, r.counts.unklar]
            .map(csvCell)
            .join(';')
        )
      }
    }
    // BOM, damit Excel die Umlaute als UTF-8 liest.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lagertage_${from}_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('projects.title')}
        right={
          <button
            type="button"
            onClick={exportCsv}
            disabled={groups.length === 0}
            className="p-2 -mr-2 text-gray-500 active:text-gray-800 disabled:opacity-30"
            aria-label={t('timeline.export')}
            title={t('timeline.export')}
          >
            <Download size={20} />
          </button>
        }
      >
        <ProjekteSwitch />
        <div className="flex items-center gap-1 mb-2">
          <button
            type="button"
            onClick={() => step(-1)}
            className="p-1.5 rounded-lg text-gray-500 active:bg-gray-100 flex-shrink-0"
            aria-label={t('timeline.previous')}
          >
            <ChevronLeft size={18} />
          </button>
          {span === 'custom' ? (
            // Beim freien Zeitraum stehen die Daten selbst an der Stelle der
            // Überschrift – eine eigene Zeile dafür machte den Kopf zu hoch.
            <div className="flex-1 min-w-0 flex items-center gap-1">
              {(['from', 'to'] as const).map((which, i) => (
                <Fragment key={which}>
                  {i === 1 && <span className="text-gray-400 text-xs">–</span>}
                  <input
                    type="date"
                    aria-label={t(`timeline.range_${which}`)}
                    value={custom[which]}
                    min="2000-01-01"
                    max="2100-12-31"
                    onChange={(e) => setCustomDay(which, e.target.value)}
                    className="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 rounded-lg text-xs font-semibold text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </Fragment>
              ))}
            </div>
          ) : (
            // Antippen springt zurück auf heute.
            <button
              type="button"
              onClick={() => setAnchor(today.slice(0, 7))}
              className="flex-1 min-w-0 text-sm font-semibold text-gray-900 text-center truncate"
            >
              {periodLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => step(1)}
            className="p-1.5 rounded-lg text-gray-500 active:bg-gray-100 flex-shrink-0"
            aria-label={t('timeline.next')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex gap-0.5 bg-gray-100 p-1 rounded-xl flex-shrink-0">
            {(['month', 'quarter', 'custom'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => chooseSpan(s)}
                className={`px-2 py-1 rounded-lg text-xs font-medium ${
                  span === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {t(`timeline.span_${s}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className={`flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
              active.length > 0 ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            <Users size={14} className="flex-shrink-0" />
            <span className="truncate">{customerSummary}</span>
          </button>
          <button
            type="button"
            onClick={() => setOnlyIssues(!onlyIssues)}
            aria-pressed={onlyIssues}
            aria-label={t('timeline.only_issues')}
            title={t('timeline.only_issues')}
            className={`p-1.5 rounded-lg border flex-shrink-0 ${
              onlyIssues ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-500 border-gray-300'
            }`}
          >
            <AlertTriangle size={16} />
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))] space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 items-start">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
          </div>
        )}
        {!data && !error && <SkeletonList />}

        {data && !data.correctionsAvailable && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {t('timeline.corrections_missing')}
          </p>
        )}

        {data && groups.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <GanttChart size={32} className="mx-auto mb-2" />
            <p className="text-sm">{t('timeline.empty')}</p>
          </div>
        )}

        {/* Die Legende scrollt mit – im festen Kopf kostete sie auf dem Telefon
            eine ganze Zeile. */}
        {data && groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500 px-1">
            {span === 'custom' && (
              <span className="font-semibold text-gray-700">{t('timeline.days', { count: length })}</span>
            )}
            {[
              ['bg-green-500', 'timeline.legend_campus'],
              ['bg-amber-400', 'timeline.legend_moving'],
              ['bg-sky-400', 'timeline.legend_extern'],
              ['bg-red-400', 'timeline.legend_unclear'],
            ].map(([cls, key]) => (
              <span key={key} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-sm ${cls}`} /> {t(key)}
              </span>
            ))}
          </div>
        )}

        {groups.length > 1 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-gray-900 text-white">
            <span className="flex-1 min-w-0 text-sm font-bold truncate">
              {t('timeline.total', { count: total.vehicles })}
            </span>
            <span className="text-[11px] font-semibold tabular-nums">
              {total.counts.campus} {t('timeline.short_campus')} · {total.counts.extern} {t('timeline.short_extern')}
              {total.counts.unklar > 0 && <span className="text-red-300"> · {total.counts.unklar} ?</span>}
            </span>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color ?? '#9ca3af' }} />
              <h2 className="flex-1 min-w-0 text-sm font-bold text-gray-900 truncate">{g.name}</h2>
              <Counts counts={g.counts} />
            </div>
            <div className="px-3 pt-2">
              <Axis days={days} dense={dense} locale={i18n.language} />
            </div>
            <ul className="divide-y divide-gray-100">
              {g.rows.map((r) => {
                const key = `${g.id}:${r.vehicle.id}`
                const isOpen = open === key
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : key)}
                      className="w-full text-left px-3 py-2 active:bg-gray-50"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {r.vehicle.license_plate}
                        </span>
                        <span className="flex-1 min-w-0 text-xs text-gray-400 truncate">
                          {r.vehicle.brand_model}
                        </span>
                        {r.absence && (
                          <AlertTriangle
                            size={14}
                            className="text-amber-500 flex-shrink-0"
                            aria-label={t('timeline.long_absence', { days: r.absence })}
                          />
                        )}
                        <Counts counts={r.counts} />
                        <ChevronDown
                          size={14}
                          className={`text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                      <Bar cells={r.cells} today={today} dense={dense} />
                    </button>
                    {isOpen && data && (
                      <VehicleDetails
                        row={r}
                        from={from}
                        to={to}
                        today={today}
                        correctionsAvailable={data.correctionsAvailable}
                        onChanged={reload}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {data && groups.length > 0 && (
          <p className="text-[11px] text-gray-400 px-1">{t('timeline.footnote')}</p>
        )}
      </div>

      {picking && data && (
        <CustomerSheet
          customers={data.customers}
          active={active}
          onToggle={toggleCustomer}
          onAll={clearCustomers}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
