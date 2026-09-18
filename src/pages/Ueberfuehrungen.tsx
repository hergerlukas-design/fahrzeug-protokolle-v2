import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Route as RouteIcon, ChevronDown, ChevronRight, MapPin, User, Phone, StickyNote,
  Car, Search, AlertTriangle, X, Pencil, Trash2, Truck, CheckCircle2, RotateCcw,
  Sparkles, Droplets, Fuel, Zap, CircleCheck, Navigation,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import { errorText } from '../lib/supabase'
import { fetchVehicles, type Vehicle } from '../lib/vehicles'
import {
  fetchOpenTransfers,
  fetchClosedTransfers,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  setTransferStatus,
  findOverlappingTransfers,
  type Transfer,
  type TransferStatus,
} from '../lib/transfers'

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

function dateRange(tr: Transfer, lang: string): string {
  const from = formatDate(tr.date_from, lang)
  if (!tr.date_to || tr.date_to === tr.date_from) return from
  return `${from} – ${formatDate(tr.date_to, lang)}`
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
  expanded,
  onToggle,
  onStatus,
  onEdit,
  onDelete,
  busy,
}: {
  transfer: Transfer
  expanded: boolean
  onToggle: () => void
  onStatus: (status: TransferStatus) => void
  onEdit: () => void
  onDelete: () => void
  busy: boolean
}) {
  const { t, i18n } = useTranslation()
  const v = transfer.vehicle

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-gray-900 truncate">
              {v?.license_plate ?? t('transfers.vehicle_missing')}
            </p>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="text-sm text-gray-500 truncate">
            {v?.brand_model || <span className="italic text-gray-300">{t('vehicles.brand_unknown')}</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{dateRange(transfer, i18n.language)}</p>
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
  onSaved,
  onCancel,
}: {
  target: Transfer | null
  onSaved: () => void
  onCancel: () => void
}) {
  const { t, i18n } = useTranslation()

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleId, setVehicleId] = useState(target?.vehicle_id ?? '')
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(target?.date_from ?? '')
  const [dateTo, setDateTo] = useState(target?.date_to ?? '')
  const [locationFrom, setLocationFrom] = useState(target?.location_from ?? '')
  const [locationTo, setLocationTo] = useState(target?.location_to ?? '')
  const [driver, setDriver] = useState(target?.driver_name ?? '')
  const [contactName, setContactName] = useState(target?.contact_name ?? '')
  const [contactPhone, setContactPhone] = useState(target?.contact_phone ?? '')
  const [notes, setNotes] = useState(target?.notes ?? '')

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
        date_from: dateFrom,
        date_to: dateTo || null,
        location_from: locationFrom,
        location_to: locationTo,
        driver_name: driver,
        contact_name: contactName,
        contact_phone: contactPhone,
        notes,
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
            {target ? t('transfers.form_title_edit') : t('transfers.form_title_new')}
          </h2>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /> {error}
            </div>
          )}

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

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('transfers.date_from')} <span className="text-red-500">*</span>
              </label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('transfers.date_to')}</label>
              <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} className={field} />
            </div>
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
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Ueberfuehrungen() {
  const { t } = useTranslation()
  const loc = useLocation()

  const [open, setOpen] = useState<Transfer[]>([])
  const [closed, setClosed] = useState<Transfer[]>([])
  const [loading, setLoading] = useState(true)
  const [showClosed, setShowClosed] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Transfer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  // Der Wizard hinter dem Plus-Button öffnet das Formular über den
  // Navigations-State – auch dann, wenn diese Seite schon offen ist.
  useEffect(() => {
    const state = loc.state as { createTransfer?: number } | null
    if (state?.createTransfer) {
      setEditTarget(null)
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
        onEdit={() => { setEditTarget(transfer); setFormOpen(true) }}
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
          onSaved={() => { setFormOpen(false); setEditTarget(null); load() }}
          onCancel={() => { setFormOpen(false); setEditTarget(null) }}
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
