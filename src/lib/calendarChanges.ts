/**
 * Hat sich ein übernommener Termin im Kalender seither geändert?
 *
 * Die Übernahme ist eine Momentaufnahme: `transfer_calendar_links` hält fest,
 * wie der Termin an dem Tag aussah. Steht er im Feed inzwischen anders da,
 * lässt sich das durch einen Vergleich beider Stände sehen — mehr braucht es
 * nicht, kein Zeitstempel und keine zweite Abfrage.
 *
 * Nachgezogen wird nichts von selbst. Eine Fahrt kann von Hand angepasst
 * worden sein, und ein Kalendereintrag soll das nicht überschreiben; gemeldet
 * wird die Änderung, entscheiden tut die Person davor.
 */

import type { CalendarEvent, TransferCalendarLink } from './transfers'

export type ChangeKey = 'title' | 'date' | 'time' | 'location' | 'notes'

/** Leerraum und Groß-/Kleinschreibung sind keine Änderung. */
export function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

/**
 * Was sich geändert hat – leer heißt: nichts.
 *
 * Felder, für die der alte Stand nicht bekannt ist, bleiben außen vor. Ältere
 * Zeilen haben keinen Schnappschuss (nur die UID) oder keine Notizen, und
 * "unbekannt" ist keine Änderung: sonst meldete jede ältere Fahrt eine, die
 * keine ist.
 */
export function changedFields(link: TransferCalendarLink, event: CalendarEvent): ChangeKey[] {
  // Ohne Datum im Schnappschuss gibt es nichts zu vergleichen – die Zeile
  // stammt aus der Zeit, als nur die UID vermerkt wurde.
  if (!link.date_from) return []

  const changes: ChangeKey[] = []

  if (!sameText(link.summary, event.summary)) changes.push('title')

  const spanBefore = [link.date_from, link.date_to ?? ''].join('|')
  const spanAfter = [event.date_from, event.date_to ?? ''].join('|')
  if (spanBefore !== spanAfter) changes.push('date')

  // Die Datenbank liefert Uhrzeiten als "12:00:00", der Feed als "12:00".
  const clock = (value: string | null) => (value ?? '').slice(0, 5)
  const timeBefore = [clock(link.time_from), clock(link.time_to)].join('|')
  const timeAfter = [clock(event.time_from), clock(event.time_to)].join('|')
  if (timeBefore !== timeAfter) changes.push('time')

  if (!sameText(link.location, event.location)) changes.push('location')

  // Notizen erst seit 20260923_calendar_link_description.sql im Schnappschuss.
  if (link.description !== null && !sameText(link.description, event.description)) {
    changes.push('notes')
  }

  return changes
}
