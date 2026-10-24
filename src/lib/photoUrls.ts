import { supabase } from './supabase'

// Der Bucket vehicle-photos ist privat: Fotos und Unterschriften lädt nur, wer
// angemeldet und Mitglied ist. In der Datenbank stehen trotzdem weiter die
// öffentlichen Adressen (…/object/public/vehicle-photos/<pfad>) – sie dienen
// nur noch als Kennung. Zum Anzeigen tauscht signedPhotoUrl sie gegen einen
// signierten Link, der nach SIGN_SECONDS abläuft.

const BUCKET = 'vehicle-photos'
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`
const SIGN_SECONDS = 6 * 60 * 60
/** So lange vor Ablauf wird neu signiert, damit kein Bild mit einem gerade ablaufenden Link startet. */
const RENEW_MS = 10 * 60 * 1000

/** Pfad im Bucket, oder null für alles andere (blob:, data:, Logos). */
export function storagePath(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(PUBLIC_MARKER)
  if (i < 0) return null
  return decodeURIComponent(url.slice(i + PUBLIC_MARKER.length).split('?')[0])
}

/**
 * Link ohne Token. Online nützt er nichts, aber der Service Worker legt Fotos
 * unter genau dieser Adresse ab (vite.config.ts) – offline kommt so ein schon
 * einmal geladenes Bild aus dem Speicher.
 */
function unsignedUrl(path: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  return `${base}/storage/v1/object/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`
}

const cache = new Map<string, { url: string; expires: number }>()
let pending: Map<string, ((url: string) => void)[]> | null = null

/**
 * Sammelt alle Anfragen eines Renderdurchgangs und signiert sie mit einem
 * Aufruf – die Fahrzeugliste fragt sonst siebzig Mal einzeln.
 */
async function flush(batch: Map<string, ((url: string) => void)[]>) {
  const paths = [...batch.keys()]
  const signed = new Map<string, string>()
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS)
    const expires = Date.now() + SIGN_SECONDS * 1000
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signed.set(item.path, item.signedUrl)
        cache.set(item.path, { url: item.signedUrl, expires })
      }
    }
  } catch {
    // Offline oder Server nicht erreichbar: unten greift der Link ohne Token.
  }
  for (const [path, waiting] of batch) {
    const url = signed.get(path) ?? unsignedUrl(path)
    for (const resolve of waiting) resolve(url)
  }
}

/** Anzeigbarer Link zu einer gespeicherten Foto-Adresse; alles andere kommt unverändert zurück. */
export function signedPhotoUrl(url: string): Promise<string> {
  const path = storagePath(url)
  if (!path) return Promise.resolve(url)
  const hit = cache.get(path)
  if (hit && hit.expires - RENEW_MS > Date.now()) return Promise.resolve(hit.url)

  return new Promise((resolve) => {
    if (!pending) {
      const batch = new Map<string, ((url: string) => void)[]>()
      pending = batch
      queueMicrotask(() => {
        pending = null
        void flush(batch)
      })
    }
    const waiting = pending.get(path)
    if (waiting) waiting.push(resolve)
    else pending.set(path, [resolve])
  })
}

/** Synchron, falls schon signiert – erspart beim erneuten Rendern ein leeres Bild. */
export function cachedPhotoUrl(url: string): string | null {
  const path = storagePath(url)
  if (!path) return url
  const hit = cache.get(path)
  return hit && hit.expires - RENEW_MS > Date.now() ? hit.url : null
}
