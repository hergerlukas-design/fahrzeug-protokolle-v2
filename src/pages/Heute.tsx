import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Phone, Navigation, ClipboardList, ChevronRight, Repeat } from 'lucide-react'
import { fetchOpenTransfers, type Transfer } from '../lib/transfers'
import { fetchVehicleById } from '../lib/vehicles'
import { classifyEvent, isUnconfirmed } from '../lib/calendarPairs'
import { todayISO, telHref, mapsHref, protocolKindOf, needsAcceptance } from '../lib/transferHelpers'
import { SkeletonCard } from '../components/Skeleton'
import Plate from '../components/Plate'

/** Wie viele kommende Fahrten unter "Demnächst" stehen, wenn heute nichts mehr ansteht. */
const UPCOMING_LIMIT = 3

function endOf(t: Transfer): string {
  return t.date_to ?? t.date_from
}

/** Läuft heute: der Zeitraum umfasst heute, oder das Fahrzeug ist schon unterwegs. */
function isToday(t: Transfer, today: string): boolean {
  return t.status === 'unterwegs' || (t.date_from <= today && endOf(t) >= today)
}

/**
 * Reihenfolge für "Als Nächstes": was heute läuft, nach Uhrzeit (ohne Uhrzeit
 * ans Ende des Tages), danach alles Kommende nach Datum.
 */
function sortKey(t: Transfer, today: string): string {
  const day = t.date_from < today ? today : t.date_from
  return `${day} ${t.time_from ?? '99:99'}`
}

function formatTime(value: string | null): string {
  return value ? value.slice(0, 5) : ''
}

function formatDay(value: string, today: string, lang: string, t: (k: string) => string): string {
  if (value <= today) return t('transfers.agenda_today')
  const d = new Date(`${value}T00:00:00`)
  const tomorrow = new Date(`${today}T00:00:00`)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.getTime() === tomorrow.getTime()) return t('transfers.agenda_tomorrow')
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

function titleOf(t: Transfer): string {
  return t.title || t.vehicle?.brand_model || t.vehicle?.license_plate || t.vehicle_hint || '—'
}

function isSwap(t: Transfer): boolean {
  const texts = [t.title, ...(t.calendar_links ?? []).map((l) => l.summary)]
  return texts.some((x) => classifyEvent(x) === 'tausch')
}

function unconfirmed(t: Transfer): boolean {
  return (t.calendar_links ?? []).some((l) => isUnconfirmed(l.summary))
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 flex flex-col gap-0.5">
      <span className={`text-2xl font-extrabold ${tone}`}>{value}</span>
      <span className="text-xs font-semibold text-gray-600 leading-tight">{label}</span>
    </div>
  )
}

export default function Heute() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [transfers, setTransfers] = useState<Transfer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [today, setToday] = useState(todayISO)

  const load = useCallback(async () => {
    try {
      setError(null)
      setTransfers(await fetchOpenTransfers())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  // Zurück auf die Seite (auf dem Telefon schläft sie im Hintergrund): neu
  // laden und das "Heute" weiterdrehen, falls Mitternacht dazwischen lag.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      setToday(todayISO())
      void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const view = useMemo(() => {
    const open = (transfers ?? []).filter((x) => endOf(x) >= today || x.status === 'unterwegs')
    open.sort((a, b) => sortKey(a, today).localeCompare(sortKey(b, today)))
    const todays = open.filter((x) => isToday(x, today))
    const next = open[0] ?? null
    return {
      next,
      later: todays.filter((x) => x !== next),
      upcoming: open.filter((x) => !isToday(x, today) && x !== next).slice(0, UPCOMING_LIMIT),
      countToday: todays.length,
      countOnTheWay: (transfers ?? []).filter((x) => x.status === 'unterwegs').length,
      countAcceptance: (transfers ?? []).filter(needsAcceptance).length,
    }
  }, [transfers, today])

  /** Dieselben Wege wie aus der Karte in Überführungen – mit vollständig geladenem Fahrzeug. */
  async function startProtocol(transfer: Transfer) {
    const acceptance = needsAcceptance(transfer)
    setBusy(true)
    try {
      const vehicle = transfer.vehicle_id ? await fetchVehicleById(transfer.vehicle_id) : null
      if (!vehicle) throw new Error(t('transfers.vehicle_missing'))
      navigate(acceptance ? '/annahme' : '/ueberfuehrung', {
        state: {
          vehicle_id: vehicle.id,
          license_plate: vehicle.license_plate,
          brand_model: vehicle.brand_model ?? '',
          vin: vehicle.vin ?? '',
          known_damages: vehicle.known_damages ?? [],
          transfer: {
            id: transfer.id,
            vehicle_id: vehicle.id,
            status: transfer.status,
            role: acceptance && transfer.pickup_protocol ? 'dropoff' : 'pickup',
            ...(acceptance ? {} : { transfer_type: protocolKindOf(transfer) }),
            driver_name: transfer.driver_name,
            location_from: transfer.location_from,
            location_to: transfer.location_to,
          },
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
      setBusy(false)
    }
  }

  const lang = i18n.language
  const dateLine = new Date(`${today}T00:00:00`).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const next = view.next

  /** Was mit der nächsten Fahrt zu tun ist – oder null, wenn sie schon läuft. */
  const nextAction = !next || !next.vehicle_id
    ? null
    : needsAcceptance(next)
      ? t('transfers.create_acceptance')
      : !next.pickup_protocol && !next.dropoff_protocol
        ? t('today.start_protocol')
        : null

  return (
    <div className="min-h-full bg-gray-100 pb-6">
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <img
          src="/logo.webp"
          alt=""
          className="w-9 h-9 object-contain"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-gray-600">{dateLine}</span>
          <h1 className="text-[22px] font-extrabold tracking-tight text-gray-900 leading-tight">{t('nav.today')}</h1>
        </div>
      </header>

      <div className="px-4 flex flex-col gap-3.5">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              {t('common.retry')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Stat value={view.countToday} label={t('today.stat_today')} tone="text-gray-900" />
          <Stat value={view.countOnTheWay} label={t('transfers.status_unterwegs')} tone="text-amber-700" />
          <Stat value={view.countAcceptance} label={t('transfers.acceptance_due')} tone="text-brand-700" />
        </div>

        {transfers === null && !error && <SkeletonCard />}

        {transfers !== null && !next && (
          <div className="bg-white rounded-3xl p-6 text-center flex flex-col items-center gap-3">
            <p className="font-bold text-gray-900">{t('today.empty')}</p>
            <Link to="/ueberfuehrungen" className="text-sm font-bold text-brand-700">
              {t('today.all_transfers')}
            </Link>
          </div>
        )}

        {next && (
          <section className="bg-white rounded-3xl p-[18px] flex flex-col gap-3.5 shadow-[0_1px_2px_rgba(24,24,27,0.06),0_8px_24px_rgba(24,24,27,0.06)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold tracking-wider uppercase text-brand-700">
                {t('today.next')} · {formatDay(next.date_from < today ? today : next.date_from, today, lang, t)}
                {next.time_from ? `, ${formatTime(next.time_from)}` : ''}
              </span>
              {next.status === 'unterwegs' && (
                <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                  {t('transfers.status_unterwegs')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-extrabold tracking-tight leading-snug text-gray-900">{titleOf(next)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {next.vehicle?.license_plate && <Plate plate={next.vehicle.license_plate} />}
                {next.vehicle?.brand_model && (
                  <span className="text-[13px] font-semibold text-gray-600">{next.vehicle.brand_model}</span>
                )}
                {!next.vehicle && next.vehicle_hint && (
                  <span className="text-[13px] font-semibold text-gray-600">
                    {t('transfers.pending_badge', { model: next.vehicle_hint })}
                  </span>
                )}
                {needsAcceptance(next) && (
                  <span className="text-xs font-extrabold bg-brand-100 text-brand-800 px-2 py-0.5 rounded-lg">
                    {t('transfers.acceptance_due')}
                  </span>
                )}
              </div>
            </div>

            {(next.location_from || next.location_to || next.contact_phone) && (
              <div className="flex flex-col gap-2.5 p-3 bg-gray-100 rounded-2xl text-sm font-semibold text-gray-900">
                {[next.location_from, next.location_to].filter(Boolean).map((address) => (
                  <a key={address} href={mapsHref(address!)} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5">
                    <MapPin size={18} className="text-brand-700 flex-shrink-0 mt-px" />
                    <span>{address}</span>
                  </a>
                ))}
                {next.contact_phone && (
                  <a href={telHref(next.contact_phone)} className="flex items-center gap-2.5">
                    <Phone size={18} className="text-brand-700 flex-shrink-0" />
                    <span>{[next.contact_name, next.contact_phone].filter(Boolean).join(' · ')}</span>
                  </a>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {nextAction ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startProtocol(next)}
                  className="flex-1 h-[52px] rounded-2xl bg-brand-700 text-white text-base font-extrabold flex items-center justify-center gap-2 active:bg-brand-800 disabled:opacity-60"
                >
                  <ClipboardList size={20} strokeWidth={2.2} />
                  {nextAction}
                </button>
              ) : (
                <Link
                  to="/ueberfuehrungen"
                  className="flex-1 h-[52px] rounded-2xl bg-brand-700 text-white text-base font-extrabold flex items-center justify-center gap-2 active:bg-brand-800"
                >
                  {t('today.open_transfer')}
                </Link>
              )}
              {(next.location_to || next.location_from) && (
                <a
                  href={mapsHref((next.location_to || next.location_from)!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('today.route')}
                  className="w-[52px] h-[52px] rounded-2xl border border-gray-200 bg-white text-gray-900 flex items-center justify-center"
                >
                  <Navigation size={22} />
                </a>
              )}
            </div>
          </section>
        )}

        <List title={t('today.later')} items={view.later} today={today} lang={lang} />
        <List title={t('today.upcoming')} items={view.upcoming} today={today} lang={lang} />
      </div>
    </div>
  )
}

function List({ title, items, today, lang }: { title: string; items: Transfer[]; today: string; lang: string }) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1 pt-1">
        <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
        <Link to="/ueberfuehrungen" className="text-sm font-bold text-brand-700">
          {t('today.all_transfers')}
        </Link>
      </div>
      <ul className="bg-white rounded-2xl divide-y divide-gray-100">
        {items.map((x) => {
          const sameDay = x.date_from <= today
          const when = sameDay ? formatTime(x.time_from) || '–' : formatDay(x.date_from, today, lang, t)
          const plate = x.vehicle?.license_plate
          const where = x.location_to || x.location_from
          return (
            <li key={x.id}>
              <Link to="/ueberfuehrungen" className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
                <span className="w-14 flex-shrink-0 text-[15px] font-extrabold text-gray-900">{when}</span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-bold text-gray-900 truncate">{titleOf(x)}</span>
                  <span className="text-[13px] font-medium text-gray-600 truncate">
                    {[plate, where].filter(Boolean).join(' · ') ||
                      (x.vehicle_hint ? t('transfers.pending_badge', { model: x.vehicle_hint }) : '')}
                  </span>
                </span>
                {x.status === 'unterwegs' ? (
                  <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-lg">
                    {t('transfers.status_unterwegs')}
                  </span>
                ) : isSwap(x) ? (
                  <span className="text-xs font-bold bg-blue-50 text-[#1d4fa3] px-2 py-1 rounded-lg flex items-center gap-1">
                    <Repeat size={12} />{t('transfers.calendar_swap')}
                  </span>
                ) : unconfirmed(x) ? (
                  <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded-lg">
                    {t('transfers.calendar_unconfirmed')}
                  </span>
                ) : needsAcceptance(x) ? (
                  <span className="text-xs font-bold bg-brand-100 text-brand-800 px-2 py-1 rounded-lg">
                    {t('transfers.acceptance_due')}
                  </span>
                ) : (
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
