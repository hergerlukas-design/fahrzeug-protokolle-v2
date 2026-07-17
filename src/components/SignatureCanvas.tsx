import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

export default function SignatureCanvas({
  canvasRef,
  onHasStroke,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onHasStroke: (v: boolean) => void
}) {
  const { t } = useTranslation()
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const initialized = useRef(false)

  function initCanvas() {
    const canvas = canvasRef.current
    if (!canvas || initialized.current) return
    initialized.current = true
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#f5f5f5'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  function getPos(e: React.TouchEvent | React.MouseEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    }
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    initCanvas()
    isDrawing.current = true
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    onHasStroke(true)
  }

  function stopDraw(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault()
    isDrawing.current = false
    lastPos.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#f5f5f5'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    onHasStroke(false)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-gray-300 touch-none cursor-crosshair"
        style={{ height: 160 }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <button
        type="button"
        onClick={clearCanvas}
        className="mt-2 text-sm text-red-500 active:text-red-700 flex items-center gap-1"
      >
        <X size={14} /> {t('annahme.sig_clear')}
      </button>
    </div>
  )
}
