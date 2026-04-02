import { useState } from 'react'
import { generatePdf, type PdfData } from '../lib/generatePdf'

interface Props {
  data: PdfData
  /** Accent colour: 'brand' (Annahme) | 'green' (Überführung) */
  accent?: 'brand' | 'green'
}

export default function PdfButton({ data, accent = 'brand' }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const btnClass =
    accent === 'green'
      ? 'flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm active:bg-green-700 disabled:opacity-50'
      : 'flex-1 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm active:bg-brand-700 disabled:opacity-50'

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const pdfBytes = await generatePdf(data)

      const date = data.inspection_date
        ? new Date(data.inspection_date).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
      const plate = (data.license_plate ?? 'Protokoll').replace(/\s/g, '-')
      const filename = `${plate}_${date}.pdf`

      // pdfBytes ist Uint8Array — direkt in Blob (nicht .buffer, das kann zu groß sein)
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })

      // Web Share API (Android Chrome, Safari 15.1+)
      const shareFile = new File([blob], filename, { type: 'application/pdf' })
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [shareFile] })
      ) {
        await navigator.share({ files: [shareFile], title: filename })
        return
      }

      const url = URL.createObjectURL(blob)

      // iOS Safari blockiert a.download + a.click() — neuen Tab öffnen
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

      if (isIOS) {
        window.open(url, '_blank')
        // URL nicht sofort revoken — der Tab braucht die Ressource noch
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (err: unknown) {
      // AbortError means the user cancelled the share sheet — not an error
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-xs">
      <button onClick={handleClick} disabled={loading} className={btnClass}>
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Generiere PDF…
          </span>
        ) : (
          '📄 PDF erstellen'
        )}
      </button>
      {error && <p className="mt-2 text-xs text-red-500 text-center">{error}</p>}
    </div>
  )
}
