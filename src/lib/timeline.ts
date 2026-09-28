/**
 * Zeitstrahl: wann stand ein Fahrzeug auf dem Campus, wann war es draußen?
 *
 * Nichts davon wird eigens erfasst. Die Bewegungen stehen schon in den
 * Protokollen (Vergangenheit) und in den Überführungen (Plan); hier werden sie
 * je Fahrzeug sortiert und zu Abschnitten verbunden. Wo die Kette nicht
 * aufgeht – zweimal hintereinander vom Campus weg, ohne Rückkehr dazwischen –,
 * entsteht ein Abschnitt "unklar", statt dass geraten wird. Beides, Campus und
 * draußen, wäre an dieser Stelle eine falsche Rechnung.
 *
 * Gezählt wird nach dem Übernachtungsprinzip wie im Hotel: ein Tag ist ein
 * Lagertag, wenn das Fahrzeug die Nacht auf dem Campus verbringt. Wer morgens
 * abfährt, hat den Vortag noch als Lagertag, den Abfahrtstag nicht mehr; wer
 * abends zurückkommt, hat diesen Tag wieder.
 *
 * Die Logik ist rein – Eingabe sind die Zeilen aus der Datenbank, Ausgabe die
 * Abschnitte –, damit sie sich ohne Supabase nachprüfen lässt.
 */

import { supabase } from './supabase'
import { classifyEvent } from './calendarPairs'

export type Place = 'campus' | 'extern'

/** Wo das Fahrzeug die Nacht verbringt. */
export type NightState = 'campus' | 'extern' | 'unklar' | 'ausserhalb'

/** Eine Fahrt vom einen Ort zum anderen, so wie sie aus einer Quelle hervorgeht. */
export interface Movement {
  /** Kalendertag in Europe/Berlin, YYYY-MM-DD. */
  day: string
  /** Sortierung innerhalb des Tages – ISO-Zeitstempel oder Tag plus Uhrzeit. */
  at: string
  /** Wo das Fahrzeug vorher stand, falls die Quelle das sagt. */
  from: Place | null
  /** Wo es danach steht. null: die Quelle sagt es nicht – danach ist es unklar. */
  to: Place | null
  /** Annahme: das Fahrzeug kommt in den Bestand. */
  entry: boolean
  source: 'protocol' | 'transfer'
  sourceId: string
  /** Für die Anzeige: "CarHandling Campus → Köln", "Lynk 08 in Köln". */
  label: string
}

export interface Segment {
  /** Erster Tag (Nacht) des Abschnitts. */
  from: string
  /** Letzter Tag (Nacht) des Abschnitts, einschließlich. null: bis auf Weiteres. */
  to: string | null
  state: NightState
  /** Die Bewegung, mit der der Abschnitt beginnt. */
  start: Movement | null
  /** Bei "unklar": was nicht zusammenpasst. */
  reason?: 'missing_return' | 'missing_departure' | 'unknown_direction'
}

export interface DayCell {
  day: string
  night: NightState
  /** An diesem Tag wurde das Fahrzeug bewegt – im Balken "unterwegs". */
  moved: boolean
  /** Der Tag liegt nach heute: nur Plan, nicht abgerechnet. */
  planned: boolean
}

export interface NightCounts {
  campus: number
  extern: number
  unklar: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Datum
// ─────────────────────────────────────────────────────────────────────────────

const BERLIN_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Der Kalendertag eines Zeitstempels in Europe/Berlin. */
export function berlinDay(timestamp: string | Date): string {
  return BERLIN_DAY.format(typeof timestamp === 'string' ? new Date(timestamp) : timestamp)
}

/** YYYY-MM-DD plus n Tage – über UTC, damit die Sommerzeit nichts verschiebt. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Alle Tage von from bis to, beide eingeschlossen. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Orte
// ─────────────────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ä/g, 'a')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Der Campus heißt in den Protokollen jedes Mal anders: "Campus",
 * "CarHandling Campus", "CarHndling Campus", "Carhandling Cambus",
 * "Münchner Straße 60", "Halle 2". Lüß ist ebenfalls ein Lagerort und zählt
 * wie der Campus.
 */
const CAMPUS_PATTERNS = [
  /\bca[mn][bp]u?s\b/, // campus, cambus, canpus
  /\bcar ?h[a-z]?ndl?ing\b/, // carhandling, car handling, carhndling
  /\bmunchner str(asse|\b)[a-z ]*60\b/,
  /\bhalle 2\b/,
  /\bluss\b/,
]

export function isCampus(location: string | null | undefined): boolean {
  if (!location) return false
  const text = normalize(location)
  return CAMPUS_PATTERNS.some((p) => p.test(text))
}

function placeOf(location: string | null | undefined): Place | null {
  if (!location || !location.trim()) return null
  return isCampus(location) ? 'campus' : 'extern'
}

/** "A → B" in Start und Ziel teilen. Ohne Pfeil: null. */
export function splitRoute(location: string | null | undefined): [string, string] | null {
  if (!location) return null
  const parts = location.split(/\s*(?:→|->)\s*/)
  if (parts.length < 2) return null
  return [parts[0], parts[parts.length - 1]]
}

// ─────────────────────────────────────────────────────────────────────────────
// Quellen → Bewegungen
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineProtocol {
  id: string
  vehicle_id: string
  protocol_type: string | null
  location: string | null
  start_location: string | null
  end_location: string | null
  inspection_date: string | null
  created_at: string
  /** "Hinbringen" oder "Rücknahme" aus condition_data. */
  transfer_type: string | null
}

export interface TimelineTransfer {
  id: string
  vehicle_id: string | null
  title: string | null
  date_from: string
  date_to: string | null
  time_from: string | null
  time_to: string | null
  status: string
  picked_up_at: string | null
  arrived_at: string | null
  location_from: string | null
  location_to: string | null
}

/**
 * Was ein Protokoll über den Standort sagt.
 *
 * Die Pfeilrichtung im Ort ("Schleißheimer 231 → Campus") ist verlässlicher
 * als die Art Hinbringen/Rücknahme – die ist oft auf dem Vorschlag stehen
 * geblieben. Die Art zählt deshalb nur, wenn der Ort keinen Pfeil hat.
 */
export function protocolMovement(p: TimelineProtocol): Movement | null {
  const timestamp = p.inspection_date ?? p.created_at
  const base = {
    day: berlinDay(timestamp),
    at: new Date(timestamp).toISOString(),
    source: 'protocol' as const,
    sourceId: p.id,
    label: (p.location ?? '').trim(),
  }

  // Die Annahme ist der Eingang in den Bestand – ab da ist das Fahrzeug
  // eingelagert, auch wenn sie woanders unterschrieben wurde.
  if (p.protocol_type === 'annahme') {
    return { ...base, from: null, to: 'campus', entry: true }
  }

  const route: [string, string] | null =
    p.start_location?.trim() || p.end_location?.trim()
      ? [p.start_location ?? '', p.end_location ?? '']
      : splitRoute(p.location)
  if (route) {
    return {
      ...base,
      label: base.label || `${route[0]} → ${route[1]}`,
      from: placeOf(route[0]),
      to: placeOf(route[1]),
      entry: false,
    }
  }

  const here = placeOf(p.location)
  if (p.transfer_type === 'Rücknahme') return { ...base, from: 'extern', to: 'campus', entry: false }
  if (p.transfer_type === 'Hinbringen') {
    return { ...base, from: here === 'campus' ? 'campus' : null, to: 'extern', entry: false }
  }
  // Nur ein Ort und keine Richtung: bekannt ist, wo das Fahrzeug an diesem Tag
  // stand, nicht, wohin es danach ging.
  if (!here) return null
  return { ...base, from: here, to: null, entry: false }
}

/**
 * Was eine Überführung über den Standort sagt – ein Plan, bis ein Protokoll
 * ihn bestätigt.
 *
 * Eine Abholung bringt das Fahrzeug zurück. Alles andere bringt es hinaus; hat
 * die Fahrt einen Zeitraum ("Lynk 08 in Köln 01.10. – 20.10."), ist das der
 * Einsatz, und am letzten Tag kommt es zurück. Folgt direkt der nächste
 * Einsatz, meldet die Zustandsmaschine das nicht als Lücke, sondern zählt
 * die Tage dazwischen als Campus – bei einem Plan ist das die bessere Annahme.
 */
export function transferMovements(t: TimelineTransfer): Movement[] {
  if (!t.vehicle_id || t.status === 'abgebrochen') return []
  const label = t.title?.trim() || [t.location_from, t.location_to].filter(Boolean).join(' → ')
  const base = { source: 'transfer' as const, sourceId: t.id, label, entry: false }
  const at = (day: string, time: string | null) => `${day}T${time ?? '12:00'}`

  if (classifyEvent(t.title) === 'abholung') {
    const day = t.arrived_at ? berlinDay(t.arrived_at) : t.date_to ?? t.date_from
    return [{ ...base, day, at: at(day, t.date_to ? t.time_to : t.time_from), from: 'extern', to: 'campus' }]
  }

  const departDay = t.picked_up_at ? berlinDay(t.picked_up_at) : t.date_from
  const moves: Movement[] = [
    { ...base, day: departDay, at: at(departDay, t.time_from), from: null, to: 'extern' },
  ]
  if (t.date_to && t.date_to > departDay) {
    moves.push({ ...base, day: t.date_to, at: at(t.date_to, t.time_to), from: 'extern', to: 'campus' })
  }
  return moves
}

/** Wie nah eine Überführung an einem Protokoll liegen muss, um dieselbe Fahrt zu sein. */
const SAME_TRIP_DAYS = 2

/**
 * Protokolle und Überführungen eines Fahrzeugs zusammenlegen.
 *
 * Dieselbe Fahrt steht oft doppelt da: als Überführung und als Protokoll dazu.
 * Dann zählt das Protokoll – es ist unterschrieben und hat die echte Uhrzeit.
 * Als dieselbe Fahrt gilt eine Bewegung der Überführung, wenn ein Protokoll
 * wenige Tage davor oder danach in dieselbe Richtung zeigt.
 */
export function mergeMovements(fromProtocols: Movement[], fromTransfers: Movement[]): Movement[] {
  const kept = fromTransfers.filter(
    (tm) => !fromProtocols.some((pm) => pm.to === tm.to && Math.abs(dayDiff(pm.day, tm.day)) <= SAME_TRIP_DAYS)
  )
  return [...fromProtocols, ...kept].sort((a, b) => (a.day === b.day ? a.at.localeCompare(b.at) : a.day.localeCompare(b.day)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Bewegungen → Abschnitte
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Die Zustandsmaschine. Vor der ersten Bewegung ist das Fahrzeug nicht im
 * Bestand; jede Bewegung setzt den Zustand ab ihrem Tag. Passt der Ort, von
 * dem eine Bewegung ausgeht, nicht zum bisherigen Zustand, fehlt dazwischen
 * eine Fahrt – der Abschnitt davor wird unklar.
 *
 * Mehrere Bewegungen am selben Tag: die letzte bestimmt die Nacht.
 */
export function buildSegments(movements: Movement[]): Segment[] {
  const segments: Segment[] = []
  for (const m of movements) {
    const prev = segments[segments.length - 1]
    const current: NightState = prev?.state ?? 'ausserhalb'

    if (prev && m.from && !m.entry && (current === 'campus' || current === 'extern') && current !== m.from) {
      // Unterwegs, ohne losgefahren zu sein, oder vom Campus weg, ohne
      // zurückgekommen zu sein. Der Tag der letzten Bewegung selbst bleibt,
      // wie er war – dort ist der Ort ja belegt.
      // Liegt keine ganze Nacht dazwischen, gibt es nichts zu klären.
      if (addDays(prev.from, 1) < m.day) {
        prev.to = prev.from
        segments.push({
          from: addDays(prev.from, 1),
          to: null,
          state: 'unklar',
          start: null,
          reason: current === 'extern' ? 'missing_return' : 'missing_departure',
        })
      }
    }

    const last = segments[segments.length - 1]
    const state: NightState = m.to ?? 'unklar'
    if (last && last.from === m.day) {
      // Gleicher Tag: nur der Stand am Abend zählt.
      last.state = state
      last.start = m
      last.reason = m.to ? undefined : 'unknown_direction'
      continue
    }
    if (last) last.to = addDays(m.day, -1)
    segments.push({ from: m.day, to: null, state, start: m, reason: m.to ? undefined : 'unknown_direction' })
  }
  // Aufeinanderfolgende Abschnitte mit gleichem Zustand bleiben getrennt: jeder
  // hat seine eigene Quelle, und die will man antippen können.
  return segments
}

/** Die Tage eines Zeitraums, jeder mit seiner Nacht. */
export function dayCells(segments: Segment[], movements: Movement[], from: string, to: string, today: string): DayCell[] {
  const movedDays = new Set(movements.map((m) => m.day))
  const cells: DayCell[] = []
  let i = 0
  for (const day of daysBetween(from, to)) {
    while (i < segments.length - 1 && segments[i + 1].from <= day) i++
    const seg = segments[i]
    const night: NightState = seg && seg.from <= day && (seg.to === null || seg.to >= day) ? seg.state : 'ausserhalb'
    cells.push({ day, night, moved: movedDays.has(day), planned: day > today })
  }
  return cells
}

/** Nächte je Zustand – nur bis heute, die Zukunft ist Plan. */
export function countNights(cells: DayCell[]): NightCounts {
  const counts: NightCounts = { campus: 0, extern: 0, unklar: 0 }
  for (const c of cells) {
    if (c.planned) continue
    if (c.night === 'campus') counts.campus++
    else if (c.night === 'extern') counts.extern++
    else if (c.night === 'unklar') counts.unklar++
  }
  return counts
}

/**
 * Seit wie vielen Tagen das Fahrzeug draußen ist, falls das verdächtig lange
 * ist – meist fehlt dann das Protokoll der Rücknahme.
 */
export const LONG_ABSENCE_DAYS = 30

export function longAbsence(segments: Segment[], today: string): number | null {
  const last = [...segments].reverse().find((s) => s.from <= today)
  if (!last || last.state !== 'extern' || last.to !== null) return null
  const days = dayDiff(last.from, today)
  return days > LONG_ABSENCE_DAYS ? days : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Laden
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineVehicle {
  id: string
  license_plate: string
  brand_model: string | null
}

export interface TimelineCustomer {
  id: string
  name: string
  color: string | null
  is_archived: boolean
}

export interface TimelineData {
  vehicles: TimelineVehicle[]
  customers: TimelineCustomer[]
  /** Fahrzeug → Kunden (Projekte). Ein Fahrzeug kann mehreren angehören. */
  customersOf: Map<string, string[]>
  movementsOf: Map<string, Movement[]>
}

export async function fetchTimelineData(): Promise<TimelineData> {
  const [vehicles, protocols, transfers, projects, links] = await Promise.all([
    supabase.from('vehicles').select('id, license_plate, brand_model').order('license_plate'),
    supabase
      .from('protocols')
      .select(
        'id, vehicle_id, protocol_type, location, start_location, end_location, inspection_date, created_at, transfer_type:condition_data->>transfer_type'
      ),
    supabase
      .from('transfers')
      .select(
        'id, vehicle_id, title, date_from, date_to, time_from, time_to, status, picked_up_at, arrived_at, location_from, location_to'
      ),
    supabase.from('projects').select('id, name, color, is_archived').order('name'),
    supabase.from('vehicle_projects').select('vehicle_id, project_id'),
  ])
  for (const r of [vehicles, protocols, transfers, projects, links]) if (r.error) throw r.error

  const byVehicle = new Map<string, { p: Movement[]; t: Movement[] }>()
  const bucket = (id: string) => {
    let b = byVehicle.get(id)
    if (!b) byVehicle.set(id, (b = { p: [], t: [] }))
    return b
  }
  for (const p of (protocols.data ?? []) as TimelineProtocol[]) {
    const m = protocolMovement(p)
    if (m) bucket(p.vehicle_id).p.push(m)
  }
  for (const t of (transfers.data ?? []) as TimelineTransfer[]) {
    if (t.vehicle_id) bucket(t.vehicle_id).t.push(...transferMovements(t))
  }

  const movementsOf = new Map<string, Movement[]>()
  for (const [id, b] of byVehicle) movementsOf.set(id, mergeMovements(b.p, b.t))

  const customersOf = new Map<string, string[]>()
  for (const l of (links.data ?? []) as { vehicle_id: string; project_id: string }[]) {
    customersOf.set(l.vehicle_id, [...(customersOf.get(l.vehicle_id) ?? []), l.project_id])
  }

  return {
    vehicles: (vehicles.data ?? []) as TimelineVehicle[],
    customers: (projects.data ?? []) as TimelineCustomer[],
    customersOf,
    movementsOf,
  }
}
