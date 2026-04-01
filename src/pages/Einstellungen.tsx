import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout, changePin } from '../lib/auth'

export default function Einstellungen() {
  const navigate = useNavigate()
  const [pinSection, setPinSection] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handlePinChange(e: React.FormEvent) {
    e.preventDefault()
    setPinMsg(null)
    if (newPin.length < 4) {
      setPinMsg({ ok: false, text: 'Neuer PIN muss mindestens 4 Zeichen haben.' })
      return
    }
    if (newPin !== confirmPin) {
      setPinMsg({ ok: false, text: 'Neuer PIN und Bestätigung stimmen nicht überein.' })
      return
    }
    const ok = changePin(currentPin, newPin)
    if (ok) {
      setPinMsg({ ok: true, text: 'PIN erfolgreich geändert.' })
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setPinSection(false)
    } else {
      setPinMsg({ ok: false, text: 'Aktueller PIN ist falsch.' })
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Einstellungen</h1>

      {/* PIN ändern */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-4 text-left"
          onClick={() => { setPinSection(v => !v); setPinMsg(null) }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔑</span>
            <span className="font-semibold text-gray-800">PIN ändern</span>
          </div>
          <span className="text-gray-400 text-sm">{pinSection ? '▲' : '▼'}</span>
        </button>

        {pinSection && (
          <form onSubmit={handlePinChange} className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
            <input
              type="password"
              inputMode="numeric"
              placeholder="Aktueller PIN"
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value)}
              className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Neuer PIN"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="new-password"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Neuer PIN bestätigen"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="new-password"
            />
            {pinMsg && (
              <p className={`text-sm font-medium ${pinMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {pinMsg.text}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-95 transition-all"
            >
              PIN speichern
            </button>
          </form>
        )}
      </div>

      {/* App-Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">ℹ️</span>
          <span className="font-semibold text-gray-800">App-Info</span>
        </div>
        <div className="flex flex-col gap-1.5 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-400">App</span>
            <span>Fahrzeug-Protokolle v2</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Version</span>
            <span>2.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Betreiber</span>
            <span>CarHandling</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Stack</span>
            <span>React + Supabase + PWA</span>
          </div>
        </div>
      </div>

      {/* Abmelden */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-4 text-red-600 font-semibold hover:bg-red-50 active:scale-95 transition-all"
        >
          <span className="text-2xl">🚪</span>
          <span>Abmelden</span>
        </button>
      </div>
    </div>
  )
}
