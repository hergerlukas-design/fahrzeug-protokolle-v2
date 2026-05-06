const AUTH_KEY = 'vpp_authenticated'
const CUSTOM_PIN_KEY = 'vpp_custom_pin'

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === 'true'
}

export function login(pin: string): boolean {
  const customPin = localStorage.getItem(CUSTOM_PIN_KEY)
  const correctPin = customPin ?? (import.meta.env.VITE_APP_PASSWORD as string)
  if (pin === correctPin) {
    localStorage.setItem(AUTH_KEY, 'true')
    return true
  }
  return false
}

export function changePin(currentPin: string, newPin: string): boolean {
  const customPin = localStorage.getItem(CUSTOM_PIN_KEY)
  const correctPin = customPin ?? (import.meta.env.VITE_APP_PASSWORD as string)
  if (currentPin !== correctPin) return false
  localStorage.setItem(CUSTOM_PIN_KEY, newPin)
  return true
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY)
}
