import { supabase, requireOnline } from './supabase'
import { normalizeKennzeichen } from './vehicles'

export type TransferStatus = 'geplant' | 'unterwegs' | 'angekommen' | 'abgebrochen'

/** Statuswerte in der Reihenfolge, in der eine Überführung sie durchläuft. */
export const TRANSFER_STATUSES: TransferStatus[] = ['geplant', 'unterwegs', 'angekommen', 'abgebrochen']

/** Eine Überführung gilt als erledigt, sobald sie angekommen oder abgebrochen ist. */
export const CLOSED_STATUSES: TransferStatus[] = ['angekommen', 'abgebrochen']

export interface TransferVehicle {
  id: string
  license_plate: string
  brand_model: string | null
  availability: string | null
  cleanliness_interior: string | null
  cleanliness_exterior: string | null
  is_fueled: boolean | null
  is_charged: boolean | null
  current_odometer: number | null
}

/** Welche Hälfte der Fahrt ein Protokoll dokumentiert. */
export type ProtocolRole = 'pickup' | 'dropoff'

export interface LinkedProtocol {
  id: string
  created_at: string
  status: string | null
  protocol_type: string | null
  inspector_name: string | null
}

/** Ein übernommener Kalendertermin, so wie er zum Zeitpunkt der Übernahme aussah. */
export interface TransferCalendarLink {
  calendar_uid: string
  summary: string | null
  date_from: string | null
  date_to: string | null
  time_from: string | null
  time_to: string | null
  location: string | null
}

export interface Transfer {
  id: string
  vehicle_id: string
  /** Beschriftung der Fahrt – bei Kalenderübernahmen der Termintitel. */
  title: string | null
  date_from: string
  date_to: string | null
  /** Optionale Uhrzeiten (HH:MM). Das Datum steht oft früher fest als die Stunde. */
  time_from: string | null
  time_to: string | null
  location_from: string | null
  location_to: string | null
  status: TransferStatus
  picked_up_at: string | null
  arrived_at: string | null
  driver_name: string | null
  contact_name: string | null
  contact_phone: string | null
  notes: string | null
  // protocols.id ist uuid – der Typ Protocol.id in lib/vehicles.ts sagt number,
  // was nur deshalb nie aufgefallen ist, weil der Wert dort bloß durchgereicht wird.
  pickup_protocol_id: string | null
  dropoff_protocol_id: string | null
  /** UID des Kalendertermins, aus dem die Überführung übernommen wurde. */
  calendar_uid: string | null
  /** Fahrten mit derselben group_id gehören zusammen (Hin- und Rückfahrt, Etappen). */
  group_id: string | null
  created_at: string
  vehicle?: TransferVehicle | null
  pickup_protocol?: LinkedProtocol | null
  dropoff_protocol?: LinkedProtocol | null
  /** Die Termine, aus denen die Fahrt entstanden ist – leer bei Handarbeit. */
  calendar_links?: TransferCalendarLink[]
}

export interface TransferInput {
  vehicle_id: string
  title?: string | null
  date_from: string
  date_to?: string | null
  time_from?: string | null
  time_to?: string | null
  location_from?: string | null
  location_to?: string | null
  driver_name?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  notes?: string | null
  calendar_uid?: string | null
  /** Alle Kalendertermine, aus denen die Fahrt entsteht – meist Abholung und Überführung. */
  calendar_uids?: string[]
  /** Dieselben Termine mit Inhalt, damit die Karte sie später zeigen kann. */
  calendar_events?: CalendarEvent[]
}

const PROTOCOL_FIELDS = 'id, created_at, status, protocol_type, inspector_name'

// Beide Protokollspalten zeigen auf dieselbe Tabelle – PostgREST braucht
// deshalb den Constraint-Namen, um die Einbettungen auseinanderzuhalten.
const SELECT =
  'id, vehicle_id, title, date_from, date_to, time_from, time_to, location_from, location_to, status, picked_up_at, arrived_at, ' +
  'driver_name, contact_name, contact_phone, notes, pickup_protocol_id, dropoff_protocol_id, calendar_uid, group_id, created_at, ' +
  'vehicle:vehicles(id, license_plate, brand_model, availability, cleanliness_interior, cleanliness_exterior, is_fueled, is_charged, current_odometer), ' +
  `pickup_protocol:protocols!transfers_pickup_protocol_id_fkey(${PROTOCOL_FIELDS}), ` +
  `dropoff_protocol:protocols!transfers_dropoff_protocol_id_fkey(${PROTOCOL_FIELDS}), ` +
  'calendar_links:transfer_calendar_links(calendar_uid, summary, date_from, date_to, time_from, time_to, location)'

/** Eine eingebettete Beziehung kommt je nach generierten Typen als Objekt oder
 *  als einelementiges Array zurück – beides auf ein Objekt bringen. */
function one<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null
  return (value ?? null) as T | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(row: any): Transfer {
  return {
    ...row,
    vehicle: one<TransferVehicle>(row?.vehicle),
    // Bleibt eine Liste: eine Fahrt kann aus Abholung und Überführung entstehen.
    calendar_links: Array.isArray(row?.calendar_links) ? row.calendar_links : [],
    pickup_protocol: one<LinkedProtocol>(row?.pickup_protocol),
    dropoff_protocol: one<LinkedProtocol>(row?.dropoff_protocol),
  } as Transfer
}

// ─────────────────────────────────────────────────────────────────────────────
// Lesen
// ─────────────────────────────────────────────────────────────────────────────

/** Laufende und geplante Überführungen, die nächste zuerst. */
export async function fetchOpenTransfers(): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select(SELECT)
    .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
    .order('date_from', { ascending: true })
  if (error) throw error
  return (data ?? []).map(normalize)
}

/** Abgeschlossene und abgebrochene Überführungen, die jüngste zuerst. */
export async function fetchClosedTransfers(): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select(SELECT)
    .in('status', CLOSED_STATUSES)
    .order('date_from', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalize)
}

/** Alle Überführungen eines Fahrzeugs, die jüngste zuerst. */
export async function fetchTransfersForVehicle(vehicleId: string): Promise<Transfer[]> {
  const { data, error } = await supabase
    .from('transfers')
    .select(SELECT)
    .eq('vehicle_id', vehicleId)
    .order('date_from', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalize)
}

/**
 * Offene Überführungen desselben Fahrzeugs, deren Zeitraum sich mit dem
 * angegebenen überschneidet. Ein fehlendes Enddatum zählt als eintägig.
 *
 * Die Überschneidung wird bewusst nur gemeldet und nicht verhindert – ein
 * Fahrzeug kann am selben Tag ankommen und weiterfahren, das ist kein Fehler,
 * sondern nur etwas, das man gesehen haben sollte.
 */
export async function findOverlappingTransfers(
  vehicleId: string,
  dateFrom: string,
  dateTo: string | null,
  excludeId?: string
): Promise<Transfer[]> {
  const end = dateTo || dateFrom
  const { data, error } = await supabase
    .from('transfers')
    .select(SELECT)
    .eq('vehicle_id', vehicleId)
    .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
    .lte('date_from', end)
    .order('date_from', { ascending: true })
  if (error) throw error

  return (data ?? [])
    .map(normalize)
    .filter((tr) => (tr.date_to || tr.date_from) >= dateFrom)
    .filter((tr) => tr.id !== excludeId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Schreiben
// ─────────────────────────────────────────────────────────────────────────────

function clean(values: TransferInput) {
  return {
    vehicle_id: values.vehicle_id,
    title: values.title?.trim() || null,
    date_from: values.date_from,
    date_to: values.date_to || null,
    time_from: values.time_from || null,
    time_to: values.time_to || null,
    location_from: values.location_from?.trim() || null,
    location_to: values.location_to?.trim() || null,
    driver_name: values.driver_name?.trim() || null,
    contact_name: values.contact_name?.trim() || null,
    contact_phone: values.contact_phone?.trim() || null,
    notes: values.notes?.trim() || null,
    // Die erste UID bleibt als Herkunftsmerkmal an der Fahrt; die vollständige
    // Liste steht in transfer_calendar_links.
    calendar_uid: values.calendar_uid || values.calendar_uids?.[0] || null,
  }
}

/**
 * Die Zeilen für transfer_calendar_links – ein Termin je Zeile, ohne Dopplungen.
 *
 * Liegt der Termin mit Inhalt vor, wird er mitgespeichert: die Karte einer
 * übernommenen Fahrt zeigt damit dieselben Blöcke wie der Kalender. Sonst
 * bleibt es beim reinen Vermerk "übernommen".
 */
function linkRowsOf(values: TransferInput, transferId: string) {
  const byUid = new Map<string, Record<string, unknown>>()

  for (const uid of [...(values.calendar_uids ?? []), values.calendar_uid ?? '']) {
    if (uid) byUid.set(uid, { calendar_uid: uid, transfer_id: transferId })
  }
  for (const ev of values.calendar_events ?? []) {
    if (!ev?.uid) continue
    byUid.set(ev.uid, {
      calendar_uid: ev.uid,
      transfer_id: transferId,
      summary: ev.summary || null,
      date_from: ev.date_from || null,
      date_to: ev.date_to || null,
      time_from: ev.time_from || null,
      time_to: ev.time_to || null,
      location: ev.location || null,
    })
  }
  return [...byUid.values()]
}

/**
 * Kalendertermine als übernommen vermerken.
 *
 * Bewusst nicht weitergeworfen: die Überführung ist an dieser Stelle schon
 * gespeichert. Schlägt der Vermerk fehl, erscheint der Termin wieder als neu –
 * ärgerlich, aber kein Grund, einen Fehler über eine gelungene Speicherung zu
 * legen.
 *
 * ignoreDuplicates, damit ein erneutes Speichern einen Termin nicht einer
 * anderen Fahrt wegnimmt.
 */
async function linkCalendarUids(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('transfer_calendar_links')
    .upsert(rows, { onConflict: 'calendar_uid', ignoreDuplicates: true })
  if (error) console.warn('Kalendertermine konnten nicht vermerkt werden:', error.message)
}

export async function createTransfer(values: TransferInput): Promise<Transfer> {
  requireOnline()
  const { data, error } = await supabase
    .from('transfers')
    .insert(clean(values))
    .select(SELECT)
    .single()
  if (error) throw error
  const row = normalize(data)
  await linkCalendarUids(linkRowsOf(values, row.id))
  return row
}

export async function updateTransfer(id: string, values: TransferInput): Promise<Transfer> {
  requireOnline()
  const { data, error } = await supabase
    .from('transfers')
    .update(clean(values))
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  const row = normalize(data)
  await linkCalendarUids(linkRowsOf(values, row.id))
  return row
}

export async function deleteTransfer(id: string): Promise<void> {
  requireOnline()
  // .select() macht ein stilles RLS-Fail sichtbar – ohne Policy liefert
  // Supabase data = [] und error = null.
  const { data, error } = await supabase.from('transfers').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      'Löschen fehlgeschlagen: Supabase hat den Vorgang blockiert (RLS).\n' +
      'Bitte prüfen, ob die Policy allow_all auf der Tabelle transfers existiert.'
    )
  }
}

/**
 * Setzt den Status und schreibt die passenden Ist-Zeitstempel.
 *
 * Der Fahrzeugstatus wird mitgezogen: solange eine Überführung läuft, ist das
 * Fahrzeug unterwegs, danach wieder verfügbar. Schlägt das fehl, bleibt der
 * Statuswechsel der Überführung trotzdem stehen – die Verfügbarkeit ist eine
 * Anzeige, kein Teil der Überführung.
 */
export async function setTransferStatus(
  id: string,
  status: TransferStatus,
  vehicleId: string
): Promise<Transfer> {
  requireOnline()

  const patch: Record<string, unknown> = { status }
  if (status === 'unterwegs') patch.picked_up_at = new Date().toISOString()
  if (status === 'angekommen') patch.arrived_at = new Date().toISOString()
  // Ein Rückschritt räumt den jeweiligen Zeitstempel wieder ab, damit kein
  // Ankunftsdatum an einer Überführung hängt, die noch läuft.
  if (status === 'geplant') {
    patch.picked_up_at = null
    patch.arrived_at = null
  }
  if (status === 'unterwegs') patch.arrived_at = null

  const { data, error } = await supabase
    .from('transfers')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error

  // Die vehicle_id kommt vom Aufrufer und nicht aus der Antwort: der Aufrufer
  // hat sie ohnehin, und so hängt der Schreibzugriff auf vehicles nicht an der
  // Form der PATCH-Antwort.
  await syncVehicleAvailability(vehicleId, status)
  return normalize(data)
}

/**
 * Hängt ein frisch gespeichertes Protokoll an die Überführung und zieht den
 * Status nach: ein Abholprotokoll heißt, die Fahrt läuft, ein Ankunftsprotokoll
 * heißt, sie ist vorbei.
 *
 * Der Status wird dabei nur vorwärts bewegt. Wird ein Abholprotokoll
 * nachgereicht, obwohl das Fahrzeug längst angekommen ist, bleibt der Status
 * stehen – sonst würde das Nachtragen eines Belegs die Überführung zurückwerfen.
 */
export async function linkProtocolToTransfer(
  transfer: Pick<Transfer, 'id' | 'vehicle_id' | 'status'>,
  role: ProtocolRole,
  protocolId: string
): Promise<void> {
  requireOnline()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  let nextStatus: TransferStatus | null = null

  if (role === 'pickup') {
    patch.pickup_protocol_id = protocolId
    if (transfer.status !== 'unterwegs' && transfer.status !== 'angekommen') {
      nextStatus = 'unterwegs'
      patch.picked_up_at = now
    }
  } else {
    patch.dropoff_protocol_id = protocolId
    if (transfer.status !== 'angekommen') {
      nextStatus = 'angekommen'
      patch.arrived_at = now
    }
  }
  if (nextStatus) patch.status = nextStatus

  const { error } = await supabase.from('transfers').update(patch).eq('id', transfer.id)
  if (error) throw error

  if (nextStatus) await syncVehicleAvailability(transfer.vehicle_id, nextStatus)
}

/**
 * Ein Protokoll wieder von der Überführung lösen.
 *
 * Der Status bleibt, wo er ist: er kann von Hand gesetzt worden sein, und ein
 * versehentlich verknüpftes Protokoll soll die Fahrt nicht zurückwerfen.
 */
export async function detachProtocolFromTransfer(
  transferId: string,
  role: ProtocolRole
): Promise<void> {
  requireOnline()
  const column = role === 'pickup' ? 'pickup_protocol_id' : 'dropoff_protocol_id'
  const { error } = await supabase
    .from('transfers')
    .update({ [column]: null })
    .eq('id', transferId)
  if (error) throw error
}

/** Verfügbarkeit des Fahrzeugs an den Überführungsstatus angleichen. */
export async function syncVehicleAvailability(
  vehicleId: string,
  status: TransferStatus
): Promise<void> {
  if (!vehicleId) return
  const availability = status === 'unterwegs' ? 'unterwegs' : 'verfügbar'
  const { error } = await supabase
    .from('vehicles')
    .update({ availability })
    .eq('id', vehicleId)
  if (error) {
    // Bewusst nicht weiterwerfen: der Statuswechsel selbst ist schon gespeichert.
    console.warn('Verfügbarkeit konnte nicht angeglichen werden:', error.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verbundene Fahrten
//
// Hin mit dem einen Fahrzeug, zurück mit dem anderen, oder mehrere Etappen an
// einem Tag: solche Fahrten gehören zusammen, bleiben aber eigene
// Überführungen mit eigenem Status und eigenen Protokollen. Verbunden werden
// sie über eine gemeinsame group_id – kein Paar, damit auch die dritte Fahrt
// noch dazupasst.
// ─────────────────────────────────────────────────────────────────────────────

type GroupMember = Pick<Transfer, 'id' | 'group_id'>

/**
 * Zwei Fahrten verbinden.
 *
 * Hat eine von beiden schon eine Gruppe, wird die andere dort aufgenommen;
 * haben beide eine, werden die Gruppen zusammengeführt. Das Umhängen läuft
 * über `eq('group_id', …)` und erwischt damit auch Fahrten, die gerade nicht
 * auf dem Bildschirm stehen – sonst bliebe die halbe Gruppe zurück.
 */
export async function linkTransfers(a: GroupMember, b: GroupMember): Promise<void> {
  requireOnline()
  if (a.id === b.id) return
  if (a.group_id && a.group_id === b.group_id) return

  const group = a.group_id ?? b.group_id ?? crypto.randomUUID()

  for (const t of [a, b]) {
    if (t.group_id === group) continue
    const query = supabase.from('transfers').update({ group_id: group })
    const { error } = t.group_id
      ? await query.eq('group_id', t.group_id)
      : await query.eq('id', t.id)
    if (error) throw error
  }
}

/**
 * Eine Fahrt aus ihrer Gruppe lösen.
 *
 * Bleibt danach nur noch eine übrig, wird auch die gelöst: eine Gruppe aus
 * einer einzigen Fahrt ist keine.
 */
export async function unlinkTransfer(id: string, groupId: string | null): Promise<void> {
  requireOnline()
  const { error } = await supabase.from('transfers').update({ group_id: null }).eq('id', id)
  if (error) throw error
  if (!groupId) return

  const { data, error: countErr } = await supabase
    .from('transfers')
    .select('id')
    .eq('group_id', groupId)
  if (countErr) throw countErr

  if ((data ?? []).length === 1) {
    const { error: lastErr } = await supabase
      .from('transfers')
      .update({ group_id: null })
      .eq('group_id', groupId)
    if (lastErr) throw lastErr
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Freie Protokolle
//
// Ein Protokoll entsteht nicht immer aus einer Überführung heraus – oft ist es
// zuerst da, weil unterwegs schnell dokumentiert wurde. Damit die beiden
// zusammenfinden, lassen sich vorhandene Protokolle nachträglich anhängen.
// ─────────────────────────────────────────────────────────────────────────────

/** Ein Protokoll, das an eine Überführung gehängt werden kann. */
export interface LinkableProtocol {
  id: string
  created_at: string
  inspection_date: string | null
  status: string | null
  protocol_type: string | null
  inspector_name: string | null
  location: string | null
  start_location: string | null
  end_location: string | null
  /** "Hinbringen" oder "Rücknahme" – steckt im JSON der Zustandsdaten. */
  transfer_type: string | null
}

// condition_data enthält auch die Fotos als Base64; deshalb wird aus dem JSON
// nur das eine Feld geholt, statt die ganze Spalte zu laden.
const LINKABLE_SELECT =
  'id, created_at, inspection_date, status, protocol_type, inspector_name, location, ' +
  'start_location, end_location, transfer_type:condition_data->>transfer_type'

/** IDs aller Protokolle, die schon an einer Überführung hängen. */
async function fetchLinkedProtocolIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('transfers')
    .select('pickup_protocol_id, dropoff_protocol_id')
  if (error) throw error

  const ids = new Set<string>()
  for (const row of (data ?? []) as { pickup_protocol_id: string | null; dropoff_protocol_id: string | null }[]) {
    if (row.pickup_protocol_id) ids.add(row.pickup_protocol_id)
    if (row.dropoff_protocol_id) ids.add(row.dropoff_protocol_id)
  }
  return ids
}

/**
 * Protokolle dieses Fahrzeugs, die an keiner Überführung hängen – das jüngste
 * zuerst.
 *
 * Die Fremdschlüssel zeigen von der Überführung zum Protokoll, eine
 * Unterabfrage gibt es in PostgREST nicht. Die belegten IDs werden deshalb
 * getrennt geholt und hier abgezogen; die Tabelle ist klein genug dafür.
 */
export async function fetchUnlinkedProtocols(vehicleId: string): Promise<LinkableProtocol[]> {
  const [result, used] = await Promise.all([
    supabase
      .from('protocols')
      .select(LINKABLE_SELECT)
      .eq('vehicle_id', vehicleId)
      .order('inspection_date', { ascending: false, nullsFirst: false })
      .limit(50),
    fetchLinkedProtocolIds(),
  ])
  if (result.error) throw result.error
  return ((result.data ?? []) as unknown as LinkableProtocol[]).filter((p) => !used.has(p.id))
}

// ─────────────────────────────────────────────────────────────────────────────
// Kalender
// ─────────────────────────────────────────────────────────────────────────────

/** Ein Termin aus dem veröffentlichten Kalender, wie ihn die Edge Function liefert. */
export interface CalendarEvent {
  uid: string
  summary: string
  description: string | null
  location: string | null
  date_from: string
  date_to: string | null
  time_from: string | null
  time_to: string | null
  all_day: boolean
  /** Serientermine liefert die Function unaufgelöst – sie werden nur markiert. */
  recurring: boolean
}

/**
 * Termine aus dem Kalender holen.
 *
 * Der Aufruf geht über eine Edge Function, weil die Feed-URL ein Geheimnis ist
 * und iCloud keine CORS-Header liefert – direkt aus dem Browser ginge beides
 * nicht.
 */
export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  requireOnline()
  const { data, error } = await supabase.functions.invoke('transfer-calendar', { method: 'GET' })
  if (error) throw error
  // Die Function meldet eigene Fehler als JSON mit "error" statt als Ausnahme.
  if (data && typeof data === 'object' && 'error' in data) {
    const d = data as { error: string; hint?: string }
    throw new Error(d.hint ? `${d.error} ${d.hint}` : d.error)
  }
  return ((data as { events?: CalendarEvent[] })?.events ?? [])
}

/**
 * UIDs der Termine, aus denen schon eine Überführung entstanden ist.
 *
 * Gefragt sind beide Quellen: die Verknüpfungstabelle (eine Fahrt kann aus
 * Abholung und Überführung entstehen) und die alte Spalte an der Fahrt selbst,
 * falls dort einmal etwas ohne Eintrag in der Tabelle landet.
 */
export async function fetchImportedCalendarUids(): Promise<Set<string>> {
  const [links, legacy] = await Promise.all([
    supabase.from('transfer_calendar_links').select('calendar_uid'),
    supabase.from('transfers').select('calendar_uid').not('calendar_uid', 'is', null),
  ])
  if (links.error) throw links.error
  if (legacy.error) throw legacy.error

  const uids = new Set<string>()
  for (const r of (links.data ?? []) as { calendar_uid: string }[]) uids.add(r.calendar_uid)
  for (const r of (legacy.data ?? []) as { calendar_uid: string }[]) uids.add(r.calendar_uid)
  return uids
}

/**
 * Sucht im Termintitel nach einem Kennzeichen aus der Fahrzeugliste.
 *
 * Verglichen wird normalisiert, damit "M-AB 1234", "M AB 1234" und "MAB1234"
 * zusammenfinden. Bei mehreren Treffern gewinnt das längste Kennzeichen: kurze
 * Flottennummern wie "2843" stecken leicht zufällig in längeren Zeichenfolgen.
 *
 * Bewusst nur ein Vorschlag – die Zuordnung landet im Formular und wird dort
 * bestätigt, nie ungeprüft gespeichert.
 */
export function matchVehicleByPlate<T extends { license_plate: string }>(
  summary: string,
  vehicles: T[]
): T | null {
  const haystack = normalizeKennzeichen(summary)
  if (!haystack) return null

  let best: T | null = null
  let bestLen = 0
  for (const v of vehicles) {
    const plate = normalizeKennzeichen(v.license_plate ?? '')
    if (plate.length < 3) continue
    if (haystack.includes(plate) && plate.length > bestLen) {
      best = v
      bestLen = plate.length
    }
  }
  return best
}
