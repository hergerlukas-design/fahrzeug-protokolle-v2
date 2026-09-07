import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase-Zugangsdaten fehlen. Bitte .env prüfen.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export class OfflineError extends Error {
  constructor() {
    super('Keine Internetverbindung. Bitte später erneut versuchen.')
    this.name = 'OfflineError'
  }
}

export function requireOnline(): void {
  if (!navigator.onLine) throw new OfflineError()
}

/**
 * Lesbare Fehlermeldung aus einem unbekannten Fehlerwert.
 *
 * Supabase liefert bei fehlgeschlagenen Requests einfache Objekte
 * ({ message, details, hint, code }) und keine Error-Instanzen — ein
 * `String(e)` darauf ergibt nur "[object Object]". Diese Funktion holt die
 * eigentliche Meldung heraus und hängt den Fehlercode an, damit im UI z. B.
 * "relation \"projects\" does not exist (42P01)" steht statt eines
 * generischen Hinweises.
 */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string' && e.trim()) return e
  if (e && typeof e === 'object') {
    const obj = e as { message?: unknown; details?: unknown; code?: unknown }
    const message =
      typeof obj.message === 'string' && obj.message.trim()
        ? obj.message
        : typeof obj.details === 'string' && obj.details.trim()
          ? obj.details
          : null
    if (message) {
      return typeof obj.code === 'string' && obj.code ? `${message} (${obj.code})` : message
    }
  }
  return fallback
}
