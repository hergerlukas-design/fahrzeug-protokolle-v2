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

      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })

      // Try Web Share API (iOS / Android native sheet)
      const shareFile = new File([blob], filename, { type: 'application/pdf' })
      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [shareFile] })
      ) {
        await navigator.share({ files: [shareFile], title: filename })
      } else {
        // Fallback: direct download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
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
