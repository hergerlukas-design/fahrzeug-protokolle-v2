import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DamageItem {
  pos: string
  type: string
  int: string
}

export interface Checkliste {
  floor: boolean
  seats: boolean
  entry: boolean
  instruments: boolean
  trunk: boolean
  engine: boolean
  aid_kit: boolean
  triangle: boolean
  vest: boolean
  cable: boolean
  registration: boolean
  card: boolean
}

export interface ProtocolConditionData {
  battery: number
  photos: Record<string, string>
  conditions: string[]
  damage_records: DamageItem[]
  checkliste: Checkliste
}

export interface ProtocolPayload {
  vehicle_id: number
  inspector_name: string
  location: string
  odometer: number
  fuel_level: number
  remarks: string
  inspection_date: string
  status: 'draft' | 'final'
  protocol_type: 'annahme' | 'transfer'
  condition_data: ProtocolConditionData
}

export const DEFAULT_CHECKLISTE: Checkliste = {
  floor: false,
  seats: false,
  entry: false,
  instruments: false,
  trunk: false,
  engine: false,
  aid_kit: false,
  triangle: false,
  vest: false,
  cable: false,
  registration: false,
  card: false,
}

export const DAMAGE_POSITIONS = [
  'Stoßfänger vorne',
  'Stoßfänger hinten',
  'Motorhaube',
  'Dach',
  'Kotflügel vorne links',
  'Kotflügel vorne rechts',
  'Kotflügel hinten links',
  'Kotflügel hinten rechts',
  'Tür vorne links',
  'Tür vorne rechts',
  'Tür hinten links',
  'Tür hinten rechts',
  'Windschutzscheibe',
  'Heckscheibe',
  'Seitenscheibe links',
  'Seitenscheibe rechts',
  'Felge / Reifen',
  'Sonstiges',
]

export const DAMAGE_TYPES = ['Kratzer', 'Delle', 'Riss', 'Bruch', 'Abplatzer', 'Fehlend']

export const DAMAGE_INTENSITIES = ['Oberflächlich', 'Mittel', 'Tief']

export const INSPECTION_CONDITIONS = ['Verschmutzung', 'Regen', 'Dunkelheit', 'Schlechtes Licht']

// ─────────────────────────────────────────────────────────────────────────────
// Image compression (shared with vehicles.ts logic)
// ─────────────────────────────────────────────────────────────────────────────

async function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = img.width > maxPx ? maxPx / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        quality
      )
    }
    img.onerror = reject
    img.src = url
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage uploads
// ─────────────────────────────────────────────────────────────────────────────

/** Uploads a protocol photo and returns its public URL.
 *  Path: vehicle-protocols/{vehicleId}/{sessionKey}_{photoKey}.jpg
 */
export async function uploadProtocolPhoto(
  vehicleId: number,
  sessionKey: string,
  photoKey: string,
  file: File
): Promise<string> {
  const blob = await compressImage(file)
  const path = `vehicle-protocols/${vehicleId}/${sessionKey}_${photoKey}.jpg`
  const { error } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
  return data.publicUrl
}

/** Uploads a signature (PNG data URL) and returns its public URL. */
export async function uploadSignature(
  vehicleId: number,
  sessionKey: string,
  dataUrl: string
): Promise<string> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const path = `vehicle-protocols/${vehicleId}/${sessionKey}_signature.png`
  const { error } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/png' })
  if (error) throw error
  const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
  return data.publicUrl
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function saveProtocol(payload: ProtocolPayload): Promise<number> {
  const { data, error } = await supabase
    .from('protocols')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: number }).id
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB — offline queue
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME = 'fpp_offline'
const DB_VERSION = 1
const STORE = 'pending_protocols'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'localId', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface OfflineEntry {
  localId?: number
  createdAt: string
  vehicleId: number
  sessionKey: string
  /** Protocol fields (photos are empty — filled during sync) */
  payload: ProtocolPayload
  /** Raw photo files to upload on sync */
  photoBlobs: Record<string, Blob>
  signatureBlob?: Blob
}

export async function saveOffline(entry: OfflineEntry): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).add(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getPendingOffline(): Promise<OfflineEntry[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as OfflineEntry[])
    req.onerror = () => reject(req.error)
  })
}

async function deleteOffline(localId: number): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(localId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Syncs all pending offline entries to Supabase. Returns number of synced entries. */
export async function syncOffline(): Promise<number> {
  const pending = await getPendingOffline()
  let synced = 0
  for (const entry of pending) {
    try {
      const photos: Record<string, string> = {}
      for (const [key, blob] of Object.entries(entry.photoBlobs)) {
        const file = new File([blob], `${key}.jpg`, { type: 'image/jpeg' })
        photos[key] = await uploadProtocolPhoto(entry.vehicleId, entry.sessionKey, key, file)
      }
      if (entry.signatureBlob) {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        const img = new Image()
        const url = URL.createObjectURL(entry.signatureBlob)
        await new Promise<void>((res) => {
          img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)
            URL.revokeObjectURL(url)
            res()
          }
          img.src = url
        })
        const dataUrl = canvas.toDataURL('image/png')
        photos.signature = await uploadSignature(entry.vehicleId, entry.sessionKey, dataUrl)
      }
      const finalPayload: ProtocolPayload = {
        ...entry.payload,
        condition_data: { ...entry.payload.condition_data, photos },
      }
      await saveProtocol(finalPayload)
      await deleteOffline(entry.localId!)
      synced++
    } catch {
      // leave in queue for next attempt
    }
  }
  return synced
}
