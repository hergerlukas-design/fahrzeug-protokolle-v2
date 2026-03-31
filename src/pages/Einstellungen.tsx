import { useNavigate } from 'react-router-dom'
import { logout } from '../lib/auth'

export default function Einstellungen() {
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-gray-800 mb-4">⚙️ Einstellungen</h1>
      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 active:scale-95 transition-all"
      >
        Abmelden
      </button>
    </div>
  )
}
