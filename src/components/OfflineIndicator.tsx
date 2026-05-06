import { useEffect, useState } from 'react'

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="bg-amber-500 text-white text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2">
      <span>📵</span>
      <span>Kein Internet – Daten werden lokal gespeichert und automatisch synchronisiert.</span>
    </div>
  )
}
