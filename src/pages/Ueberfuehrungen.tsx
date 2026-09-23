import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
  matchVehiclesByPlate,
  type Transfer,
  type TransferInput,
  type TransferStatus,
  type ProtocolRole,
  type CalendarEvent,
  type LinkableProtocol,
} from '../lib/transfers'
import { extractContact } from '../lib/calendarContact'
import { groupCalendarEvents, mergeEvents, classifyEvent, isUnconfirmed, swapTitles } from '../lib/calendarPairs'

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

/** Postgres liefert "08:30:00" – für die Anzeige reichen Stunde und Minute. */
function formatTime(value: string | null): string {
  return value ? value.slice(0, 5) : ''
}

function withTime(date: string, time: string | null, lang: string): string {
  const t = formatTime(time)
  return t ? `${formatDate(date, lang)}, ${t}` : formatDate(date, lang)
}

/** Alle Orte der Termine als ein Text – zum Aussortieren von Anschriften. */
function locationsOf(events: CalendarEvent[]): string {
  return events.map((e) => e.location ?? '').filter(Boolean).join(' ')
}

/** Reicht für den Zeitraum – so passt auch ein gespeicherter Kalendertermin hinein. */
interface DateSpan {
  date_from: string
  date_to: string | null
  time_from: string | null
  time_to: string | null
}

function dateRange(tr: DateSpan, lang: string): string {
  const from = withTime(tr.date_from, tr.time_from, lang)
  const sameDay = !tr.date_to || tr.date_to === tr.date_from

  if (sameDay) {
    // Am selben Tag genügt die zweite Uhrzeit ohne Datumswiederholung.
    const end = formatTime(tr.time_to)
    return end ? `${from} – ${end}` : from
  }
  return `${from} – ${withTime(tr.date_to!, tr.time_to, lang)}`
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

/**
 * Adresse als Link in die Karten-App.
 *
 * Der Google-Maps-Link öffnet auf dem Telefon die installierte App und sonst
 * die Website – anders als ein `maps:`-Link, den nur Apple-Geräte kennen.
 * stopPropagation, damit das Antippen nicht zusätzlich die Karte auf- oder
 * zuklappt, in der der Link steckt.
 */
/** Für tel:-Links – Leerzeichen und Schrägstriche mögen manche Wählprogramme nicht. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

function MapLink({ address, strong = false }: { address: string; strong?: boolean }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`underline decoration-gray-300 underline-offset-2 active:text-brand-600 ${
        strong ? 'font-medium text-gray-700' : ''
      }`}
    >
      {address}
    </a>
  )
}

/** Ort oder Strecke mit Kartenlink – in der Terminkarte wie in der Fahrt. */
function LocationLine({ from, to }: { from?: string | null; to?: string | null }) {
  const start = from?.trim() || null
  const end = to?.trim() || null
  if (!start && !end) return null

  return (
    <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
      <MapPin size={12} className="text-gray-400 flex-shrink-0 mt-0.5" />
      <span>
        {start && end ? (
          <>
            <MapLink address={start} />
            <span className="text-gray-400"> → </span>
            <MapLink address={end} strong />
          </>
        ) : (
          <MapLink address={(end || start) as string} />
        )}
      </span>
    </p>
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

/**
 * Hinbringen oder Rücknahme?
 *
 * Im Protokoll ist das die "Art der Überführung", und der Titel der Fahrt sagt
 * es meist schon: "Abholung Lynk 02 DPG98A" ist eine Rücknahme, alles andere
 * ein Hinbringen. Ein Vorschlag – im Protokoll selbst bleibt es umstellbar.
 */
function protocolKindOf(transfer: Transfer): string {
  const texts = [transfer.title ?? '', ...(transfer.calendar_links ?? []).map((l) => l.summary ?? '')]
  return texts.some((x) => classifyEvent(x) === 'abholung') ? 'Rücknahme' : 'Hinbringen'
}

interface CardBlock {
  key: string
  title: string
  when: string
  from: string | null
  to: string | null
}

/**
 * Wie eine Fahrt aussieht: ein Block je übernommenem Termin.
 *
 * Eine übernommene Fahrt sieht aus wie der Termin, aus dem sie entstanden ist –
 * bei einem Paar mit beiden Blöcken. Fahrten ohne gespeicherte Termine (von
 * Hand angelegt oder vor dieser Änderung übernommen) zeigen ihre eigenen Daten.
 */
function blocksOf(transfer: Transfer, t: TFunction, lang: string): CardBlock[] {
  const links = [...(transfer.calendar_links ?? [])]
    .filter((l) => l.date_from)
    .sort((a, b) =>
      (a.date_from ?? '').localeCompare(b.date_from ?? '') ||
      (a.time_from ?? '').localeCompare(b.time_from ?? ''))

  if (links.length > 0) {
    return links.map((l) => ({
      key: l.calendar_uid,
      title: l.summary?.trim() || t('transfers.calendar_untitled'),
      when: dateRange({ ...l, date_from: l.date_from as string }, lang),
      from: null,
      to: l.location,
    }))
  }

  return [{
    key: transfer.id,
    title: transfer.title?.trim() || transfer.vehicle?.license_plate || t('transfers.vehicle_missing'),
    when: dateRange(transfer, lang),
    from: transfer.location_from,
    to: transfer.location_to,
  }]
}

/**
 * Der Kopf einer Fahrt: die Blöcke ihrer Termine, Kontakt und Kennzeichen.
 *
 * Bewusst kein <button>: die Karte enthält Links (Adresse, Telefon), und die
 * dürfen nicht in einer Schaltfläche stecken.
 */
function TransferHead({
  transfer,
  expanded,
  onToggle,
  attached = false,
}: {
  transfer: Transfer
  expanded: boolean
  onToggle: () => void
  /** Hängt diese Fahrt an einer anderen? Dann trägt sie das Kettensymbol. */
  attached?: boolean
}) {
  const { t, i18n } = useTranslation()
  const v = transfer.vehicle
  const plate = v?.license_plate ?? t('transfers.vehicle_missing')
  const blocks = blocksOf(transfer, t, i18n.language)

  return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
        }}
        className={`w-full flex items-center gap-3 px-4 text-left cursor-pointer ${
          attached ? 'py-2.5 active:bg-gray-100' : 'py-3 active:bg-gray-50'
        }`}
      >
        {attached && <Link2 size={13} className="text-gray-300 flex-shrink-0 self-start mt-1" />}
        <div className="flex-1 min-w-0">
        {blocks.map((b, idx) => (
          <div key={b.key} className={idx > 0 ? 'mt-2 pt-2 border-t border-dashed border-gray-200' : ''}>
            <p className={attached ? 'text-sm font-medium text-gray-700' : 'font-semibold text-gray-900 text-sm'}>
              {b.title}
            </p>
            {b.when && <p className="text-xs text-gray-400 mt-0.5">{b.when}</p>}
            <LocationLine from={b.from} to={b.to} />
          </div>
        ))}

        {(transfer.contact_name || transfer.contact_phone) && (
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <Phone size={12} className="text-gray-400 flex-shrink-0" />
            <span className="truncate">
              {transfer.contact_name}
              {transfer.contact_name && transfer.contact_phone && <span className="text-gray-400"> · </span>}
              {transfer.contact_phone && (
                <a
                  href={telHref(transfer.contact_phone)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-600 font-medium"
                >
                  {transfer.contact_phone}
                </a>
              )}
            </span>
          </p>
        )}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            v ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {plate}
          </span>
          <StatusBadge status={transfer.status} />
          {v?.brand_model && <span className="text-[11px] text-gray-400 truncate">{v.brand_model}</span>}
        </div>
        </div>
        {/* Bleibt rechts mittig stehen, auch wenn die Marken umbrechen. */}
        {expanded
          ? <ChevronDown size={18} className="text-gray-300 flex-shrink-0" />
          : <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />}
      </div>
  )
}

/** Alles, was aufgeklappt zu einer Fahrt gehört – Protokolle, Status, Verbindungen. */
function TransferDetails({
  transfer,
  related,
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
  onStatus: (status: TransferStatus) => void
  onCreateProtocol: () => void
  onLinkProtocol: () => void
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

  // Was tatsächlich hängt – meist eines, an älteren Fahrten auch zwei.
  const attached = (['pickup', 'dropoff'] as ProtocolRole[]).filter((role) =>
    role === 'pickup' ? transfer.pickup_protocol : transfer.dropoff_protocol
  )

  return (
      <div className="border-t border-gray-100 px-4 py-3 space-y-3">
        {transfer.driver_name && (
          <Row icon={<User size={16} />}>{transfer.driver_name}</Row>
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

        {/* Das Protokoll dieser Fahrt.

            Eine Fahrt braucht eines – hin oder zurück steht im Protokoll selbst
            ("Art der Überführung"). Zwei Zeilen, Abhol- und Ankunftsprotokoll,
            ließen aussehen, als brauchte jede Fahrt beide. Ältere Fahrten, an
            denen zwei hängen, zeigen weiter beide. */}
        <div className="pt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {t(attached.length > 1 ? 'transfers.protocols' : 'transfers.protocol_single')}
          </p>
          <div className="space-y-1.5">
            {(attached.length > 0 ? attached : (['pickup'] as ProtocolRole[])).map((role) => {
              const proto = role === 'pickup' ? transfer.pickup_protocol : transfer.dropoff_protocol
              const label = t('transfers.protocol_single')
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
                        {proto.transfer_type && <span className="text-gray-400"> · {proto.transfer_type}</span>}
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
                    onClick={() => onCreateProtocol()}
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
                    onClick={() => onLinkProtocol()}
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
  )
}

/**
 * Eine Karte je Fahrt – und was mit ihr verbunden ist, hängt darunter.
 *
 * Verbundene Fahrten sind meist die Abholung, die der Kalender nicht als
 * solche hergab, oder die des getauschten Fahrzeugs: A fährt am 1.11. hin,
 * wird am 3.11. gegen B getauscht, B kommt am 6.11. zurück. Das ist eine
 * Reise, und so steht sie auch da – untereinander in einer Karte, statt als
 * drei Karten, die nichts voneinander wissen.
 *
 * Jede der angehängten Fahrten bleibt eine eigene Fahrt: eigener Status,
 * eigene Protokolle, eigenes Aufklappen. Deshalb bekommt jede ihren eigenen
 * Kopf und ihren eigenen aufgeklappten Teil.
 */
function TransferCard({
  transfer,
  members,
  relatedOf,
  expandedId,
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
  busyId,
}: {
  transfer: Transfer
  /** Die verbundenen Fahrten, die unter dieser hängen – chronologisch. */
  members: Transfer[]
  /** Alle Fahrten derselben Gruppe, auch die aus einem anderen Abschnitt. */
  relatedOf: (transfer: Transfer) => Transfer[]
  expandedId: string | null
  onToggle: (transferId: string) => void
  onStatus: (transfer: Transfer, status: TransferStatus) => void
  onCreateProtocol: (transfer: Transfer) => void
  onLinkProtocol: (transfer: Transfer) => void
  onUnlinkProtocol: (transfer: Transfer, role: ProtocolRole) => void
  onOpenProtocol: (protocolId: string) => void
  onLinkTransfer: (transfer: Transfer) => void
  onUnlinkTransfer: (transfer: Transfer, other: Transfer) => void
  onOpenTransfer: (transferId: string) => void
  onEdit: (transfer: Transfer) => void
  onDelete: (transfer: Transfer) => void
  busyId: string | null
}) {
  const details = (x: Transfer) => (
    <TransferDetails
      transfer={x}
      related={relatedOf(x)}
      onStatus={(status) => onStatus(x, status)}
      onCreateProtocol={() => onCreateProtocol(x)}
      onLinkProtocol={() => onLinkProtocol(x)}
      onUnlinkProtocol={(role) => onUnlinkProtocol(x, role)}
      onOpenProtocol={onOpenProtocol}
      onLinkTransfer={() => onLinkTransfer(x)}
      onUnlinkTransfer={(other) => onUnlinkTransfer(x, other)}
      onOpenTransfer={onOpenTransfer}
      onEdit={() => onEdit(x)}
      onDelete={() => onDelete(x)}
      busy={busyId === x.id}
    />
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div id={`transfer-${transfer.id}`}>
        <TransferHead
          transfer={transfer}
          expanded={expandedId === transfer.id}
          onToggle={() => onToggle(transfer.id)}
        />
        {expandedId === transfer.id && details(transfer)}
      </div>

      {/* Die verbundenen Fahrten, etwas blasser: sie gehören dazu, sind aber
          nicht diese Fahrt. */}
      {members.map((m) => (
        <div
          key={m.id}
          id={`transfer-${m.id}`}
          className="bg-gray-50/70 border-t border-dashed border-gray-200"
        >
          <TransferHead
            transfer={m}
            expanded={expandedId === m.id}
            onToggle={() => onToggle(m.id)}
            attached
          />
          {expandedId === m.id && details(m)}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / edit form – bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function TransferForm({
  target,
  preset,
  candidates = [],
  presetLinks,
  note,
  onSaved,
  onCancel,
}: {
  target: Transfer | null
  /** Vorbelegung für eine neue Überführung, etwa aus einem Kalendertermin. */
  preset?: TransferInput | null
  /** Fahrten, mit denen sich diese hier schon beim Anlegen verbinden lässt. */
  candidates?: Transfer[]
  /** Schon vorgemerkte Verbindungen – etwa die Fahrt, aus der heraus der
      Termin übernommen wurde. */
  presetLinks?: Transfer[]
  /** Hinweis über dem Formular – etwa welcher Schritt eines Tauschs das ist. */
  note?: string | null
  /** Die gespeicherte Fahrt und die Fahrten, mit denen sie verbunden werden soll. */
  onSaved: (saved: Transfer, links: Transfer[]) => void
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

  // Verbindungen zu anderen Fahrten. Nur beim Anlegen: eine bestehende Fahrt
  // verwaltet sie in ihrer Karte, sonst stünde dasselbe an zwei Stellen.
  const [links, setLinks] = useState<Transfer[]>(presetLinks ?? [])
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')

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

  const linkable = useMemo(() => {
    const chosen = new Set(links.map((l) => l.id))
    const needle = linkSearch.trim().toUpperCase()
    return candidates
      .filter((c) => !chosen.has(c.id))
      .filter((c) =>
        !needle ||
        [c.title, c.vehicle?.license_plate, c.vehicle?.brand_model, c.location_to]
          .some((f) => (f ?? '').toUpperCase().includes(needle))
      )
  }, [candidates, links, linkSearch])

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
        calendar_events: preset?.calendar_events,
      }
      const saved = target ? await updateTransfer(target.id, values) : await createTransfer(values)
      // Verbunden wird erst danach – vorher gibt es keine ID, an der die
      // Gruppe hängen könnte.
      onSaved(saved, links)
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

          {note && (
            <p className="-mt-2 text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
              {note}
            </p>
          )}

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

          {/* Verbundene Fahrten – beim Anlegen, damit Hin- und Rückfahrt nicht
              erst nachträglich zueinander finden müssen. */}
          {!target && (candidates.length > 0 || links.length > 0) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('transfers.linked_section')}
              </label>

              {links.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {links.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50">
                      <Link2 size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-800 truncate">
                          {l.title?.trim() || l.vehicle?.license_plate || t('transfers.vehicle_missing')}
                        </span>
                        <span className="block text-xs text-gray-400 truncate">
                          {l.title?.trim() && `${l.vehicle?.license_plate ?? ''} · `}
                          {dateRange(l, i18n.language)}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLinks((cur) => cur.filter((x) => x.id !== l.id))}
                        aria-label={t('transfers.unlink_transfer')}
                        className="text-gray-300 active:text-gray-600 flex-shrink-0"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {linkOpen ? (
                <div className="border border-gray-200 rounded-xl p-2 space-y-1.5">
                  {candidates.length > 3 && (
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={linkSearch}
                        onChange={(e) => setLinkSearch(e.target.value)}
                        placeholder={t('transfers.vehicle_placeholder')}
                        className="w-full border border-gray-300 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>
                  )}
                  {linkable.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2 px-1">{t('transfers.link_transfer_empty')}</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto space-y-1.5">
                      {linkable.slice(0, 30).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setLinks((cur) => [...cur, c])
                            setLinkOpen(false)
                            setLinkSearch('')
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-left active:bg-gray-50"
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
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setLinkOpen(false); setLinkSearch('') }}
                    className="w-full py-2 text-sm font-medium text-gray-500 active:text-gray-700"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setLinkOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-500 active:bg-gray-50"
                >
                  <Link2 size={15} /> {t('transfers.link_transfer')}
                </button>
              )}

              <p className="text-xs text-gray-400 mt-1">{t('transfers.link_new_hint')}</p>
            </div>
          )}

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
  events,
  vehicles,
  onPick,
  onPickEvents,
  onCancel,
  linking,
}: {
  transfer: Transfer
  candidates: Transfer[]
  /** Termine, aus denen noch keine Fahrt geworden ist. */
  events: CalendarEvent[]
  vehicles: Vehicle[]
  onPick: (other: Transfer) => void
  /** Einen Termin übernehmen und die neue Fahrt gleich verbinden. */
  onPickEvents: (events: CalendarEvent[], vehicle: Vehicle | null) => void
  onCancel: () => void
  linking: boolean
}) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')

  const needle = search.trim().toUpperCase()

  const filtered = useMemo(() => {
    if (!needle) return candidates
    return candidates.filter((c) =>
      [c.title, c.vehicle?.license_plate, c.vehicle?.brand_model, c.location_to]
        .some((f) => (f ?? '').toUpperCase().includes(needle))
    )
  }, [candidates, needle])

  // Verbunden werden soll oft mit einer Fahrt, die es noch gar nicht gibt –
  // die Abholung steht dann noch als Termin im Kalender. Also stehen die hier
  // mit zur Wahl; übernommen wird sie im Formular, verbunden beim Speichern.
  const groups = useMemo(
    () => groupCalendarEvents(events, (ev) => matchVehicleByPlate(ev.summary, vehicles)),
    [events, vehicles]
  )

  const openGroups = useMemo(() => {
    if (!needle) return groups
    return groups.filter((g) =>
      g.events.some((e) =>
        [e.summary, e.location].some((f) => (f ?? '').toUpperCase().includes(needle))
      ) || (g.vehicle?.license_plate ?? '').toUpperCase().includes(needle)
    )
  }, [groups, needle])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-w-2xl mx-auto max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-1">{t('transfers.link_transfer_title')}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {transfer.title?.trim() || transfer.vehicle?.license_plate} · {dateRange(transfer, i18n.language)}
        </p>

        {candidates.length + groups.length > 3 && (
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

        {filtered.length === 0 && openGroups.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">{t('transfers.link_transfer_empty')}</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.length > 0 && openGroups.length > 0 && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-1">
                {t('transfers.link_section_existing')}
              </p>
            )}
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

            {openGroups.length > 0 && (
              <>
                {filtered.length > 0 && (
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide pt-2">
                    {t('transfers.calendar_section')}
                  </p>
                )}
                {openGroups.slice(0, 30).map((g) => {
                  const first = g.events[0]
                  const last = g.events[g.events.length - 1]
                  return (
                    <button
                      key={g.key}
                      onClick={() => onPickEvents(g.events, g.vehicle)}
                      disabled={linking}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 text-left active:bg-gray-50 disabled:opacity-50"
                    >
                      <CalendarDays size={15} className="text-gray-400 flex-shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-800 truncate">
                          {first.summary || t('transfers.calendar_untitled')}
                        </span>
                        <span className="block text-xs text-gray-400 truncate">
                          {g.vehicle && `${g.vehicle.license_plate} · `}
                          {withTime(first.date_from, first.time_from, i18n.language)}
                          {(last.date_to || last.date_from) !== first.date_from &&
                            ` – ${formatDate(last.date_to || last.date_from, i18n.language)}`}
                          {first.location && ` · ${first.location}`}
                        </span>
                      </span>
                      <Download size={15} className="text-gray-300 flex-shrink-0" />
                    </button>
                  )
                })}
              </>
            )}
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
  onPick,
  onCancel,
  linking,
}: {
  transfer: Transfer
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
          {t('transfers.link_title', { which: t('transfers.protocol_single') })}
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
            // Der Ort des Termins hilft beim Aussortieren: was dort steht, ist
            // kein Ansprechpartner, auch wenn es über der Nummer steht.
            const contact = extractContact(merged.notes, { exclude: locationsOf(group.events) })
            const vehicle = group.vehicle
            const pair = group.events.length > 1
            // Ein Tausch nennt zwei Fahrzeuge, ein Fragezeichen heißt: noch
            // nicht vom Kunden bestätigt.
            const plates = matchVehiclesByPlate(group.events.map((e) => e.summary).join(' '), vehicles)
            const swap = group.events.some((e) => classifyEvent(e.summary) === 'tausch')
            // Ein Tausch mit zwei bekannten Fahrzeugen wird zu zwei Fahrten –
            // der Knopf sagt es, bevor das Formular zweimal aufgeht.
            const halves = swapTitles(group.events)
            const picked = halves ? matchVehiclesByPlate(halves.pick, vehicles)[0] : undefined
            const brought = halves ? matchVehiclesByPlate(halves.bring, vehicles)[0] : undefined
            const splitSwapImport = !!picked && !!brought && picked.id !== brought.id
            const unconfirmed = group.events.some((e) => isUnconfirmed(e.summary))
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
                        <LocationLine to={ev.location} />
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
                        <Phone size={12} className="text-gray-400 flex-shrink-0" />
                        <a href={telHref(contact.phone)} className="text-brand-600 font-medium">
                          {contact.phone}
                        </a>
                      </span>
                    )}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* Beim Tausch stehen zwei Kennzeichen im Titel – beide zeigen. */}
                  {plates.length > 0 ? (
                    plates.map((v) => (
                      <span key={v.id} className="text-[10px] font-semibold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {v.license_plate}
                      </span>
                    ))
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
                  {swap && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {t('transfers.calendar_swap')}
                    </span>
                  )}
                  {unconfirmed && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {t('transfers.calendar_unconfirmed')}
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
                    {splitSwapImport
                      ? t('transfers.calendar_import_swap')
                      : pair
                        ? t('transfers.calendar_import_pair')
                        : t('transfers.calendar_import')}
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
  const [formNote, setFormNote] = useState<string | null>(null)
  // Beim Übernehmen aus einer anderen Fahrt heraus schon vorgemerkt.
  const [formLinks, setFormLinks] = useState<Transfer[]>([])
  // Zählt jedes Öffnen mit: Der zweite Teil eines Tauschs geht in dasselbe
  // Formular, das ohne neuen key die Felder des ersten behielte.
  const [formSeq, setFormSeq] = useState(0)

  // Tausch: aus einem Termin werden zwei Fahrten. Der zweite Teil steht schon
  // fest, während der erste noch im Formular ist; verbunden werden sie, sobald
  // auch der zweite gespeichert ist.
  const [swapNext, setSwapNext] = useState<TransferInput | null>(null)
  const [swapFirst, setSwapFirst] = useState<Transfer | null>(null)

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

  const openForm = useCallback(
    (opts: {
      target?: Transfer | null
      preset?: TransferInput | null
      note?: string | null
      links?: Transfer[]
    } = {}) => {
      setEditTarget(opts.target ?? null)
      setFormPreset(opts.preset ?? null)
      setFormNote(opts.note ?? null)
      setFormLinks(opts.links ?? [])
      setFormSeq((n) => n + 1)
      setFormOpen(true)
    },
    []
  )

  /** Formular zu und alles vergessen – auch einen angefangenen Tausch. */
  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditTarget(null)
    setFormPreset(null)
    setFormNote(null)
    setFormLinks([])
    setSwapNext(null)
    setSwapFirst(null)
  }, [])

  // Der Wizard hinter dem Plus-Button öffnet das Formular über den
  // Navigations-State – auch dann, wenn diese Seite schon offen ist.
  useEffect(() => {
    const state = loc.state as { createTransfer?: number } | null
    if (state?.createTransfer) openForm()
  }, [loc.state, openForm])

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
  /**
   * Protokoll zu einer Fahrt anlegen.
   *
   * Es gibt eines je Fahrt; ob hin oder zurück, steht im Protokoll selbst und
   * wird aus dem Titel vorgeschlagen. Gespeichert wird es in der Spalte für das
   * Abholprotokoll – mit ihm ist die Fahrt unterwegs.
   */
  async function handleCreateProtocol(transfer: Transfer) {
    const role: ProtocolRole = 'pickup'
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
            transfer_type: protocolKindOf(transfer),
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
   *
   * Ein Tausch ("Tausch A gegen B") ist zweierlei: A wird abgeholt, B gebracht.
   * Daraus werden zwei Fahrten, das Formular geht also zweimal auf – erst für
   * das gebrachte Fahrzeug, dann für das geholte. Verbunden werden sie am Ende
   * von selbst.
   *
   * Die Termine teilen sich dabei auf: der Tauschtermin gehört zur Fahrt des
   * gebrachten Fahrzeugs, die Termine davor (die Überführung, die A überhaupt
   * erst hinbrachte) zur Fahrt des geholten. Bekämen beide alles, stünde jeder
   * Termin zweimal in derselben Karte.
   */
  function handleImportEvents(events: CalendarEvent[], vehicle: Vehicle | null, links: Transfer[] = []) {
    const merged = mergeEvents(events)
    // Ansprechpartner und Telefon stehen, wenn überhaupt, in den Notizen –
    // der Titel trägt das Kennzeichen und sonst nichts Verlässliches.
    const contact = extractContact(merged.notes, { exclude: locationsOf(events) })
    const base = {
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
      // Mit Inhalt, damit die Karte der Fahrt später dieselben Blöcke zeigt.
      calendar_events: events,
    }

    const halves = swapTitles(events)
    const pickVehicle = halves ? matchVehiclesByPlate(halves.pick, vehicles)[0] ?? null : null
    const bringVehicle = halves ? matchVehiclesByPlate(halves.bring, vehicles)[0] ?? null : null

    // Nur wenn wirklich zwei Fahrzeuge im Titel stehen. Steht eines davon
    // nicht in der Flotte, bleibt es bei einer Fahrt – zwei anzulegen, von
    // denen eine kein Fahrzeug hat, hilft niemandem.
    if (halves && pickVehicle && bringVehicle && pickVehicle.id !== bringVehicle.id) {
      // Beide Fahrten treffen sich am selben Ort: dorthin wird gebracht, von
      // dort wird geholt.
      const spot = merged.location_to || merged.location_from || null
      const swapEvents = events.filter((e) => classifyEvent(e.summary) === 'tausch')
      const restEvents = events.filter((e) => classifyEvent(e.summary) !== 'tausch')

      // Das geholte Fahrzeug stand schon da – seine Fahrt ist die Überführung
      // davor und endet mit dem Tausch. Die Zeiten kommen deshalb weiter aus
      // allen Terminen, die Blöcke der Karte aber nur aus den eigenen.
      setSwapNext({
        ...base,
        vehicle_id: pickVehicle.id,
        title: t('transfers.swap_pick', { what: halves.pick }),
        location_from: spot,
        location_to: null,
        calendar_uid: restEvents[0]?.uid ?? base.calendar_uid,
        calendar_uids: restEvents.map((e) => e.uid),
        calendar_events: restEvents,
      })

      // Das gebrachte Fahrzeug kommt mit dem Tauschtermin – und nur mit ihm.
      const brought = mergeEvents(swapEvents)
      const broughtContact = extractContact(brought.notes, { exclude: locationsOf(swapEvents) })
      openForm({
        preset: {
          vehicle_id: bringVehicle.id,
          title: t('transfers.swap_bring', { what: halves.bring }),
          date_from: brought.date_from,
          date_to: brought.date_to,
          time_from: brought.time_from,
          time_to: brought.time_to,
          location_from: null,
          location_to: spot,
          contact_name: broughtContact.name,
          contact_phone: broughtContact.phone,
          notes: brought.notes,
          calendar_uid: swapEvents[0].uid,
          calendar_uids: swapEvents.map((e) => e.uid),
          calendar_events: swapEvents,
        },
        note: `${t('transfers.swap_step', { step: 1 })} · ${t('transfers.swap_hint_bring')}`,
        links,
      })
      return
    }

    openForm({ preset: { ...base, vehicle_id: vehicle?.id ?? '' }, links })
  }

  /**
   * Nach dem Speichern: verbinden, was verbunden werden soll, und beim Tausch
   * gleich den zweiten Teil aufschlagen.
   *
   * Die Gruppe wandert von Aufruf zu Aufruf weiter – ohne sie bekäme jede
   * weitere Verbindung eine eigene und die vorige fiele wieder heraus.
   */
  async function handleFormSaved(saved: Transfer, links: Transfer[]) {
    setFormOpen(false)
    setEditTarget(null)
    setFormPreset(null)
    setFormNote(null)

    const partners = swapFirst ? [swapFirst, ...links] : links
    setSwapFirst(null)

    try {
      let group = saved.group_id
      for (const other of partners) {
        group = await linkTransfers({ id: saved.id, group_id: group }, other)
      }
    } catch (e) {
      setError(errorText(e, t('common.error')))
    }

    if (swapNext) {
      setSwapFirst(saved)
      setSwapNext(null)
      openForm({
        preset: swapNext,
        note: `${t('transfers.swap_step', { step: 2 })} · ${t('transfers.swap_hint_pick')}`,
      })
    }

    await load()
    loadCalendar()
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

  /**
   * Eine Liste in Karten aufteilen: verbundene Fahrten in eine.
   *
   * Die früheste Fahrt einer Gruppe führt, die anderen hängen darunter – so
   * steht eine Reise (hin, Tausch, Rückholung) untereinander statt verteilt
   * über drei Karten, die dasselbe dreimal zeigen. Die Reihenfolge der Liste
   * bleibt: die Gruppe steht dort, wo ihre erste Fahrt stünde.
   */
  function toCards(rows: Transfer[]): { lead: Transfer; members: Transfer[] }[] {
    const seen = new Set<string>()
    const cards: { lead: Transfer; members: Transfer[] }[] = []

    for (const row of rows) {
      if (seen.has(row.id)) continue
      const group = row.group_id ? rows.filter((x) => x.group_id === row.group_id) : [row]
      for (const x of group) seen.add(x.id)
      cards.push({ lead: row, members: group.filter((x) => x.id !== row.id) })
    }
    return cards
  }

  function renderCard({ lead, members }: { lead: Transfer; members: Transfer[] }) {
    return (
      <TransferCard
        key={lead.id}
        transfer={lead}
        members={members}
        relatedOf={relatedOf}
        expandedId={expanded}
        onToggle={(id) => setExpanded((cur) => (cur === id ? null : id))}
        onStatus={handleStatus}
        onCreateProtocol={handleCreateProtocol}
        onLinkTransfer={(x) => setTransferLinkTarget(x)}
        onUnlinkTransfer={handleUnlinkTransfer}
        onOpenTransfer={handleOpenTransfer}
        onLinkProtocol={(x) => setLinkTarget({ transfer: x, role: 'pickup' })}
        onUnlinkProtocol={handleUnlink}
        onOpenProtocol={(protocolId) => navigate('/archiv', { state: { protocol_id: protocolId } })}
        onEdit={(x) => openForm({ target: x })}
        onDelete={(x) => setDeleteTarget(x)}
        busyId={busyId}
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
                <div className="space-y-2">{toCards(open).map(renderCard)}</div>
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
                {showClosed && <div className="space-y-2 mt-2 opacity-70">{toCards(closed).map(renderCard)}</div>}
              </section>
            )}
          </>
        )}
      </div>

      {formOpen && (
        <TransferForm
          // Neuer key je Öffnen: Sonst stünden im zweiten Teil eines Tauschs
          // noch die Felder des ersten.
          key={formSeq}
          target={editTarget}
          preset={formPreset}
          candidates={editTarget ? candidatesFor(editTarget) : all}
          presetLinks={formLinks}
          note={formNote}
          onSaved={handleFormSaved}
          onCancel={closeForm}
        />
      )}

      {transferLinkTarget && (
        <TransferPicker
          transfer={transferLinkTarget}
          candidates={candidatesFor(transferLinkTarget)}
          events={calendarEvents}
          vehicles={vehicles}
          onPick={handleLinkTransfer}
          onPickEvents={(events, vehicle) => {
            // Der Termin wird übernommen wie aus dem Kalenderbereich – die
            // Fahrt, aus der heraus verknüpft wurde, steht dabei schon im
            // Formular und wird beim Speichern verbunden.
            const target = transferLinkTarget
            setTransferLinkTarget(null)
            handleImportEvents(events, vehicle, [target])
          }}
          onCancel={() => setTransferLinkTarget(null)}
          linking={linking}
        />
      )}

      {linkTarget && (
        <ProtocolPicker
          transfer={linkTarget.transfer}
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
