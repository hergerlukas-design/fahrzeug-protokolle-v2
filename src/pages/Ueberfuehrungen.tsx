import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Route as RouteIcon, ChevronDown, ChevronRight, MapPin, User, Phone, StickyNote,
  Car, Search, AlertTriangle, X, Pencil, Trash2, Truck, CheckCircle2, RotateCcw,
  FileText, FilePlus, CalendarDays, RefreshCw, Download, Link2, Unlink,
  Sparkles, Droplets, Fuel, Zap, CircleCheck, Navigation,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import { errorText } from '../lib/supabase'
import { fetchVehicles, fetchVehicleById, type Vehicle } from '../lib/vehicles'
import {
  fetchOpenTransfers,
  fetchClosedTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  setTransferStatus,
  findOverlappingTransfers,
  fetchCalendarEvents,
  fetchImportedCalendarUids,
  fetchUnlinkedProtocols,
  linkProtocolToTransfer,
  detachProtocolFromTransfer,
  linkTransfers,
  unlinkTransfer,
  matchVehicleByPlate,
  type Transfer,
  type TransferInput,
  type TransferStatus,
  type ProtocolRole,
  type CalendarEvent,
  type LinkableProtocol,
} from '../lib/transfers'
import { extractContact } from '../lib/calendarContact'
import { groupCalendarEvents, mergeEvents } from '../lib/calendarPairs'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(value: string, lang: string): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

/** Heutiges Datum als YYYY-MM-DD in Ortszeit – toISOString() läge in UTC. */
function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Tag und Monat ohne Jahr – "21.09." */
function formatDayMonth(value: string, lang: string): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'de-DE', {
    day: '2-digit', month: '2-digit',
  })
}

/**
 * Datum für die Liste: im laufenden Jahr ohne Jahreszahl.
 *
 * Der Zeitraum ist die Überschrift der Karte und hat neben dem Status wenig
 * Platz; in der Liste geht es fast immer um die nächsten Wochen. Was in einem
 * anderen Jahr liegt, trägt das Jahr weiterhin.
 */
function dayLabel(value: string, lang: string): string {
  const currentYear = String(new Date().getFullYear())
  return value.slice(0, 4) === currentYear ? formatDayMonth(value, lang) : formatDate(value, lang)
}

/** Postgres liefert "08:30:00" – für die Anzeige reichen Stunde und Minute. */
function formatTime(value: string | null): string {
  return value ? value.slice(0, 5) : ''
}

function withTime(date: string, time: string | null, lang: string): string {
  const t = formatTime(time)
  return t ? `${formatDate(date, lang)}, ${t}` : formatDate(date, lang)
}

function dateRange(tr: Transfer, lang: string): string {
  const start = dayLabel(tr.date_from, lang)
  const from = tr.time_from ? `${start}, ${formatTime(tr.time_from)}` : start
  const sameDay = !tr.date_to || tr.date_to === tr.date_from

  if (sameDay) {
    // Am selben Tag genügt die zweite Uhrzeit ohne Datumswiederholung.
    const end = formatTime(tr.time_to)
    return end ? `${from} – ${end}` : from
  }

  const endDay = dayLabel(tr.date_to!, lang)
  const endTime = formatTime(tr.time_to)
  return `${from} – ${endTime ? `${endDay}, ${endTime}` : endDay}`
}

const STATUS_STYLES: Record<TransferStatus, string> = {
  geplant:     'bg-gray-100 text-gray-600',
  unterwegs:   'bg-amber-100 text-amber-700',
  angekommen:  'bg-green-100 text-green-700',
  abgebrochen: 'bg-red-100 text-red-600',
}

function StatusBadge({ status }: { status: TransferStatus }) {
  const { t } = useTranslation()
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_STYLES[status]}`}>
      {t(`transfers.status_${status}`)}
    </span>
  )
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0 text-gray-700">{children}</div>
    </div>
  )
}

/** Der aktuelle Zustand des Fahrzeugs – dieselben Kennzahlen wie im Fahrzeugdetail. */
function VehicleState({ vehicle }: { vehicle: NonNullable<Transfer['vehicle']> }) {
  const { t } = useTranslation()
  const items = [
    { icon: <Sparkles size={16} />, label: t('vehicles.status_innen'),      active: vehicle.cleanliness_interior === 'sauber' },
    { icon: <Droplets size={16} />, label: t('vehicles.status_aussen'),     active: vehicle.cleanliness_exterior === 'sauber' },
    { icon: <Fuel size={16} />,     label: t('vehicles.status_tank'),       active: !!vehicle.is_fueled },
    { icon: <Zap size={16} />,      label: t('vehicles.status_akku'),       active: !!vehicle.is_charged },
  ]
  const available = (vehicle.availability ?? 'verfügbar') === 'verfügbar'
  return (
    <div className="flex gap-3 flex-wrap">
      {items.map(({ icon, label, active }) => (
        <div key={label} className="flex flex-col items-center gap-0.5 w-12">
          <span className={active ? 'text-green-500' : 'text-gray-300'}>{icon}</span>
          <span className={`text-[10px] font-medium ${active ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
        </div>
      ))}
      <div className="flex flex-col items-center gap-0.5 w-16">
        <span className={available ? 'text-green-500' : 'text-amber-500'}>
          {available ? <CircleCheck size={16} /> : <Navigation size={16} />}
        </span>
        <span className={`text-[10px] font-medium ${available ? 'text-green-600' : 'text-amber-600'}`}>
          {available ? t('vehicles.status_verfuegbar') : t('vehicles.status_unterwegs')}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Transfer card – collapsed shows plate and date, expanded the rest
// ─────────────────────────────────────────────────────────────────────────────

function TransferCard({
  transfer,
  related,
  expanded,
  onToggle,
  onStatus,
  onCreateProtocol,
  onLinkProtocol,
  onUnlinkProtocol,
  onOpenProtocol,
  onLinkTransfer,
  onUnlinkTransfer,
  onOpenTransfer,
  onEdit,
  onDelete,
  busy,
}: {
  transfer: Transfer
  /** Die anderen Fahrten derselben Gruppe. */
  related: Transfer[]
  expanded: boolean
  onToggle: () => void
  onStatus: (status: TransferStatus) => void
  onCreateProtocol: (role: ProtocolRole) => void
  onLinkProtocol: (role: ProtocolRole) => void
  onUnlinkProtocol: (role: ProtocolRole) => void
  onOpenProtocol: (protocolId: string) => void
  onLinkTransfer: () => void
  onUnlinkTransfer: (other: Transfer) => void
  onOpenTransfer: (transferId: string) => void
  onEdit: () => void
  onDelete: () => void
  busy: boolean
}) {
  const { t, i18n } = useTranslation()
  const v = transfer.vehicle
  // Aus dem Kalender übernommene Fahrten tragen den Termintitel; er ist die
  // Beschriftung, unter der sie bekannt sind. Das Kennzeichen rückt dann eine
  // Zeile nach unten, statt zu verschwinden.
  const title = transfer.title?.trim() || null
  const plate = v?.license_plate ?? t('transfers.vehicle_missing')

  return (
    <div id={`transfer-${transfer.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          {/* Der Termin steht oben: danach wird in der Liste gesucht. Darunter
              die Beschriftung der Fahrt, zuletzt Kennzeichen und Fahrzeug. */}
          <div className="flex items-center gap-2">
            <p className="font-bold text-gray-900 truncate">{dateRange(transfer, i18n.language)}</p>
            <StatusBadge status={transfer.status} />
          </div>
          {title && <p className="text-sm text-gray-600 truncate">{title}</p>}
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            <span className="font-semibold text-gray-500">{plate}</span>
            {v?.brand_model
              ? <span> · {v.brand_model}</span>
              : <span className="italic text-gray-300"> · {t('vehicles.brand_unknown')}</span>}
          </p>
        </div>
        {expanded
          ? <ChevronDown size={18} className="text-gray-300 flex-shrink-0" />
          : <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          <Row icon={<MapPin size={16} />}>
            {transfer.location_from || transfer.location_to ? (
              <span>
                {transfer.location_from || '—'}
                <span className="text-gray-400"> → </span>
                <span className="font-semibold text-gray-900">{transfer.location_to || '—'}</span>
              </span>
            ) : (
              <span className="text-gray-400 italic">{t('transfers.no_route')}</span>
            )}
          </Row>

          {transfer.driver_name && (
            <Row icon={<User size={16} />}>{transfer.driver_name}</Row>
          )}

          {(transfer.contact_name || transfer.contact_phone) && (
            <Row icon={<Phone size={16} />}>
              {transfer.contact_name}
              {transfer.contact_name && transfer.contact_phone && <span className="text-gray-400"> · </span>}
              {transfer.contact_phone && (
                <a href={`tel:${transfer.contact_phone}`} className="text-brand-600 font-medium">
                  {transfer.contact_phone}
                </a>
              )}
            </Row>
          )}

          {transfer.notes && (
            <Row icon={<StickyNote size={16} />}>
              <span className="whitespace-pre-wrap">{transfer.notes}</span>
            </Row>
          )}

          {v && (
            <div className="pt-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                {t('transfers.vehicle_state')}
              </p>
              <VehicleState vehicle={v} />
            </div>
          )}

          {/* Fahrten, die zu dieser gehören */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('transfers.linked_section')}
            </p>
            <div className="space-y-1.5">
              {related.map((r) => (
                <div key={r.id} className="flex items-center gap-1 pr-1 rounded-xl border border-gray-200">
                  <button
                    onClick={() => onOpenTransfer(r.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left active:bg-gray-50 rounded-l-xl"
                  >
                    <RouteIcon size={15} className="text-gray-400 flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                      {r.title?.trim() || r.vehicle?.license_plate || t('transfers.vehicle_missing')}
                      <span className="text-gray-400"> · {withTime(r.date_from, r.time_from, i18n.language)}</span>
                    </span>
                    <StatusBadge status={r.status} />
                  </button>
                  <button
                    onClick={() => onUnlinkTransfer(r)}
                    disabled={busy}
                    aria-label={t('transfers.unlink_transfer')}
                    className="p-2 text-gray-300 active:text-gray-600 disabled:opacity-50 flex-shrink-0"
                  >
                    <Unlink size={15} />
                  </button>
                </div>
              ))}
              <button
                onClick={onLinkTransfer}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-left active:bg-gray-50"
              >
                <Link2 size={15} className="text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0 text-sm text-gray-500 truncate">
                  {t('transfers.link_transfer')}
                </span>
              </button>
            </div>
          </div>

          {/* Protokolle dieser Überführung */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {t('transfers.protocols')}
            </p>
            <div className="space-y-1.5">
              {(['pickup', 'dropoff'] as ProtocolRole[]).map((role) => {
                const proto = role === 'pickup' ? transfer.pickup_protocol : transfer.dropoff_protocol
                const label = t(`transfers.protocol_${role}`)
                if (proto) {
                  // Zeile mit zwei Zielen: öffnen und wieder lösen. Deshalb ein
                  // div mit zwei Schaltflächen statt einer verschachtelten.
                  return (
                    <div
                      key={role}
                      className="flex items-center gap-1 pr-1 rounded-xl border border-gray-200"
                    >
                      <button
                        onClick={() => onOpenProtocol(proto.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left active:bg-gray-50 rounded-l-xl"
                      >
                        <FileText size={15} className="text-gray-400 flex-shrink-0" />
                        <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                          {label}
                          <span className="text-gray-400"> · {formatDate(proto.created_at.slice(0, 10), i18n.language)}</span>
                        </span>
                        {proto.status === 'draft' && (
                          <span className="text-[10px] font-semibold uppercase text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {t('archiv.draft')}
                          </span>
                        )}
                        <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
                      </button>
                      <button
                        onClick={() => onUnlinkProtocol(role)}
                        disabled={busy}
                        aria-label={t('transfers.unlink_protocol')}
                        className="p-2 text-gray-300 active:text-gray-600 disabled:opacity-50 flex-shrink-0"
                      >
                        <Unlink size={15} />
                      </button>
                    </div>
                  )
                }
                return (
                  // Wie die verknüpfte Zeile: Hauptweg links, die zweite
                  // Möglichkeit als Symbol rechts. So bleibt für die
                  // Beschriftung genug Platz.
                  <div
                    key={role}
                    className="flex items-center gap-1 pr-1 rounded-xl border border-dashed border-gray-300"
                  >
                    <button
                      onClick={() => onCreateProtocol(role)}
                      disabled={!v}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left active:bg-gray-50 disabled:opacity-50 rounded-l-xl"
                    >
                      <FilePlus size={15} className="text-gray-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0 text-sm text-gray-500 truncate">
                        {t('transfers.create_protocol', { which: label })}
                      </span>
                    </button>
                    {/* Für Protokolle, die es schon gibt – etwa unterwegs angelegt. */}
                    <button
                      onClick={() => onLinkProtocol(role)}
                      disabled={!v}
                      aria-label={t('transfers.link_protocol')}
                      className="p-2 text-gray-400 active:text-gray-700 disabled:opacity-50 flex-shrink-0"
                    >
                      <Link2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Status actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {transfer.status === 'geplant' && (
              <button
                onClick={() => onStatus('unterwegs')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold active:bg-amber-600 disabled:opacity-60"
              >
                <Truck size={14} /> {t('transfers.action_pickup')}
              </button>
            )}
            {transfer.status === 'unterwegs' && (
              <button
                onClick={() => onStatus('angekommen')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold active:bg-green-700 disabled:opacity-60"
              >
                <CheckCircle2 size={14} /> {t('transfers.action_arrive')}
              </button>
            )}
            {(transfer.status === 'geplant' || transfer.status === 'unterwegs') && (
              <button
                onClick={() => onStatus('abgebrochen')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold active:bg-gray-50 disabled:opacity-60"
              >
                <X size={14} /> {t('transfers.action_cancel')}
              </button>
            )}
            {(transfer.status === 'angekommen' || transfer.status === 'abgebrochen') && (
              <button
                onClick={() => onStatus('geplant')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold active:bg-gray-50 disabled:opacity-60"
              >
                <RotateCcw size={14} /> {t('transfers.action_reset')}
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={onEdit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 mt-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold active:bg-gray-50"
            >
              <Pencil size={14} /> {t('common.edit')}
            </button>
            <button
              onClick={onDelete}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 mt-2 rounded-xl border border-red-200 text-red-600 text-xs font-semibold active:bg-red-50"
            >
              <Trash2 size={14} /> {t('common.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / edit form – bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function TransferForm({
  target,
  preset,
  onSaved,
  onCancel,
}: {
  target: Transfer | null
  /** Vorbelegung für eine neue Überführung, etwa aus einem Kalendertermin. */
  preset?: TransferInput | null
  onSaved: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()
  // Beim Bearbeiten gewinnt der Datensatz, sonst die Vorbelegung.
  const init = target ?? preset ?? null

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleId, setVehicleId] = useState(init?.vehicle_id ?? '')
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [title, setTitle] = useState(init?.title ?? '')
  const [dateFrom, setDateFrom] = useState(init?.date_from ?? '')
  const [dateTo, setDateTo] = useState(init?.date_to ?? '')
  const [timeFrom, setTimeFrom] = useState(init?.time_from?.slice(0, 5) ?? '')
  const [timeTo, setTimeTo] = useState(init?.time_to?.slice(0, 5) ?? '')
  const [locationFrom, setLocationFrom] = useState(init?.location_from ?? '')
  const [locationTo, setLocationTo] = useState(init?.location_to ?? '')
  const [driver, setDriver] = useState(init?.driver_name ?? '')
  const [contactName, setContactName] = useState(init?.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(init?.contact_phone ?? '')
  const [notes, setNotes] = useState(init?.notes ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Das Ergebnis wird zusammen mit der Eingabe gespeichert, aus der es stammt.
  // So verschwindet eine Warnung sofort, wenn Fahrzeug oder Datum sich ändern,
  // statt bis zur Antwort der nächsten Abfrage stehen zu bleiben.
  const [overlapState, setOverlapState] = useState<{ key: string; rows: Transfer[] }>({ key: '', rows: [] })

  useEffect(() => {
    fetchVehicles().then(setVehicles).catch(() => {})
  }, [])

  const overlapKey = vehicleId && dateFrom ? `${vehicleId}|${dateFrom}|${dateTo}` : ''

  // Doppelbelegung erst abfragen, wenn Fahrzeug und Startdatum feststehen.
  useEffect(() => {
    if (!overlapKey) return
    let cancelled = false
    findOverlappingTransfers(vehicleId, dateFrom, dateTo || null, target?.id)
      .then((rows) => { if (!cancelled) setOverlapState({ key: overlapKey, rows }) })
      .catch(() => { if (!cancelled) setOverlapState({ key: overlapKey, rows: [] }) })
    return () => { cancelled = true }
  }, [overlapKey, vehicleId, dateFrom, dateTo, target?.id])

  const overlaps = overlapState.key === overlapKey ? overlapState.rows : []

  const selected = vehicles.find((v) => v.id === vehicleId) ?? null

  const filtered = useMemo(() => {
    const upper = vehicleSearch.toUpperCase()
    if (!upper) return vehicles.slice(0, 8)
    return vehicles.filter(
      (v) =>
        v.license_plate.toUpperCase().includes(upper) ||
        (v.brand_model ?? '').toUpperCase().includes(upper)
    ).slice(0, 8)
  }, [vehicles, vehicleSearch])

  const valid = !!vehicleId && !!dateFrom && (!dateTo || dateTo >= dateFrom)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) {
      setError(!vehicleId ? t('transfers.vehicle_required') : t('transfers.date_invalid'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const values = {
        vehicle_id: vehicleId,
        title,
        date_from: dateFrom,
        date_to: dateTo || null,
        time_from: timeFrom || null,
        time_to: timeTo || null,
        location_from: locationFrom,
        location_to: locationTo,
        driver_name: driver,
        contact_name: contactName,
        contact_phone: contactPhone,
        notes,
        // Bleibt beim Bearbeiten erhalten, damit derselbe Termin nicht
        // ein zweites Mal als neu erscheint.
        calendar_uid: target?.calendar_uid ?? preset?.calendar_uid ?? null,
        // Ein Paar bringt zwei Termine mit – beide müssen als übernommen
        // vermerkt werden, sonst taucht der zweite gleich wieder als neu auf.
        calendar_uids: preset?.calendar_uids,
      }
      if (target) await updateTransfer(target.id, values)
      else await createTransfer(values)
      onSaved()
    } catch (err) {
      setError(errorText(err, t('common.error')))
      setSaving(false)
    }
  }

  const field = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-y-auto max-w-2xl mx-auto">
        <div className="flex justify-center pt-3 pb-3">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <form onSubmit={handleSubmit} className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] space-y-4">
          <h2 className="text-lg font-bold text-gray-900">
            {target
              ? t('transfers.form_title_edit')
              : preset?.calendar_uid
                ? t('transfers.form_title_import')
                : t('transfers.form_title_new')}
          </h2>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Titel – bei einer Kalenderübernahme der Termintitel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('transfers.title_label')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('transfers.title_placeholder')}
              className={field}
            />
          </div>

          {/* Vehicle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('transfers.vehicle_label')} <span className="text-red-500">*</span>
            </label>
            {selected ? (
              <div className="flex items-center gap-3 border border-gray-300 rounded-xl px-3 py-2.5">
                <Car size={18} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate text-sm">{selected.license_plate}</p>
                  <p className="text-xs text-gray-500 truncate">{selected.brand_model || '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setVehicleId(''); setVehicleSearch('') }}
                  className="text-gray-400 active:text-gray-600 flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    placeholder={t('transfers.vehicle_placeholder')}
                    className={`${field} pl-9 bg-gray-50`}
                  />
                </div>
                {filtered.length > 0 && (
                  <ul className="mt-1 border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {filtered.map((v) => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => setVehicleId(v.id)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-gray-50"
                        >
                          <Car size={16} className="text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 truncate text-sm">{v.license_plate}</p>
                            <p className="text-xs text-gray-500 truncate">{v.brand_model || '—'}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Zeitpunkte – je eine Zeile für Start und Ende. Datums- und Zeitfeld
              sehen auf Android gleich aus, deshalb bekommt jedes eine sichtbare
              Beschriftung statt nur einer für Screenreader. */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5">
                {t('transfers.date_from')} <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-gray-400 mb-1">{t('transfers.date_label')}</span>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={field} />
                </label>
                <label className="block">
                  <span className="block text-xs text-gray-400 mb-1">{t('transfers.time_label')}</span>
                  <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className={field} />
                </label>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5">{t('transfers.date_to')}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs text-gray-400 mb-1">{t('transfers.date_label')}</span>
                  <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} className={field} />
                </label>
                <label className="block">
                  <span className="block text-xs text-gray-400 mb-1">{t('transfers.time_label')}</span>
                  <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className={field} />
                </label>
              </div>
            </div>

            <p className="text-xs text-gray-400">{t('transfers.time_hint')}</p>
          </div>

          {overlaps.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{t('transfers.overlap_title')}</p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {overlaps.map((o) => (
                    <li key={o.id}>{dateRange(o, i18n.language)} · {t(`transfers.status_${o.status}`)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Route */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.location_from')}</label>
              <input type="text" value={locationFrom} onChange={(e) => setLocationFrom(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.location_to')}</label>
              <input type="text" value={locationTo} onChange={(e) => setLocationTo(e.target.value)} className={field} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.driver')}</label>
            <input type="text" value={driver} onChange={(e) => setDriver(e.target.value)} className={field} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.contact_name')}</label>
              <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.contact_phone')}</label>
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={field} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.notes')}</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button type="button" onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving || !valid} className="py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm disabled:opacity-60">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirm
// ─────────────────────────────────────────────────────────────────────────────

function DeleteConfirm({
  transfer,
  onConfirm,
  onCancel,
  deleting,
}: {
  transfer: Transfer
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-2xl mx-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-2">{t('transfers.delete_title')}</h2>
        <p className="text-sm text-gray-500 mb-1">
          {transfer.vehicle?.license_plate} · {dateRange(transfer, i18n.language)}
        </p>
        <p className="text-sm text-gray-400 mb-5">{t('common.irreversible')}</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} disabled={deleting} className="py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60">
            {deleting ? t('common.loading') : t('common.delete')}
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fahrt mit einer anderen verbinden
// ─────────────────────────────────────────────────────────────────────────────

function TransferPicker({
  transfer,
  candidates,
  onPick,
  onCancel,
  linking,
}: {
  transfer: Transfer
  candidates: Transfer[]
  onPick: (other: Transfer) => void
  onCancel: () => void
  linking: boolean
}) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const needle = search.trim().toUpperCase()
    if (!needle) return candidates
    return candidates.filter((c) =>
      [c.title, c.vehicle?.license_plate, c.vehicle?.brand_model, c.location_to]
        .some((f) => (f ?? '').toUpperCase().includes(needle))
    )
  }, [candidates, search])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-2xl mx-auto max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{t('transfers.link_transfer_title')}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {transfer.title?.trim() || transfer.vehicle?.license_plate} · {dateRange(transfer, i18n.language)}
        </p>

        {candidates.length > 3 && (
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('transfers.vehicle_placeholder')}
              className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('transfers.link_transfer_empty')}</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.slice(0, 30).map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c)}
                disabled={linking}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-left active:bg-gray-50 disabled:opacity-50"
              >
                <RouteIcon size={15} className="text-gray-400 flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-gray-800 truncate">
                    {c.title?.trim() || c.vehicle?.license_plate || t('transfers.vehicle_missing')}
                  </span>
                  <span className="block text-xs text-gray-400 truncate">
                    {c.title?.trim() && `${c.vehicle?.license_plate ?? ''} · `}
                    {dateRange(c, i18n.language)}
                    {c.location_to && ` · ${c.location_to}`}
                  </span>
                </span>
                <StatusBadge status={c.status} />
              </button>
            ))}
          </div>
        )}

        <button
          onClick={onCancel}
          className="w-full mt-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
        >
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vorhandenes Protokoll anhängen
// ─────────────────────────────────────────────────────────────────────────────

function ProtocolPicker({
  transfer,
  role,
  onPick,
  onCancel,
  linking,
}: {
  transfer: Transfer
  role: ProtocolRole
  onPick: (protocolId: string) => void
  onCancel: () => void
  linking: boolean
}) {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<LinkableProtocol[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchUnlinkedProtocols(transfer.vehicle_id)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => {
        if (cancelled) return
        setRows([])
        setError(errorText(e, t('common.error')))
      })
    return () => { cancelled = true }
  }, [transfer.vehicle_id, t])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-2xl mx-auto max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          {t('transfers.link_title', { which: t(`transfers.protocol_${role}`) })}
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          {transfer.vehicle?.license_plate} · {dateRange(transfer, i18n.language)}
        </p>

        {error && (
          <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}

        {rows === null ? (
          <SkeletonList count={2} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('transfers.link_empty')}</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((p) => {
              const day = (p.inspection_date ?? p.created_at).slice(0, 10)
              const kind = p.protocol_type === 'annahme' ? t('archiv.intake') : t('archiv.transfer')
              const route = [p.start_location, p.end_location].filter(Boolean).join(' → ')
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p.id)}
                  disabled={linking}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-left active:bg-gray-50 disabled:opacity-50"
                >
                  <FileText size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-800 truncate">
                      {formatDate(day, i18n.language)}
                      <span className="text-gray-400"> · {kind}</span>
                      {p.transfer_type && <span className="text-gray-400"> · {p.transfer_type}</span>}
                    </span>
                    <span className="block text-xs text-gray-400 truncate">
                      {route || p.location || p.inspector_name || '—'}
                    </span>
                  </span>
                  {p.status === 'draft' && (
                    <span className="text-[10px] font-semibold uppercase text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      {t('archiv.draft')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        <button
          onClick={onCancel}
          className="w-full mt-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
        >
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Kalender – Termine, aus denen noch keine Überführung entstanden ist
// ─────────────────────────────────────────────────────────────────────────────

function CalendarSection({
  events,
  loading,
  error,
  vehicles,
  onImport,
  onReload,
}: {
  events: CalendarEvent[]
  loading: boolean
  error: string | null
  vehicles: Vehicle[]
  onImport: (events: CalendarEvent[], vehicle: Vehicle | null) => void
  onReload: () => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(true)

  // Der Feed liefert den ganzen Kalender, also auch alles Vergangene.
  // Voreingestellt ist deshalb "ab heute"; beide Grenzen lassen sich ändern
  // oder ganz aufheben, wenn ein älterer Termin nachgetragen werden soll.
  const [from, setFrom] = useState(todayISO)
  const [to, setTo] = useState('')

  // Abholung und Überführung desselben Fahrzeugs gehören zusammen – erst
  // bündeln, dann filtern. Andersherum könnte der Filter eine Hälfte
  // wegschneiden und aus einem Paar zwei Einzelfahrten machen.
  const groups = useMemo(
    () => groupCalendarEvents(events, (ev) => matchVehicleByPlate(ev.summary, vehicles)),
    [events, vehicles]
  )

  const visible = useMemo(
    () =>
      groups.filter((g) => {
        const start = g.events[0].date_from
        const last = g.events[g.events.length - 1]
        // Ein mehrtägiger Termin zählt, solange er nicht komplett vorbei ist.
        const end = last.date_to || last.date_from
        if (from && end < from) return false
        if (to && start > to) return false
        return true
      }),
    [groups, from, to]
  )

  // Nichts anzuzeigen und nichts zu melden: die Sektion bleibt ganz weg,
  // statt einen leeren Kasten zu hinterlassen. Ein leerer Filter reicht dafür
  // nicht – sonst verschwände mit dem letzten Treffer auch der Filter selbst.
  if (!loading && !error && events.length === 0) return null

  const filtered = visible.length !== groups.length

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide active:text-gray-600"
        >
          <CalendarDays size={14} />
          <span>
            {t('transfers.calendar_section')} ({filtered ? `${visible.length}/${groups.length}` : groups.length})
          </span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          onClick={onReload}
          disabled={loading}
          className="ml-auto text-gray-400 active:text-gray-600 disabled:opacity-50"
          aria-label={t('transfers.calendar_reload')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {open && !error && (
        <div className="flex items-end gap-2 mb-2">
          <label className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              {t('transfers.calendar_filter_from')}
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          <label className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              {t('transfers.calendar_filter_to')}
            </span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo('') }}
              className="px-2 py-2 text-xs font-semibold text-gray-500 active:text-gray-700 whitespace-nowrap"
            >
              {t('transfers.calendar_filter_reset')}
            </button>
          )}
        </div>
      )}

      {open && !error && visible.length === 0 && (
        <p className="text-sm text-gray-400 py-2">{t('transfers.calendar_filter_empty')}</p>
      )}

      {open && !error && (
        <div className="space-y-2">
          {visible.map((group) => {
            const merged = mergeEvents(group.events)
            const contact = extractContact(merged.notes)
            const vehicle = group.vehicle
            const pair = group.events.length > 1
            return (
              <div key={group.key} className="bg-white rounded-2xl border border-dashed border-gray-300 shadow-sm px-4 py-3">
                {group.events.map((ev, idx) => (
                  <div
                    key={ev.uid}
                    className={idx > 0 ? 'mt-2 pt-2 border-t border-dashed border-gray-200' : ''}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          {ev.summary || t('transfers.calendar_untitled')}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {withTime(ev.date_from, ev.time_from, i18n.language)}
                          {ev.date_to && ` – ${withTime(ev.date_to, ev.time_to, i18n.language)}`}
                        </p>
                        {ev.location && (
                          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <MapPin size={12} className="text-gray-400 flex-shrink-0" /> {ev.location}
                          </p>
                        )}
                      </div>
                      {/* Falls das Paar doch nicht zusammengehört: einzeln übernehmen. */}
                      {pair && (
                        <button
                          onClick={() => onImport([ev], vehicle)}
                          aria-label={t('transfers.calendar_import_single')}
                          className="p-1.5 text-gray-300 active:text-gray-600 flex-shrink-0"
                        >
                          <Download size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Aus den Notizen gelesen – wird beim Übernehmen vorgeschlagen. */}
                {(contact.name || contact.phone) && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                    {contact.name && (
                      <span className="flex items-center gap-1">
                        <User size={12} className="text-gray-400 flex-shrink-0" /> {contact.name}
                      </span>
                    )}
                    {contact.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} className="text-gray-400 flex-shrink-0" /> {contact.phone}
                      </span>
                    )}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {vehicle ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      {vehicle.license_plate}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {t('transfers.calendar_no_match')}
                    </span>
                  )}
                  {pair && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                      {t('transfers.calendar_pair')}
                    </span>
                  )}
                  {group.events.some((e) => e.recurring) && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {t('transfers.calendar_recurring')}
                    </span>
                  )}
                  <button
                    onClick={() => onImport(group.events, vehicle)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-semibold active:bg-brand-700"
                  >
                    <Download size={13} />
                    {pair ? t('transfers.calendar_import_pair') : t('transfers.calendar_import')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Ueberfuehrungen() {
  const { t } = useTranslation()
  const loc = useLocation()
  const navigate = useNavigate()

  const [open, setOpen] = useState<Transfer[]>([])
  const [closed, setClosed] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [showClosed, setShowClosed] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Transfer | null>(null)
  const [formPreset, setFormPreset] = useState<TransferInput | null>(null)

  // Kalender
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Vorhandenes Protokoll anhängen
  const [linkTarget, setLinkTarget] = useState<{ transfer: Transfer; role: ProtocolRole } | null>(null)
  const [linking, setLinking] = useState(false)

  // Fahrt mit einer anderen verbinden
  const [transferLinkTarget, setTransferLinkTarget] = useState<Transfer | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [openRows, closedRows] = await Promise.all([fetchOpenTransfers(), fetchClosedTransfers()])
      setOpen(openRows)
      setClosed(closedRows)
      setError(null)
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  /**
   * Kalendertermine holen und die bereits übernommenen herausfiltern.
   *
   * Fehler hier landen bewusst nicht im Seitenbanner: ein nicht eingerichteter
   * oder gerade nicht erreichbarer Kalender darf die Überführungsliste nicht
   * als kaputt erscheinen lassen.
   */
  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true)
    try {
      const [events, imported, vehicleList] = await Promise.all([
        fetchCalendarEvents(),
        fetchImportedCalendarUids(),
        fetchVehicles(),
      ])
      setVehicles(vehicleList)
      setCalendarEvents(events.filter((e) => !imported.has(e.uid)))
      setCalendarError(null)
    } catch (e) {
      setCalendarEvents([])
      setCalendarError(errorText(e, t('transfers.calendar_error')))
    } finally {
      setCalendarLoading(false)
    }
  }, [t])

  useEffect(() => { loadCalendar() }, [loadCalendar])

  // Der Wizard hinter dem Plus-Button öffnet das Formular über den
  // Navigations-State – auch dann, wenn diese Seite schon offen ist.
  useEffect(() => {
    const state = loc.state as { createTransfer?: number } | null
    if (state?.createTransfer) {
      setEditTarget(null)
      setFormPreset(null)
      setFormOpen(true)
    }
  }, [loc.state])

  async function handleStatus(transfer: Transfer, status: TransferStatus) {
    setBusyId(transfer.id)
    setError(null)
    try {
      await setTransferStatus(transfer.id, status, transfer.vehicle_id)
      await load()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * Startet ein Protokoll für diese Überführung. Das Fahrzeug wird vorher
   * vollständig nachgeladen: die eingebettete Kurzform trägt weder VIN noch
   * bekannte Vorschäden, und ohne die verliert das Protokollformular genau die
   * Vorbelegung, für die es sie sonst mitbringt.
   */
  async function handleCreateProtocol(transfer: Transfer, role: ProtocolRole) {
    setBusyId(transfer.id)
    setError(null)
    try {
      const vehicle = await fetchVehicleById(transfer.vehicle_id)
      if (!vehicle) throw new Error(t('transfers.vehicle_missing'))
      navigate('/ueberfuehrung', {
        state: {
          vehicle_id: vehicle.id,
          license_plate: vehicle.license_plate,
          brand_model: vehicle.brand_model ?? '',
          vin: vehicle.vin ?? '',
          known_damages: vehicle.known_damages ?? [],
          transfer: {
            id: transfer.id,
            vehicle_id: transfer.vehicle_id,
            status: transfer.status,
            role,
            driver_name: transfer.driver_name,
            location_from: transfer.location_from,
            location_to: transfer.location_to,
          },
        },
      })
    } catch (e) {
      setError(errorText(e, t('common.error')))
      setBusyId(null)
    }
  }

  /**
   * Termine ins Formular übernehmen – ein einzelner oder ein Paar aus Abholung
   * und Überführung. Gespeichert wird erst nach Bestätigung.
   */
  function handleImportEvents(events: CalendarEvent[], vehicle: Vehicle | null) {
    const merged = mergeEvents(events)
    // Ansprechpartner und Telefon stehen, wenn überhaupt, in den Notizen –
    // der Titel trägt das Kennzeichen und sonst nichts Verlässliches.
    const contact = extractContact(merged.notes)
    setEditTarget(null)
    setFormPreset({
      vehicle_id: vehicle?.id ?? '',
      // Der Termintitel bleibt der Titel der Überführung – in den Notizen wäre
      // er in der Liste nicht mehr zu sehen.
      title: merged.title || null,
      date_from: merged.date_from,
      date_to: merged.date_to,
      time_from: merged.time_from,
      time_to: merged.time_to,
      location_from: merged.location_from,
      location_to: merged.location_to,
      contact_name: contact.name,
      contact_phone: contact.phone,
      notes: merged.notes,
      calendar_uid: merged.uids[0],
      calendar_uids: merged.uids,
    })
    setFormOpen(true)
  }

  /** Ein Protokoll, das es schon gibt, an die Überführung hängen. */
  async function handleLink(protocolId: string) {
    if (!linkTarget) return
    const { transfer, role } = linkTarget
    setLinking(true)
    setError(null)
    try {
      await linkProtocolToTransfer(transfer, role, protocolId)
      setLinkTarget(null)
      await load()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setLinking(false)
    }
  }

  async function handleUnlink(transfer: Transfer, role: ProtocolRole) {
    setBusyId(transfer.id)
    setError(null)
    try {
      await detachProtocolFromTransfer(transfer.id, role)
      await load()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusyId(null)
    }
  }

  // Die Gruppenmitglieder stehen schon in den geladenen Listen – offene und
  // abgeschlossene Fahrten sind beide da, eine eigene Abfrage wäre überflüssig.
  const all = useMemo(() => [...open, ...closed], [open, closed])

  /** Die anderen Fahrten derselben Gruppe. */
  function relatedOf(transfer: Transfer): Transfer[] {
    if (!transfer.group_id) return []
    return all.filter((x) => x.group_id === transfer.group_id && x.id !== transfer.id)
  }

  /** Alles, was sich mit dieser Fahrt noch verbinden lässt. */
  function candidatesFor(transfer: Transfer): Transfer[] {
    return all.filter(
      (x) => x.id !== transfer.id && (!transfer.group_id || x.group_id !== transfer.group_id)
    )
  }

  /** Zwei Fahrten in dieselbe Gruppe legen. */
  async function handleLinkTransfer(other: Transfer) {
    if (!transferLinkTarget) return
    setLinking(true)
    setError(null)
    try {
      await linkTransfers(transferLinkTarget, other)
      setTransferLinkTarget(null)
      await load()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setLinking(false)
    }
  }

  async function handleUnlinkTransfer(owner: Transfer, other: Transfer) {
    setBusyId(owner.id)
    setError(null)
    try {
      await unlinkTransfer(other.id, other.group_id)
      await load()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setBusyId(null)
    }
  }

  /** Eine verbundene Fahrt aufklappen und in den Blick holen. */
  function handleOpenTransfer(id: string) {
    setExpanded(id)
    // Nach dem Rendern, sonst steht die Karte noch zugeklappt an alter Stelle.
    setTimeout(() => {
      document.getElementById(`transfer-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteTransfer(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(errorText(e, t('common.error')))
    } finally {
      setDeleting(false)
    }
  }

  function renderCard(transfer: Transfer) {
    return (
      <TransferCard
        key={transfer.id}
        transfer={transfer}
        expanded={expanded === transfer.id}
        onToggle={() => setExpanded((cur) => (cur === transfer.id ? null : transfer.id))}
        onStatus={(status) => handleStatus(transfer, status)}
        onCreateProtocol={(role) => handleCreateProtocol(transfer, role)}
        related={relatedOf(transfer)}
        onLinkTransfer={() => setTransferLinkTarget(transfer)}
        onUnlinkTransfer={(other) => handleUnlinkTransfer(transfer, other)}
        onOpenTransfer={handleOpenTransfer}
        onLinkProtocol={(role) => setLinkTarget({ transfer, role })}
        onUnlinkProtocol={(role) => handleUnlink(transfer, role)}
        onOpenProtocol={(protocolId) => navigate('/archiv', { state: { protocol_id: protocolId } })}
        onEdit={() => { setEditTarget(transfer); setFormPreset(null); setFormOpen(true) }}
        onDelete={() => setDeleteTarget(transfer)}
        busy={busyId === transfer.id}
      />
    )
  }

  return (
    <div className="block min-h-full bg-gray-50">
      <PageHeader title={t('transfers.title')} />

      <div className="px-4 pt-4 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))] space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 leading-none"><X size={16} /></button>
          </div>
        )}

        {loading ? (
          <SkeletonList count={3} />
        ) : (
          <>
            <CalendarSection
              events={calendarEvents}
              loading={calendarLoading}
              error={calendarError}
              vehicles={vehicles}
              onImport={handleImportEvents}
              onReload={loadCalendar}
            />

            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {t('transfers.section_open')}
              </p>
              {open.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <RouteIcon size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{t('transfers.empty')}</p>
                  <p className="text-xs mt-1">{t('transfers.empty_hint')}</p>
                </div>
              ) : (
                <div className="space-y-2">{open.map(renderCard)}</div>
              )}
            </section>

            {closed.length > 0 && (
              <section>
                <button
                  onClick={() => setShowClosed((v) => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wide active:text-gray-600"
                >
                  <span>{t('transfers.section_closed')} ({closed.length})</span>
                  {showClosed ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {showClosed && <div className="space-y-2 mt-2 opacity-70">{closed.map(renderCard)}</div>}
              </section>
            )}
          </>
        )}
      </div>

      {formOpen && (
        <TransferForm
          target={editTarget}
          preset={formPreset}
          onSaved={() => {
            setFormOpen(false); setEditTarget(null); setFormPreset(null)
            load(); loadCalendar()
          }}
          onCancel={() => { setFormOpen(false); setEditTarget(null); setFormPreset(null) }}
        />
      )}

      {transferLinkTarget && (
        <TransferPicker
          transfer={transferLinkTarget}
          candidates={candidatesFor(transferLinkTarget)}
          onPick={handleLinkTransfer}
          onCancel={() => setTransferLinkTarget(null)}
          linking={linking}
        />
      )}

      {linkTarget && (
        <ProtocolPicker
          transfer={linkTarget.transfer}
          role={linkTarget.role}
          onPick={handleLink}
          onCancel={() => setLinkTarget(null)}
          linking={linking}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          transfer={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
