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

/** Wie viele Termine unter "Demnächst" stehen. */
const UPCOMING_LIMIT = 5

/**
 * Etwas, das an einem bestimmten Tag passiert: Beginn oder Ende einer Fahrt,
 * bei Fahrten aus dem Kalender jeder ihrer Termine. Eine Fahrt vom 21.10. bis
 * 05.11. ist so nur an diesen beiden Tagen "heute" – an den Tagen dazwischen
 * passiert nichts, was man tun müsste.
 */
interface Moment {
  key: string
  transfer: Transfer
  day: string
  time: string | null
  title: string
  /** Endtag einer Fahrt ohne eigenen Termin an diesem Tag – meist die Rückgabe. */
  ends: boolean
}

function momentsOf(tr: Transfer): Moment[] {
  const out: Moment[] = []
  const add = (day: string | null, time: string | null, title: string | null, ends: boolean) => {
    if (!day || out.some((m) => m.day === day)) return
    out.push({ key: `${tr.id}:${day}`, transfer: tr, day, time, title: title?.trim() || titleOf(tr), ends })
  }
  const links = [...(tr.calendar_links ?? [])].sort((a, b) =>
    `${a.date_from} ${a.time_from ?? ''}`.localeCompare(`${b.date_from} ${b.time_from ?? ''}`))
  for (const l of links) add(l.date_from, l.time_from, l.summary, false)
  add(tr.date_from, tr.time_from, null, false)
  for (const l of links) if (l.date_to && l.date_to !== l.date_from) add(l.date_to, l.time_to, l.summary, true)
  if (tr.date_to && tr.date_to !== tr.date_from) add(tr.date_to, tr.time_to, null, true)
  return out
}

/** Nach Tag, dann Uhrzeit – ohne Uhrzeit ans Ende des Tages. */
function byWhen(a: Moment, b: Moment): number {
  return `${a.day} ${a.time ?? '99:99'}`.localeCompare(`${b.day} ${b.time ?? '99:99'}`)
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Schon vorbei und erledigt: die Uhrzeit liegt zurück und ein Protokoll hängt dran. */
function isDone(m: Moment, now: string): boolean {
  return !!m.time && m.time.slice(0, 5) < now && !!(m.transfer.pickup_protocol || m.transfer.dropoff_protocol)
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
    const all = (transfers ?? []).flatMap(momentsOf).sort(byWhen)
    const todays = all.filter((m) => m.day === today)
    // Oben steht das nächste, was heute noch ansteht; schon Erledigtes rückt nach unten.
    const now = nowHHMM()
    const next = todays.find((m) => !isDone(m, now)) ?? todays[0] ?? null
    return {
      next,
      later: todays.filter((m) => m !== next),
      upcoming: all.filter((m) => m.day > today).slice(0, UPCOMING_LIMIT),
      countToday: new Set(todays.map((m) => m.transfer.id)).size,
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
  const nextMoment = view.next
  const next = nextMoment?.transfer ?? null

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
            {view.upcoming[0] && (
              <p className="text-sm text-gray-600 -mt-1">
                {t('today.next_on', { day: formatDay(view.upcoming[0].day, today, lang, t) })}
              </p>
            )}
            <Link to="/ueberfuehrungen" className="text-sm font-bold text-brand-700">
              {t('today.all_transfers')}
            </Link>
          </div>
        )}

        {next && nextMoment && (
          <section className="bg-white rounded-3xl p-[18px] flex flex-col gap-3.5 shadow-[0_1px_2px_rgba(24,24,27,0.06),0_8px_24px_rgba(24,24,27,0.06)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold tracking-wider uppercase text-brand-700">
                {t('transfers.agenda_today')}{nextMoment.time ? ` · ${formatTime(nextMoment.time)}` : ''}
              </span>
              {nextMoment.ends ? (
                <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">
                  {t('today.ends_today')}
                </span>
              ) : next.status === 'unterwegs' && (
                <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                  {t('transfers.status_unterwegs')}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-extrabold tracking-tight leading-snug text-gray-900">{nextMoment.title}</h2>
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
        <List title={t('today.upcoming')} items={view.upcoming} today={today} lang={lang} grouped />
      </div>
    </div>
  )
}

function List({ title, items, today, lang, grouped = false }: {
  title: string; items: Moment[]; today: string; lang: string; grouped?: boolean
}) {
  const { t } = useTranslation()
  if (items.length === 0) return null
  // Demnächst: je Tag eine Überschrift, in der Zeile dann nur die Uhrzeit.
  const days = grouped ? [...new Set(items.map((m) => m.day))] : [today]
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1 pt-1">
        <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
        <Link to="/ueberfuehrungen" className="text-sm font-bold text-brand-700">
          {t('today.all_transfers')}
        </Link>
      </div>
      {days.map((day) => (
        <div key={day} className="flex flex-col gap-1.5">
          {grouped && (
            <h3 className="px-1 text-xs font-extrabold tracking-wider uppercase text-gray-500">
              {formatDay(day, today, lang, t)}
            </h3>
          )}
          <ul className="bg-white rounded-2xl divide-y divide-gray-100">
            {items.filter((m) => m.day === day).map((m) => <Row key={m.key} m={m} />)}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Row({ m }: { m: Moment }) {
  const { t } = useTranslation()
  const x = m.transfer
  const plate = x.vehicle?.license_plate
  const where = x.location_to || x.location_from
  return (
    <li>
      <Link to="/ueberfuehrungen" className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
        <span className="w-12 flex-shrink-0 text-[15px] font-extrabold text-gray-900">
          {formatTime(m.time) || '–'}
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[15px] font-bold text-gray-900 truncate">{m.title}</span>
          <span className="text-[13px] font-medium text-gray-600 truncate">
            {[plate, where].filter(Boolean).join(' · ') ||
              (x.vehicle_hint ? t('transfers.pending_badge', { model: x.vehicle_hint }) : '')}
          </span>
        </span>
        {m.ends ? (
          <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">
            {t('today.ends')}
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
}
