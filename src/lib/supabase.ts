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
