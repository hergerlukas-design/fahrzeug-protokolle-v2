import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Smartphone, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosTip, setShowIosTip] = useState(false)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('vpp_install_dismissed') === '1')

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isIos && !isStandalone) setShowIosTip(true)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    sessionStorage.setItem('vpp_install_dismissed', '1')
    setDismissed(true)
    setDeferredPrompt(null)
    setShowIosTip(false)
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') dismiss()
    else setDeferredPrompt(null)
  }

  if (dismissed) return null

  if (deferredPrompt) {
    return (
      <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Smartphone size={16} />
          <span>{t('install_banner.add_to_homescreen')}</span>
        </div>
        <div className="flex gap-2 flex-shrink-0 items-center">
          <button
            onClick={handleInstall}
            className="bg-white text-brand-600 font-semibold text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all"
          >
            {t('install_banner.install')}
          </button>
          <button onClick={dismiss} className="text-brand-200 px-2 py-1.5"><X size={14} /></button>
        </div>
      </div>
    )
  }

  if (showIosTip) {
    return (
      <div className="bg-brand-600 text-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm flex gap-2">
            <Smartphone size={16} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">{t('install_banner.ios_tip_title')}</p>
              <p className="text-brand-100 text-xs">{t('install_banner.ios_tip_body')}</p>
            </div>
          </div>
          <button onClick={dismiss} className="text-brand-200 px-2 py-1 flex-shrink-0"><X size={14} /></button>
        </div>
      </div>
    )
  }

  return null
}
