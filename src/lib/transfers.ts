import { supabase, requireOnline } from './supabase'

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

export interface Transfer {
  id: string
  vehicle_id: string
  date_from: string
  date_to: string | null
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
  created_at: string
  vehicle?: TransferVehicle | null
}

export interface TransferInput {
  vehicle_id: string
  date_from: string
  date_to?: string | null
  location_from?: string | null
  location_to?: string | null
  driver_name?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  notes?: string | null
}

const SELECT =
  'id, vehicle_id, date_from, date_to, location_from, location_to, status, picked_up_at, arrived_at, ' +
  'driver_name, contact_name, contact_phone, notes, pickup_protocol_id, dropoff_protocol_id, created_at, ' +
  'vehicle:vehicles(id, license_plate, brand_model, availability, cleanliness_interior, cleanliness_exterior, is_fueled, is_charged, current_odometer)'

/**
 * Supabase liefert eine eingebettete 1:n-Beziehung je nach generierten Typen
 * als Objekt oder als einelementiges Array – beides auf ein Objekt bringen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(row: any): Transfer {
  const v = Array.isArray(row?.vehicle) ? row.vehicle[0] ?? null : row?.vehicle ?? null
  return { ...row, vehicle: v } as Transfer
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
    date_from: values.date_from,
    date_to: values.date_to || null,
    location_from: values.location_from?.trim() || null,
    location_to: values.location_to?.trim() || null,
    driver_name: values.driver_name?.trim() || null,
    contact_name: values.contact_name?.trim() || null,
    contact_phone: values.contact_phone?.trim() || null,
    notes: values.notes?.trim() || null,
  }
}

export async function createTransfer(values: TransferInput): Promise<Transfer> {
  requireOnline()
  const { data, error } = await supabase
    .from('transfers')
    .insert(clean(values))
    .select(SELECT)
    .single()
  if (error) throw error
  return normalize(data)
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
  return normalize(data)
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
