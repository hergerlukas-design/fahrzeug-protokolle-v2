import { useEffect, useState, useCallback } from 'react'
import { syncOffline, getPendingOffline } from '../lib/protocols'

export const OFFLINE_SAVED_EVENT = 'vp-offline-saved'

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const refreshCount = useCallback(async () => {
    const pending = await getPendingOffline()
    setPendingCount(pending.length)
  }, [])

  useEffect(() => {
    refreshCount()

    const goOffline = () => setOffline(true)

    const goOnline = async () => {
      setOffline(false)
      const pending = await getPendingOffline()
      if (pending.length === 0) return
      setSyncing(true)
      try {
        await syncOffline()
      } finally {
        setSyncing(false)
        await refreshCount()
      }
    }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    window.addEventListener(OFFLINE_SAVED_EVENT, refreshCount)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      window.removeEventListener(OFFLINE_SAVED_EVENT, refreshCount)
    }
  }, [refreshCount])

  if (!offline && pendingCount === 0 && !syncing) return null

  return (
    <div
      className={`text-white text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 ${
        offline ? 'bg-amber-500' : 'bg-blue-500'
      }`}
    >
      {offline ? (
        <>
          <span>📵</span>
          <span>
            Kein Internet – Daten werden lokal gespeichert
            {pendingCount > 0 ? ` (${pendingCount} ausstehend)` : ''}
          </span>
        </>
      ) : syncing ? (
        <>
          <span>🔄</span>
          <span>
            Synchronisiere {pendingCount} Protokoll{pendingCount !== 1 ? 'e' : ''} …
          </span>
        </>
      ) : (
        <>
          <span>⏳</span>
          <span>
            {pendingCount} Protokoll{pendingCount !== 1 ? 'e' : ''} warten auf Internetverbindung
          </span>
        </>
      )}
    </div>
  )
}
