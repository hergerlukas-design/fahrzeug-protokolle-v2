import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { syncOffline, getPendingOffline } from '../lib/protocols'

export const OFFLINE_SAVED_EVENT = 'vp-offline-saved'
export const SYNC_REQUEST_EVENT = 'vp-sync-request'

export default function OfflineIndicator() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const refreshCount = useCallback(async () => {
    const pending = await getPendingOffline()
    setPendingCount(pending.length)
  }, [])

  const doSync = useCallback(async () => {
    const pending = await getPendingOffline()
    if (pending.length === 0) return
    setSyncing(true)
    try {
      await syncOffline()
    } finally {
      setSyncing(false)
      await refreshCount()
    }
  }, [refreshCount])

  useEffect(() => {
    refreshCount()
    if (navigator.onLine) doSync()

    const goOffline = () => setOffline(true)
    const goOnline = async () => {
      setOffline(false)
      await doSync()
    }

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    window.addEventListener(OFFLINE_SAVED_EVENT, refreshCount)
    window.addEventListener(SYNC_REQUEST_EVENT, doSync)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      window.removeEventListener(OFFLINE_SAVED_EVENT, refreshCount)
      window.removeEventListener(SYNC_REQUEST_EVENT, doSync)
    }
  }, [refreshCount, doSync])

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
            {t('offline.no_internet')}
            {pendingCount > 0 ? ' ' + t('offline.pending', { count: pendingCount }) : ''}
          </span>
        </>
      ) : syncing ? (
        <>
          <span>🔄</span>
          <span>{t('offline.syncing', { count: pendingCount })}</span>
        </>
      ) : (
        <>
          <span>⏳</span>
          <span>{t('offline.waiting', { count: pendingCount })}</span>
        </>
      )}
    </div>
  )
}
