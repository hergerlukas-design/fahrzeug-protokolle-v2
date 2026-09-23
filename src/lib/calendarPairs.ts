/**
 * Zusammengehörende Kalendertermine erkennen.
 *
 * Im Kalender steht eine Fahrt meist als zwei Termine: einmal die Abholung,
 * einmal die Überführung desselben Fahrzeugs, ein paar Tage auseinander. In der
 * App ist das eine Überführung – mit Start beim früheren und Ziel beim späteren
 * Termin.
 *
 * Zusammengefunden wird über das Fahrzeug (Kennzeichen im Titel, vom Aufrufer
 * zugeordnet) und den Abstand der Daten. Die Art des Termins entscheidet mit:
 * zwei Abholungen desselben Fahrzeugs sind zwei Fahrten, keine Hin- und
 * Rückseite derselben.
 *
 * Wie alles am Kalender ist das ein Vorschlag – das Ergebnis landet im Formular
 * und wird dort bestätigt.
 */

import type { CalendarEvent } from './transfers'

export type EventKind = 'abholung' | 'ueberfuehrung' | 'unbekannt'

/** Wie weit zwei Termine auseinanderliegen dürfen, um als eine Fahrt zu gelten. */
export const PAIR_MAX_DAYS = 3

const ABHOLUNG = ['abhol', 'ruckhol', 'pickup', 'pick up', 'collection']
// Beide Schreibweisen von Ü und ü einzeln, weil nach dem Entfernen der
// Umlaute aus "Überführung" ein "uberfuhrung" und aus "Ueberfuehrung" ein
// "ueberfuehrung" wird – gemeint ist dasselbe.
const UEBERFUEHRUNG = [
  'uberfuhr', 'uberfuehr', 'ueberfuhr', 'ueberfuehr',
  'lieferung', 'zustellung', 'bringen', 'transfer', 'delivery',
]

/**
 * Kleinschreibung ohne Umlaute – Wortgrenzen (\b) helfen hier nicht, weil ein
 * "Ü" am Wortanfang für die Regex-Engine kein Wortzeichen ist und die Grenze
 * davor deshalb gar nicht existiert.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/ß/g, 'ss')
}

/** Was für ein Termin ist das – Abholung oder Überführung? */
export function classifyEvent(summary: string | null | undefined): EventKind {
  const text = normalize(summary ?? '')
  const abholung = ABHOLUNG.some((w) => text.includes(w))
  const ueberfuehrung = UEBERFUEHRUNG.some((w) => text.includes(w))
  // Steht beides drin ("Abholung zur Überführung"), sagt der Titel nichts
  // Eindeutiges – dann entscheidet allein die Reihenfolge der Termine.
  if (abholung === ueberfuehrung) return 'unbekannt'
  return abholung ? 'abholung' : 'ueberfuehrung'
}

export interface CalendarGroup<V> {
  /** Aus den UIDs gebildet – als React-key brauchbar und stabil. */
  key: string
  /** Ein Termin oder zwei, chronologisch. */
  events: CalendarEvent[]
  vehicle: V | null
}

function dayNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(ms) ? NaN : Math.round(ms / 86_400_000)
}

/** Chronologisch: Datum, dann Uhrzeit. Termine ohne Uhrzeit zuerst. */
function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.date_from !== b.date_from) return a.date_from < b.date_from ? -1 : 1
  return (a.time_from ?? '').localeCompare(b.time_from ?? '')
}

/**
 * Termine zu Fahrten bündeln.
 *
 * `vehicleOf` ordnet einem Termin das Fahrzeug zu (in der App über das
 * Kennzeichen im Titel). Ohne Fahrzeug bleibt ein Termin für sich – ohne
 * dieses Merkmal wäre jede Paarung geraten.
 */
export function groupCalendarEvents<V extends { id: string }>(
  events: CalendarEvent[],
  vehicleOf: (event: CalendarEvent) => V | null,
  maxDays: number = PAIR_MAX_DAYS
): CalendarGroup<V>[] {
  const sorted = [...events].sort(compareEvents)
  const vehicles = new Map<string, V | null>()
  for (const ev of sorted) vehicles.set(ev.uid, vehicleOf(ev))

  const used = new Set<string>()
  const groups: CalendarGroup<V>[] = []

  for (const [i, event] of sorted.entries()) {
    if (used.has(event.uid)) continue
    const vehicle = vehicles.get(event.uid) ?? null
    used.add(event.uid)

    let partner: CalendarEvent | null = null
    if (vehicle) {
      const kind = classifyEvent(event.summary)
      const day = dayNumber(event.date_from)

      // Der nächstgelegene passende Termin gewinnt – die Liste ist sortiert,
      // also ist das der erste Treffer.
      for (const other of sorted.slice(i + 1)) {
        if (used.has(other.uid)) continue
        if (vehicles.get(other.uid)?.id !== vehicle.id) continue

        const diff = dayNumber(other.date_from) - day
        if (Number.isNaN(diff)) continue
        if (diff > maxDays) break // weiter hinten wird der Abstand nur größer

        const otherKind = classifyEvent(other.summary)
        // Zwei gleichartige Termine sind zwei Fahrten. Zwei unbestimmte auch:
        // ohne Hinweis im Titel bleibt die Zusammengehörigkeit Spekulation.
        if (kind === otherKind) continue

        partner = other
        used.add(other.uid)
        break
      }
    }

    const group = partner ? [event, partner] : [event]
    groups.push({ key: group.map((e) => e.uid).join('+'), events: group, vehicle })
  }

  return groups
}

export interface MergedEvent {
  title: string
  date_from: string
  time_from: string | null
  date_to: string | null
  time_to: string | null
  location_from: string | null
  location_to: string | null
  notes: string
  /** Alle Termine, aus denen die Fahrt entsteht. */
  uids: string[]
}

function block(event: CalendarEvent): string {
  return [event.summary, event.description].filter(Boolean).join('\n')
}

/**
 * Einen oder zwei Termine zu den Feldern einer Überführung machen.
 *
 * Bei zwei Terminen gibt der frühere den Start her und der spätere das Ziel –
 * unabhängig davon, wie sie heißen. Die Beschriftung im Titel ist beim
 * Benennen nützlich, für die Richtung der Fahrt ist die Uhr verlässlicher.
 */
export function mergeEvents(events: CalendarEvent[]): MergedEvent {
  const sorted = [...events].sort(compareEvents)
  const first = sorted[0]
  const last = sorted.length > 1 ? sorted[sorted.length - 1] : null

  if (!last) {
    return {
      title: first.summary || '',
      date_from: first.date_from,
      time_from: first.time_from,
      date_to: first.date_to,
      time_to: first.time_to,
      // Der Ort eines einzelnen Termins ist das Ziel der Fahrt, nicht der Start.
      location_from: null,
      location_to: first.location,
      notes: first.description ?? '',
      uids: [first.uid],
    }
  }

  const named = sorted.find((e) => classifyEvent(e.summary) === 'ueberfuehrung')

  return {
    title: (named ?? first).summary || '',
    date_from: first.date_from,
    time_from: first.time_from,
    date_to: last.date_to || last.date_from,
    // Beim Zieltermin zählt, wann er anfängt, falls kein Ende hinterlegt ist.
    time_to: last.time_to ?? last.time_from,
    location_from: first.location,
    location_to: last.location,
    notes: sorted.map(block).filter(Boolean).join('\n\n'),
    uids: sorted.map((e) => e.uid),
  }
}
