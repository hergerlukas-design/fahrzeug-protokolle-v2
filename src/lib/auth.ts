const AUTH_KEY = 'vpp_authenticated'

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === 'true'
}

export function login(pin: string): boolean {
  const correctPin = import.meta.env.VITE_APP_PASSWORD as string
  if (pin === correctPin) {
    localStorage.setItem(AUTH_KEY, 'true')
    return true
  }
  return false
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY)
}
