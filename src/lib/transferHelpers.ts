import { classifyEvent } from './calendarPairs'
import type { Transfer } from './transfers'

/** Heutiges Datum als YYYY-MM-DD in Ortszeit – toISOString() läge in UTC. */
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Für tel:-Links – Leerzeichen und Schrägstriche mögen manche Wählprogramme nicht. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/**
 * Adresse als Link in die Karten-App. Der Google-Maps-Link öffnet auf dem
 * Telefon die installierte App und sonst die Website – anders als ein
 * `maps:`-Link, den nur Apple-Geräte kennen.
 */
export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/**
 * Art des Protokolls, vorgeschlagen aus dem Titel der Fahrt: was nach Abholung
 * klingt, ist eine Rücknahme, alles andere ein Hinbringen.
 */
export function protocolKindOf(transfer: Transfer): string {
  const texts = [transfer.title ?? '', ...(transfer.calendar_links ?? []).map((l) => l.summary ?? '')]
  return texts.some((x) => classifyEvent(x) === 'abholung') ? 'Rücknahme' : 'Hinbringen'
}

/**
 * Mit dieser Fahrt ist das Fahrzeug neu dazugekommen, und die Abnahme fehlt
 * noch. Erledigt ist sie, sobald ein Annahmeprotokoll an der Fahrt hängt –
 * frisch erstellt oder nachträglich verknüpft.
 */
export function needsAcceptance(transfer: Transfer): boolean {
  return !!transfer.acceptance_required &&
    ![transfer.pickup_protocol, transfer.dropoff_protocol].some((p) => p?.protocol_type === 'annahme')
}
