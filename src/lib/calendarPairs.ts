/**
 * Zusammengehörende Kalendertermine erkennen.
 *
 * Im Kalender steht eine Fahrt meist als zwei Termine: der Zeitraum der
 * Überführung ("LYNK 02 MY27 in Seevetal", 02.11.–09.11.) und die Abholung
 * darin ("Abholung LYNK 02 MY27 in Seevetal", 09.11. um 12:00). In der App ist
 * das eine Überführung.
 *
 * Zusammen gehören zwei Termine, wenn sie dasselbe Fahrzeug betreffen
 * (Kennzeichen im Titel, vom Aufrufer zugeordnet) und ihre Zeiträume sich
 * berühren – der Abholtermin also in den Zeitraum der Überführung fällt,
 * typischerweise auf dessen letzten Tag. Ein bloß ähnliches Datum genügt
 * nicht: zwei Fahrten desselben Fahrzeugs in derselben Woche sind zwei
 * Fahrten. Die Art des Termins entscheidet mit, damit aus zwei Abholungen
 * nicht eine Fahrt wird.
 *
 * Wie alles am Kalender ist das ein Vorschlag – das Ergebnis landet im Formular
 * und wird dort bestätigt.
 */

import type { CalendarEvent } from './transfers'

export type EventKind = 'abholung' | 'ueberfuehrung' | 'tausch' | 'unbekannt'

/**
 * Wie viele Tage zwischen zwei Zeiträumen liegen dürfen, damit sie noch als
 * eine Fahrt gelten. 0 heißt: sie müssen sich überschneiden oder berühren.
 */
export const PAIR_MAX_GAP_DAYS = 0

const ABHOLUNG = ['abhol', 'ruckhol', 'pickup', 'pick up', 'collection']
/** Beim Tausch kommt ein Fahrzeug und ein anderes geht – zwei Kennzeichen im Titel. */
const TAUSCH = ['tausch', 'wechsel', 'swap']
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

/** Was für ein Termin ist das – Abholung, Überführung oder Tausch? */
export function classifyEvent(summary: string | null | undefined): EventKind {
  const text = normalize(summary ?? '')
  // Der Tausch steht für sich: dort geht es um zwei Fahrzeuge, nicht um die
  // eine Hälfte einer Fahrt.
  if (TAUSCH.some((w) => text.includes(w))) return 'tausch'

  const abholung = ABHOLUNG.some((w) => text.includes(w))
  const ueberfuehrung = UEBERFUEHRUNG.some((w) => text.includes(w))
  // Steht beides drin ("Abholung zur Überführung"), sagt der Titel nichts
  // Eindeutiges – dann entscheidet allein die Reihenfolge der Termine.
  if (abholung === ueberfuehrung) return 'unbekannt'
  return abholung ? 'abholung' : 'ueberfuehrung'
}

/**
 * Ein Fragezeichen im Titel heißt: der Kunde hat den Termin noch nicht
 * bestätigt. Übernehmen kann man ihn trotzdem – er ist dann eben geplant.
 */
export function isUnconfirmed(summary: string | null | undefined): boolean {
  return (summary ?? '').includes('?')
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

/** Erster und letzter Tag eines Termins als Tageszahl. */
function span(event: CalendarEvent): { start: number; end: number } {
  const start = dayNumber(event.date_from)
  const end = dayNumber(event.date_to || event.date_from)
  return { start, end: Number.isNaN(end) ? start : Math.max(start, end) }
}

/**
 * Berühren sich die Zeiträume – liegt der eine Termin also im anderen?
 *
 * `gap` erlaubt zusätzlich einen Abstand in Tagen; voreingestellt ist 0, es
 * muss also wirklich eine Überschneidung sein.
 */
function connected(a: CalendarEvent, b: CalendarEvent, gap: number): boolean {
  const x = span(a)
  const y = span(b)
  if ([x.start, x.end, y.start, y.end].some(Number.isNaN)) return false
  return x.start - gap <= y.end && y.start - gap <= x.end
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
  maxGapDays: number = PAIR_MAX_GAP_DAYS
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
      const end = span(event).end

      // Der nächstgelegene passende Termin gewinnt – die Liste ist sortiert,
      // also ist das der erste Treffer.
      for (const other of sorted.slice(i + 1)) {
        if (used.has(other.uid)) continue

        // Weiter hinten fangen die Termine nur noch später an: berührt einer
        // das Ende dieses Zeitraums nicht mehr, tut es auch keiner danach.
        const otherStart = span(other).start
        if (!Number.isNaN(otherStart) && otherStart - maxGapDays > end) break

        if (vehicles.get(other.uid)?.id !== vehicle.id) continue
        if (!connected(event, other, maxGapDays)) continue

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

  // Das Ende der Fahrt ist der späteste Tag aller Termine, nicht der des
  // zuletzt beginnenden: fällt die Abholung mitten in den Zeitraum der
  // Überführung, bleibt deren Ende stehen.
  const withEnd = sorted.map((e) => ({ e, end: e.date_to || e.date_from }))
  // Bei gleichem Enddatum gewinnt der spätere Termin – der Zeitraum hat keine
  // Uhrzeit, die Abholung darin schon.
  const latest = withEnd.reduce((a, b) => (b.end >= a.end ? b : a))
  const timeTo =
    withEnd
      .filter((x) => x.end === latest.end)
      .reverse()
      .map((x) => x.e.time_to ?? x.e.time_from)
      .find(Boolean) ?? null

  const named = sorted.find((e) => classifyEvent(e.summary) === 'ueberfuehrung')

  const from = first.location?.trim() || null
  const to = (latest.e.location ?? last.location)?.trim() || null
  // Steht überall derselbe Ort, ist das der Abholort – wohin die Fahrt geht,
  // sagt der Kalender dann nicht, und ein "Seevetal → Seevetal" wäre gelogen.
  const sameSpot = !!from && !!to && from.toLowerCase() === to.toLowerCase()

  return {
    title: (named ?? first).summary || '',
    date_from: first.date_from,
    time_from: first.time_from,
    date_to: latest.end,
    time_to: timeTo,
    location_from: from,
    location_to: sameSpot ? null : to,
    notes: sorted.map(block).filter(Boolean).join('\n\n'),
    uids: sorted.map((e) => e.uid),
  }
}
