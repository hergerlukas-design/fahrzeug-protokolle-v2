import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, GanttChart } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import { errorText } from '../lib/supabase'
import {
  addDays,
  berlinDay,
  buildSegments,
  countNights,
  dayCells,
  fetchTimelineData,
  longAbsence,
  type DayCell,
  type NightCounts,
  type Segment,
  type TimelineData,
  type TimelineVehicle,
} from '../lib/timeline'

type Span = 'month' | 'quarter'

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

/** Erster und letzter Tag des Zeitraums, der im Monat `anchor` (YYYY-MM) beginnt. */
function rangeOf(anchor: string, span: Span): { from: string; to: string } {
  const from = `${anchor}-01`
  const months = span === 'month' ? 1 : 3
  const [y, m] = anchor.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10)
  return { from, to: addDays(next, -1) }
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

function SegmentList({ segments, from, to }: { segments: Segment[]; from: string; to: string }) {
  const { t } = useTranslation()
  const visible = segments.filter((s) => s.from <= to && (s.to === null || s.to >= from))
  if (visible.length === 0) return <p className="text-xs text-gray-400 py-2">{t('timeline.no_movements')}</p>
  return (
    <ul className="mt-2 space-y-1.5">
      {visible.map((s) => (
        <li key={s.from} className="flex gap-2 text-xs">
          <span className="text-gray-500 tabular-nums whitespace-nowrap w-24 flex-shrink-0">
            {fmt(s.from)}–{s.to ? fmt(s.to) : '…'}
          </span>
          <span className="min-w-0">
            <span
              className={`font-semibold ${
                s.state === 'campus' ? 'text-green-700' : s.state === 'extern' ? 'text-sky-700' : 'text-red-600'
              }`}
            >
              {t(`timeline.state_${s.state}`)}
            </span>
            {s.reason && <span className="text-red-600"> · {t(`timeline.reason_${s.reason}`)}</span>}
            {s.start && (
              <span className="block text-gray-500 break-words">
                {t(s.start.source === 'protocol' ? 'timeline.source_protocol' : 'timeline.source_transfer')}{' '}
                {fmt(s.start.day)}: {s.start.label.replace(/\s*\n\s*/g, ', ') || '—'}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
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
  const [customer, setCustomer] = useState<string>('all')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [data, setData] = useState<TimelineData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTimelineData()
      .then(setData)
      .catch((err) => setError(errorText(err, t('timeline.load_error'))))
  }, [t])

  const { from, to } = rangeOf(anchor, span)
  const dense = span === 'quarter'

  // Abschnitte hängen nicht am Zeitraum – nur einmal je Datenstand bauen.
  const segmentsOf = useMemo(() => {
    const map = new Map<string, Segment[]>()
    if (data) for (const [id, mv] of data.movementsOf) map.set(id, buildSegments(mv))
    return map
  }, [data])

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
      .filter((b) => customer === 'all' || customer === b.id)
      .map((b) => {
        const members = [...rows.values()].filter((r) => {
          const cs = data.customersOf.get(r.vehicle.id) ?? []
          return b.id === NO_CUSTOMER ? cs.length === 0 : cs.includes(b.id)
        })
        return { id: b.id, name: b.name, color: b.color, rows: members, counts: sum(members.map((r) => r.counts)) }
      })
      .filter((g) => g.rows.length > 0)
  }, [data, segmentsOf, from, to, today, customer, onlyIssues, t])

  const days = useMemo(() => {
    const out: string[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
    return out
  }, [from, to])

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
        title={t('timeline.title')}
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
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setAnchor(shiftMonth(anchor, span === 'month' ? -1 : -3))}
            className="p-1.5 rounded-lg text-gray-500 active:bg-gray-100"
            aria-label={t('timeline.previous')}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(today.slice(0, 7))}
            className="flex-1 text-sm font-semibold text-gray-900 text-center"
          >
            {periodLabel}
          </button>
          <button
            type="button"
            onClick={() => setAnchor(shiftMonth(anchor, span === 'month' ? 1 : 3))}
            className="p-1.5 rounded-lg text-gray-500 active:bg-gray-100"
            aria-label={t('timeline.next')}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex gap-2 items-center">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-shrink-0">
            {(['month', 'quarter'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpan(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                  span === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {t(`timeline.span_${s}`)}
              </button>
            ))}
          </div>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">{t('timeline.all_customers')}</option>
            {data?.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={NO_CUSTOMER}>{t('timeline.no_customer')}</option>
          </select>
          <button
            type="button"
            onClick={() => setOnlyIssues(!onlyIssues)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex-shrink-0 ${
              onlyIssues ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-300'
            }`}
          >
            {t('timeline.only_issues')}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-gray-500">
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
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))] space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 items-start">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-700 text-sm whitespace-pre-wrap">{error}</p>
          </div>
        )}
        {!data && !error && <SkeletonList />}

        {data && groups.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <GanttChart size={32} className="mx-auto mb-2" />
            <p className="text-sm">{t('timeline.empty')}</p>
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
                    {isOpen && (
                      <div className="px-3 pb-3">
                        {r.absence && (
                          <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                            {t('timeline.long_absence', { days: r.absence })}
                          </p>
                        )}
                        <SegmentList segments={r.segments} from={from} to={to} />
                      </div>
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
    </div>
  )
}
