import { classifyEvent } from './calendarPairs'
import type { ProtocolRole, Transfer } from './transfers'

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
  if (isRoundTrip(transfer)) return 'Hinbringen'
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

/**
 * Überführung und Abholung als eine Fahrt (`calendarPairs.ts`): das Fahrzeug
 * wird am Anfang hingebracht und am Ende wieder abgeholt. Das sind zwei
 * Übergaben und damit zwei Protokolle – Hinbringen und Rücknahme.
 */
export function isRoundTrip(transfer: Transfer): boolean {
  const kinds = (transfer.calendar_links ?? []).map((l) => classifyEvent(l.summary))
  return kinds.includes('abholung') && kinds.some((k) => k === 'ueberfuehrung' || k === 'unbekannt')
}

/**
 * Das Protokoll, das an dieser Fahrt noch fehlt, mit Spalte und Art – oder
 * null, wenn keines mehr fehlt.
 *
 * Eine gewöhnliche Fahrt braucht eines. Eine Hin- und Rückfahrt braucht zwei:
 * nach dem Hinbringen fehlt noch die Rücknahme, sie kommt in die zweite
 * Spalte und schließt die Fahrt ab.
 */
export function missingProtocol(transfer: Transfer): { role: ProtocolRole; kind: string } | null {
  const pickup = transfer.pickup_protocol
  const dropoff = transfer.dropoff_protocol
  if (!pickup && !dropoff) return { role: 'pickup', kind: protocolKindOf(transfer) }
  if (!isRoundTrip(transfer) || (pickup && dropoff)) return null
  const other = (pickup ?? dropoff)!
  return {
    role: pickup ? 'dropoff' : 'pickup',
    kind: other.transfer_type === 'Rücknahme' ? 'Hinbringen' : 'Rücknahme',
  }
}
