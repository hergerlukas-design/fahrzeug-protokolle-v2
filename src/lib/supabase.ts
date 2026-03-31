import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase-Zugangsdaten fehlen. Bitte .env prüfen.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
