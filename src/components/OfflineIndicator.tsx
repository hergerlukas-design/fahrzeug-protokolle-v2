import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WifiOff, AlertTriangle, Clock } from 'lucide-react'
import { syncOffline, getPendingOffline } from '../lib/protocols'

export const OFFLINE_SAVED_EVENT = 'vp-offline-saved'
export const SYNC_REQUEST_EVENT = 'vp-sync-request'

export default function OfflineIndicator() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncFailed, setLastSyncFailed] = useState(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const refreshCount = useCallback(async () => {
    try {
      const pending = await getPendingOffline()
      setPendingCount(pending.length)
    } catch {
      // IndexedDB may fail — don't crash
    }
  }, [])

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return
    const pending = await getPendingOffline()
    if (pending.length === 0) return
    setSyncing(true)
    try {
      const result = await syncOffline()
      setLastSyncFailed(result.failed)
      if (result.failed > 0 && navigator.onLine) {
        clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => doSync(), 30_000)
      }
    } catch {
      // sync itself failed — retry later
    } finally {
      setSyncing(false)
      await refreshCount()
    }
  }, [refreshCount])

  useEffect(() => {
    refreshCount()
    if (navigator.onLine) doSync()

    const goOffline = () => { setOffline(true); clearTimeout(retryTimer.current) }
    const goOnline = async () => {
      setOffline(false)
      setLastSyncFailed(0)
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
      clearTimeout(retryTimer.current)
    }
  }, [refreshCount, doSync])

  if (!offline && pendingCount === 0 && !syncing && lastSyncFailed === 0) return null

  return (
    <div
      className={`text-white text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 ${
        offline ? 'bg-amber-500' : lastSyncFailed > 0 ? 'bg-red-500' : 'bg-blue-500'
      }`}
    >
      {offline ? (
        <>
          <WifiOff size={16} />
          <span>
            {t('offline.no_internet')}
            {pendingCount > 0 ? ' ' + t('offline.pending', { count: pendingCount }) : ''}
          </span>
        </>
      ) : syncing ? (
        <>
          <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>{t('offline.syncing', { count: pendingCount })}</span>
        </>
      ) : lastSyncFailed > 0 ? (
        <>
          <AlertTriangle size={16} />
          <span>{t('offline.sync_failed', { count: lastSyncFailed })}</span>
          <button onClick={doSync} className="underline ml-1">{t('offline.retry')}</button>
        </>
      ) : (
        <>
          <Clock size={16} />
          <span>{t('offline.waiting', { count: pendingCount })}</span>
        </>
      )}
    </div>
  )
}
