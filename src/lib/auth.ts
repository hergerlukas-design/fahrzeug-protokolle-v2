import { supabase } from './supabase'

// Alle Geräte teilen sich ein Supabase-Konto, der PIN ist sein Passwort. Er
// wird nur noch von Supabase geprüft und steht nicht mehr im Bundle. Zugriff
// auf die Daten gibt app_members (20261023_team_login.sql), nicht schon die
// Anmeldung. Die Endung .invalid wird nie zugestellt: über "Passwort
// vergessen" kann so niemand das Konto übernehmen.
const TEAM_EMAIL = 'team@fahrzeug-protokolle.invalid'

/** Länge des zuletzt richtigen PINs: ab dann meldet das Ziffernfeld ohne Haken an. */
const PIN_LENGTH_KEY = 'vpp_pin_length'

// Reste des alten, nur im Browser geprüften PINs.
try {
  localStorage.removeItem('vpp_authenticated')
  localStorage.removeItem('vpp_custom_pin')
} catch { /* ohne localStorage gibt es auch keine Reste */ }

/** Unter diesem Schlüssel legt supabase-js die Sitzung ab (sein Standard). */
function sessionKey(): string | null {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0]
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}

/**
 * Synchron, damit die Routen ohne Ladezustand entscheiden können. Die Sitzung
 * liegt auf dem Gerät und gilt auch offline; läuft sie endgültig ab, meldet
 * supabase-js SIGNED_OUT (siehe unten).
 */
export function isAuthenticated(): boolean {
  const key = sessionKey()
  return !!key && localStorage.getItem(key) !== null
}

export function knownPinLength(): number | null {
  const n = Number(localStorage.getItem(PIN_LENGTH_KEY))
  return n > 0 ? n : null
}

export type LoginResult = 'ok' | 'wrong' | 'error'

export async function login(pin: string): Promise<LoginResult> {
  const { error } = await supabase.auth.signInWithPassword({ email: TEAM_EMAIL, password: pin })
  if (!error) {
    localStorage.setItem(PIN_LENGTH_KEY, String(pin.length))
    return 'ok'
  }
  // 400 heißt falsche Zugangsdaten; alles andere (offline, Server) ist kein falscher PIN.
  return error.status === 400 ? 'wrong' : 'error'
}

/**
 * Ändert den PIN für alle Geräte. Angemeldete Geräte bleiben angemeldet,
 * erst beim nächsten Login gilt der neue.
 */
export async function changePin(currentPin: string, newPin: string): Promise<LoginResult> {
  const check = await login(currentPin)
  if (check !== 'ok') return check
  const { error } = await supabase.auth.updateUser({ password: newPin })
  if (error) throw error
  localStorage.setItem(PIN_LENGTH_KEY, String(newPin.length))
  return 'ok'
}

export async function logout(): Promise<void> {
  // 'local': nur dieses Gerät. Der Standard 'global' meldete mit dem
  // gemeinsamen Konto alle Geräte ab.
  await supabase.auth.signOut({ scope: 'local' })
}

// Sitzung abgelaufen oder widerrufen: zurück zum Login statt leerer Listen.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
})
