import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallBanner() {
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
          <span>📲</span>
          <span>App zum Homescreen hinzufügen</span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="bg-white text-brand-600 font-semibold text-xs px-3 py-1.5 rounded-lg active:scale-95 transition-all"
          >
            Installieren
          </button>
          <button onClick={dismiss} className="text-brand-200 text-xs px-2 py-1.5">✕</button>
        </div>
      </div>
    )
  }

  if (showIosTip) {
    return (
      <div className="bg-brand-600 text-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm">
            <p className="font-semibold mb-0.5">📲 Zum Homescreen hinzufügen</p>
            <p className="text-brand-100 text-xs">
              Tippe auf <span className="font-bold">Teilen</span> (□↑) → <span className="font-bold">„Zum Home-Bildschirm"</span>
            </p>
          </div>
          <button onClick={dismiss} className="text-brand-200 text-xs px-2 py-1 flex-shrink-0">✕</button>
        </div>
      </div>
    )
  }

  return null
}
