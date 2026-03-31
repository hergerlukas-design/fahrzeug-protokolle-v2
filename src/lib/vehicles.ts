import { supabase } from './supabase'

export interface DamageRecord {
  pos: string
  type: string
  int: string
}

export interface Protocol {
  id: number
  created_at: string
  status: string
  protocol_type?: string
  inspector_name?: string
}

export interface Vehicle {
  id: number
  license_plate: string
  license_plate_normalized: string
  brand_model: string | null
  vin: string | null
  project_id?: number | null
  known_damages?: DamageRecord[] | null
  protocols?: Protocol[]
}

export function normalizeKennzeichen(kz: string): string {
  return kz.toUpperCase().trim().replace(/[\s\-]/g, '')
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select(
      'id, license_plate, license_plate_normalized, brand_model, vin, known_damages, protocols(id, created_at, status, protocol_type, inspector_name)'
    )
    .order('license_plate')
  if (error) throw error
  return (data ?? []) as Vehicle[]
}

export async function createVehicle(values: {
  license_plate: string
  brand_model: string
  vin: string
}): Promise<Vehicle> {
  const normalized = normalizeKennzeichen(values.license_plate)
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      license_plate: values.license_plate,
      license_plate_normalized: normalized,
      brand_model: values.brand_model,
      vin: values.vin,
    })
    .select()
    .single()
  if (error) throw error
  return data as Vehicle
}

export async function updateVehicle(
  id: number,
  values: { license_plate: string; brand_model: string; vin: string }
): Promise<Vehicle> {
  const normalized = normalizeKennzeichen(values.license_plate)
  const { data, error } = await supabase
    .from('vehicles')
    .update({
      license_plate: values.license_plate,
      license_plate_normalized: normalized,
      brand_model: values.brand_model,
      vin: values.vin,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Vehicle
}

export async function deleteVehicle(id: number): Promise<void> {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) throw error
}

/** Compresses an image File to JPEG (max ~1 MB, max 1200px wide). */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1200
      const scale = img.width > MAX ? MAX / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        0.82
      )
    }
    img.onerror = reject
    img.src = url
  })
}

/** Uploads a vehicle photo and returns the public URL. */
export async function uploadVehiclePhoto(vehicleId: number, file: File): Promise<string> {
  const blob = await compressImage(file)
  const path = `vehicle-kartei/${vehicleId}.jpg`

  const { error } = await supabase.storage
    .from('vehicle-photos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error

  const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
  return data.publicUrl
}

/** Returns the public URL for a vehicle photo (404s if no photo was uploaded). */
export function getVehiclePhotoUrl(vehicleId: number): string {
  const { data } = supabase.storage
    .from('vehicle-photos')
    .getPublicUrl(`vehicle-kartei/${vehicleId}.jpg`)
  return data.publicUrl
}

/** Deletes the vehicle photo from storage. */
export async function deleteVehiclePhoto(vehicleId: number): Promise<void> {
  await supabase.storage
    .from('vehicle-photos')
    .remove([`vehicle-kartei/${vehicleId}.jpg`])
}
