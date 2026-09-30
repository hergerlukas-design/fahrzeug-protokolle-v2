// ─────────────────────────────────────────────────────────────────────────────
// Weitere Fotos unter "Bemerkungen" – für Besonderheiten wie einen stark
// verschmutzten Innenraum. Sie liegen wie alle Fotos in
// condition_data.photos, unter zusatz_0, zusatz_1, … – eine Migration
// braucht es dafür nicht. Im PDF stehen sie nach den Schäden.
//
// Ohne Supabase-Import: generatePdf nutzt diese Datei auch.
// ─────────────────────────────────────────────────────────────────────────────

export const EXTRA_PHOTO_PREFIX = 'zusatz_'

export interface ExtraPhoto {
  key: string
  /** Neu aufgenommen, noch nicht hochgeladen */
  file?: File
  previewUrl?: string
  /** Schon gespeichert (Bearbeiten eines Protokolls) */
  url?: string
}

export function isExtraPhotoKey(key: string): boolean {
  return key.startsWith(EXTRA_PHOTO_PREFIX)
}

function extraIndex(key: string): number {
  return Number(key.slice(EXTRA_PHOTO_PREFIX.length)) || 0
}

/** Die weiteren Fotos eines Protokolls, in ihrer Reihenfolge. */
export function extraPhotoEntries(photos: Record<string, string>): [string, string][] {
  return Object.entries(photos)
    .filter(([k, url]) => isExtraPhotoKey(k) && !!url)
    .sort(([a], [b]) => extraIndex(a) - extraIndex(b))
}

export function extraPhotosFrom(photos: Record<string, string> | undefined): ExtraPhoto[] {
  if (!photos) return []
  return extraPhotoEntries(photos).map(([key, url]) => ({ key, url }))
}

/** Lädt neue Fotos hoch und nummeriert alle lückenlos neu. */
export async function uploadExtraPhotos(
  items: ExtraPhoto[],
  upload: (key: string, file: File) => Promise<string>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const key = `${EXTRA_PHOTO_PREFIX}${i}`
    if (item.file) out[key] = await upload(key, item.file)
    else if (item.url) out[key] = item.url
  }
  return out
}

/** Offline: neue Fotos als Blobs für die Warteschlange. */
export function extraPhotoBlobs(items: ExtraPhoto[]): Record<string, Blob> {
  const out: Record<string, Blob> = {}
  items.forEach((item, i) => {
    if (item.file) out[`${EXTRA_PHOTO_PREFIX}${i}`] = item.file
  })
  return out
}

/** Offline: lokale URLs, damit das PDF sie gleich einbetten kann. */
export function extraPhotoPreviews(items: ExtraPhoto[]): Record<string, string> {
  const out: Record<string, string> = {}
  items.forEach((item, i) => {
    const src = item.previewUrl ?? item.url
    if (src) out[`${EXTRA_PHOTO_PREFIX}${i}`] = src
  })
  return out
}
