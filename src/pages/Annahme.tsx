import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  DEFAULT_CHECKLISTE,
  DAMAGE_INTENSITIES,
  DAMAGE_POSITIONS,
  DAMAGE_TYPES,
  INSPECTION_CONDITIONS,
  getPendingOffline,
  saveOffline,
  saveProtocol,
  syncOffline,
  uploadProtocolPhoto,
  uploadSignature,
  type Checkliste,
  type DamageItem,
  type OfflineEntry,
} from '../lib/protocols'
import PdfButton from '../components/PdfButton'
import type { PdfData } from '../lib/generatePdf'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PrefillState {
  vehicle_id: number
  license_plate: string
  brand_model: string
  vin: string
  known_damages: DamageItem[]
}

interface DamageFormItem extends DamageItem {
  key: string
  file?: File
  previewUrl?: string
}

type PhotoKey = 'vorne' | 'hinten' | 'links' | 'rechts' | 'schein'

interface VehiclePhotoEntry {
  file: File
  previewUrl: string
}

const PHOTO_LABELS: Record<PhotoKey, string> = {
  vorne: 'Vorne',
  hinten: 'Hinten',
  links: 'Links',
  rechts: 'Rechts',
  schein: 'Schein',
}

const PHOTO_KEYS: PhotoKey[] = ['vorne', 'hinten', 'links', 'rechts', 'schein']

// ─────────────────────────────────────────────────────────────────────────────
// Signature Canvas
// ─────────────────────────────────────────────────────────────────────────────

function SignatureCanvas({
  canvasRef,
  onHasStroke,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onHasStroke: (v: boolean) => void
}) {
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
        className="mt-2 text-sm text-red-500 active:text-red-700"
      >
        ✕ Unterschrift löschen
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 pt-5 pb-2">
      {title}
    </h2>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm mx-4 p-4 ${className}`}>
      {children}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  trueLabel,
  falseLabel,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  trueLabel: string
  falseLabel: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
        checked
          ? 'bg-green-50 text-green-800 border border-green-200'
          : 'bg-gray-50 text-gray-600 border border-gray-200'
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
          checked ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-500'
        }`}
      >
        {checked ? trueLabel : falseLabel}
      </span>
    </button>
  )
}

function LevelSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-bold text-gray-900">{value} %</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-600"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>0 %</span>
        <span>100 %</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Damage row
// ─────────────────────────────────────────────────────────────────────────────

function DamageRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: DamageFormItem
  index: number
  onUpdate: (key: string, fields: Partial<DamageFormItem>) => void
  onRemove: (key: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    onUpdate(item.key, { file, previewUrl })
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">Schaden {index + 1}</span>
        <button
          type="button"
          onClick={() => onRemove(item.key)}
          className="text-red-400 text-sm active:text-red-600"
        >
          ✕ Entfernen
        </button>
      </div>
      <select
        value={item.pos}
        onChange={(e) => onUpdate(item.key, { pos: e.target.value })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <option value="">Position wählen …</option>
        {DAMAGE_POSITIONS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={item.type}
          onChange={(e) => onUpdate(item.key, { type: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">Art …</option>
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={item.int}
          onChange={(e) => onUpdate(item.key, { int: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">Intensität …</option>
          {DAMAGE_INTENSITIES.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        {item.previewUrl ? (
          <div className="relative">
            <img
              src={item.previewUrl}
              alt="Schaden"
              className="w-16 h-16 object-cover rounded-lg border border-gray-200"
            />
            <button
              type="button"
              onClick={() => onUpdate(item.key, { file: undefined, previewUrl: undefined })}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-sm text-brand-600 border border-brand-200 rounded-lg px-3 py-2 bg-brand-50 active:bg-brand-100"
          >
            📷 <span>Foto</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Annahme() {
  const loc = useLocation()
  const navigate = useNavigate()
  const prefill = (loc.state as PrefillState) ?? null

  const sessionKey = useRef(Date.now().toString())

  // ── Form state ─────────────────────────────────────────────────────────────
  const [inspector, setInspector] = useState('')
  const [standort, setStandort] = useState('')
  const [conditions, setConditions] = useState<string[]>([])
  const [fuel, setFuel] = useState(100)
  const [battery, setBattery] = useState(100)
  const [odometer, setOdometer] = useState(0)
  const [remarks, setRemarks] = useState('')
  const [checklist, setChecklist] = useState<Checkliste>({ ...DEFAULT_CHECKLISTE })

  const [damages, setDamages] = useState<DamageFormItem[]>(() =>
    (prefill?.known_damages ?? []).map((d, i) => ({ ...d, key: `d_${i}` }))
  )

  const [vehiclePhotos, setVehiclePhotos] = useState<Partial<Record<PhotoKey, VehiclePhotoEntry>>>({})
  const photoFileRefs = useRef<Record<PhotoKey, React.RefObject<HTMLInputElement | null>>>({
    vorne: { current: null },
    hinten: { current: null },
    links: { current: null },
    rechts: { current: null },
    schein: { current: null },
  })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasSig, setHasSig] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [savedPdfData, setSavedPdfData] = useState<PdfData | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadPendingCount()

    async function handleOnline() {
      setSyncing(true)
      try {
        const count = await syncOffline()
        if (count > 0) {
          setSyncMsg(`${count} Protokoll${count !== 1 ? 'e' : ''} synchronisiert.`)
          setTimeout(() => setSyncMsg(null), 4000)
          await loadPendingCount()
        }
      } finally {
        setSyncing(false)
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  async function loadPendingCount() {
    const pending = await getPendingOffline()
    setPendingCount(pending.length)
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  function toggleCondition(c: string) {
    setConditions((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    )
  }

  function addDamage() {
    setDamages((prev) => [...prev, { key: `d_${Date.now()}`, pos: '', type: '', int: '' }])
  }

  function updateDamage(key: string, fields: Partial<DamageFormItem>) {
    setDamages((prev) => prev.map((d) => (d.key === key ? { ...d, ...fields } : d)))
  }

  function removeDamage(key: string) {
    setDamages((prev) => {
      const item = prev.find((d) => d.key === key)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((d) => d.key !== key)
    })
  }

  function handleVehiclePhotoChange(pk: PhotoKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setVehiclePhotos((prev) => ({ ...prev, [pk]: { file, previewUrl } }))
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!prefill) {
      setError('Kein Fahrzeug ausgewählt. Bitte von der Fahrzeugliste starten.')
      return
    }
    if (!inspector.trim()) {
      setError('Ersteller ist ein Pflichtfeld.')
      return
    }
    setSaving(true)
    setError(null)

    const damageRecords: DamageItem[] = damages
      .filter((d) => d.pos || d.type || d.int)
      .map(({ pos, type, int }) => ({ pos, type, int }))

    const sigDataUrl =
      hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null

    const basePayload = {
      vehicle_id: prefill.vehicle_id,
      inspector_name: inspector.trim(),
      location: standort.trim(),
      odometer,
      fuel_level: fuel,
      remarks: remarks.trim(),
      inspection_date: new Date().toISOString(),
      status: (sigDataUrl ? 'final' : 'draft') as 'final' | 'draft',
      protocol_type: 'annahme' as const,
      condition_data: {
        battery,
        photos: {} as Record<string, string>,
        conditions,
        damage_records: damageRecords,
        checkliste: checklist,
      },
    }

    try {
      if (navigator.onLine) {
        const photos: Record<string, string> = {}
        for (const pk of PHOTO_KEYS) {
          const entry = vehiclePhotos[pk]
          if (entry?.file) {
            photos[pk] = await uploadProtocolPhoto(
              prefill.vehicle_id,
              sessionKey.current,
              pk,
              entry.file
            )
          }
        }
        for (const d of damages) {
          if (d.file) {
            photos[`schaden_${d.key}`] = await uploadProtocolPhoto(
              prefill.vehicle_id,
              sessionKey.current,
              `schaden_${d.key}`,
              d.file
            )
          }
        }
        if (sigDataUrl) {
          photos.signature = await uploadSignature(
            prefill.vehicle_id,
            sessionKey.current,
            sigDataUrl
          )
        }
        basePayload.condition_data.photos = photos
        await saveProtocol(basePayload)
      } else {
        // Offline: store in IndexedDB
        const photoBlobs: Record<string, Blob> = {}
        for (const pk of PHOTO_KEYS) {
          const entry = vehiclePhotos[pk]
          if (entry?.file) photoBlobs[pk] = entry.file
        }
        for (const d of damages) {
          if (d.file) photoBlobs[`schaden_${d.key}`] = d.file
        }
        let signatureBlob: Blob | undefined
        if (sigDataUrl) {
          signatureBlob = await (await fetch(sigDataUrl)).blob()
        }
        const offlineEntry: OfflineEntry = {
          createdAt: new Date().toISOString(),
          vehicleId: prefill.vehicle_id,
          sessionKey: sessionKey.current,
          payload: basePayload,
          photoBlobs,
          signatureBlob,
        }
        await saveOffline(offlineEntry)
        await loadPendingCount()
      }
      setSavedPdfData({
        protocol_type: 'annahme',
        status: basePayload.status,
        inspector_name: basePayload.inspector_name,
        location: basePayload.location,
        odometer: basePayload.odometer,
        fuel_level: basePayload.fuel_level,
        battery: basePayload.condition_data.battery,
        remarks: basePayload.remarks,
        inspection_date: basePayload.inspection_date,
        license_plate: prefill.license_plate,
        brand_model: prefill.brand_model,
        vin: prefill.vin,
        photos: { ...basePayload.condition_data.photos },
        conditions: basePayload.condition_data.conditions,
        damage_records: basePayload.condition_data.damage_records,
        checkliste: basePayload.condition_data.checkliste,
      })
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setSuccess(false)
    setInspector('')
    setStandort('')
    setConditions([])
    setFuel(100)
    setBattery(100)
    setOdometer(0)
    setRemarks('')
    setChecklist({ ...DEFAULT_CHECKLISTE })
    setDamages([])
    setVehiclePhotos({})
    setHasSig(false)
    sessionKey.current = Date.now().toString()
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 gap-6 text-center">
        <div className="text-6xl">✅</div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Protokoll gespeichert</h1>
          <p className="text-sm text-gray-500">
            {navigator.onLine
              ? 'Das Annahmeprotokoll wurde erfolgreich gespeichert.'
              : 'Offline gespeichert — wird synchronisiert, sobald Internet verfügbar ist.'}
          </p>
        </div>
        {savedPdfData && <PdfButton data={savedPdfData} accent="blue" />}
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={resetForm}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
          >
            Weiteres Protokoll
          </button>
          <button
            onClick={() => navigate('/fahrzeuge')}
            className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm"
          >
            Zur Übersicht
          </button>
        </div>
      </div>
    )
  }

  // ── No prefill ─────────────────────────────────────────────────────────────
  if (!prefill) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 gap-4 text-center">
        <div className="text-5xl">📋</div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">Fahrzeug wählen</h1>
          <p className="text-sm text-gray-500">
            Öffne ein Fahrzeug in der Kartei und tippe auf{' '}
            <strong>Neues Annahmeprotokoll</strong>.
          </p>
        </div>
        <button
          onClick={() => navigate('/fahrzeuge')}
          className="py-3 px-6 rounded-xl bg-brand-600 text-white font-semibold text-sm"
        >
          Zur Fahrzeugkartei
        </button>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSave} className="flex flex-col min-h-full bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">📝 Annahmeprotokoll</h1>
        <p className="text-sm text-gray-500 mt-0.5">{prefill.license_plate}</p>
      </div>

      {/* Offline banner */}
      {(pendingCount > 0 || syncing) && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
          <span className="text-amber-600">📶</span>
          <p className="text-sm text-amber-800 flex-1">
            {syncing
              ? 'Synchronisiere …'
              : `${pendingCount} Protokoll${pendingCount !== 1 ? 'e' : ''} warten auf Sync`}
          </p>
        </div>
      )}
      {syncMsg && (
        <div className="mx-4 mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          ✅ {syncMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 items-start">
          <span className="text-red-500 mt-0.5">⚠️</span>
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-400 text-lg leading-none">
            ×
          </button>
        </div>
      )}

      {/* ── 1. Fahrzeugdaten ── */}
      <SectionHeader title="1. Fahrzeugdaten" />
      <Card>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Kennzeichen</span>
            <span className="text-sm font-semibold text-gray-900">{prefill.license_plate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Marke / Modell</span>
            <span className="text-sm text-gray-700">{prefill.brand_model || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">FIN</span>
            <span className="text-sm text-gray-700 font-mono">{prefill.vin || '—'}</span>
          </div>
        </div>
      </Card>

      {/* ── 2. Ersteller & Standort ── */}
      <SectionHeader title="2. Ersteller & Standort" />
      <Card className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ersteller <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            placeholder="Name des Erstellers"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Standort</label>
          <input
            type="text"
            value={standort}
            onChange={(e) => setStandort(e.target.value)}
            placeholder="z. B. München, Halle 3"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
          <input
            type="text"
            value={new Date().toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
            disabled
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 text-gray-400"
          />
        </div>
      </Card>

      {/* ── 3. Sichtbedingungen ── */}
      <SectionHeader title="3. Sichtbedingungen" />
      <Card>
        <p className="text-xs text-gray-500 mb-2">Erschwerende Bedingungen (optional):</p>
        <div className="flex flex-wrap gap-2">
          {INSPECTION_CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCondition(c)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                conditions.includes(c)
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      {/* ── 4. Fahrzeugfotos ── */}
      <SectionHeader title="4. Fahrzeugfotos" />
      <Card>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {PHOTO_KEYS.slice(0, 3).map((pk) => {
            const entry = vehiclePhotos[pk]
            return (
              <div key={pk} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => photoFileRefs.current[pk].current?.click()}
                  className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors ${
                    entry ? 'border-green-300' : 'border-dashed border-gray-300 active:border-brand-400'
                  }`}
                >
                  {entry ? (
                    <img src={entry.previewUrl} alt={pk} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">📷</span>
                  )}
                </button>
                <span className="text-xs text-gray-500">{PHOTO_LABELS[pk]}</span>
                <input
                  ref={photoFileRefs.current[pk]}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleVehiclePhotoChange(pk, e)}
                />
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PHOTO_KEYS.slice(3).map((pk) => {
            const entry = vehiclePhotos[pk]
            return (
              <div key={pk} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => photoFileRefs.current[pk].current?.click()}
                  className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors ${
                    entry ? 'border-green-300' : 'border-dashed border-gray-300 active:border-brand-400'
                  }`}
                >
                  {entry ? (
                    <img src={entry.previewUrl} alt={pk} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">📷</span>
                  )}
                </button>
                <span className="text-xs text-gray-500">{PHOTO_LABELS[pk]}</span>
                <input
                  ref={photoFileRefs.current[pk]}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleVehiclePhotoChange(pk, e)}
                />
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── 5. Schadenserfassung ── */}
      <SectionHeader title="5. Schadenserfassung" />
      <div className="mx-4 space-y-3">
        {damages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-400 text-center italic">Keine Schäden erfasst.</p>
          </div>
        ) : (
          damages.map((d, i) => (
            <DamageRow key={d.key} item={d} index={i} onUpdate={updateDamage} onRemove={removeDamage} />
          ))
        )}
        <button
          type="button"
          onClick={addDamage}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 flex items-center justify-center gap-2 active:border-brand-400 active:text-brand-600"
        >
          + Schaden hinzufügen
        </button>
      </div>

      {/* ── 6. Checkliste ── */}
      <SectionHeader title="6. Checkliste" />
      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sauberkeit</p>
        <div className="space-y-2 mb-4">
          {(
            [
              ['floor', 'Boden'],
              ['seats', 'Sitze'],
              ['entry', 'Einstiege'],
              ['instruments', 'Armaturen'],
              ['trunk', 'Kofferraum'],
              ['engine', 'Motorraum'],
            ] as [keyof Checkliste, string][]
          ).map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={checklist[key]}
              onChange={(v) => setChecklist((prev) => ({ ...prev, [key]: v }))}
              trueLabel="Sauber"
              falseLabel="Schmutzig"
            />
          ))}
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ausstattung</p>
        <div className="space-y-2">
          {(
            [
              ['aid_kit', 'Verbandskasten'],
              ['triangle', 'Warndreieck'],
              ['vest', 'Warnweste'],
              ['cable', 'Ladekabel'],
              ['registration', 'Fahrzeugschein'],
              ['card', 'Ladekarte'],
            ] as [keyof Checkliste, string][]
          ).map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={checklist[key]}
              onChange={(v) => setChecklist((prev) => ({ ...prev, [key]: v }))}
              trueLabel="Ja"
              falseLabel="Nein"
            />
          ))}
        </div>
      </Card>

      {/* ── 7. Füllstände ── */}
      <SectionHeader title="7. Füllstände" />
      <Card className="space-y-5">
        <LevelSlider label="Kraftstoff" value={fuel} onChange={setFuel} />
        <LevelSlider label="Batterie / HV" value={battery} onChange={setBattery} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kilometerstand</label>
          <input
            type="number"
            value={odometer || ''}
            onChange={(e) => setOdometer(Math.max(0, Number(e.target.value)))}
            placeholder="0"
            min={0}
            max={2000000}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      </Card>

      {/* ── 8. Bemerkungen ── */}
      <SectionHeader title="8. Bemerkungen" />
      <Card>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Zusätzliche Hinweise …"
          rows={3}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
        />
      </Card>

      {/* ── 9. Unterschrift ── */}
      <SectionHeader title="9. Unterschrift" />
      <Card>
        <p className="text-xs text-gray-500 mb-2">
          {hasSig
            ? '✅ Unterschrift vorhanden — Protokoll wird als final gespeichert.'
            : 'Ohne Unterschrift wird das Protokoll als Entwurf gespeichert.'}
        </p>
        <SignatureCanvas canvasRef={canvasRef} onHasStroke={setHasSig} />
      </Card>

      {/* ── Save button ── */}
      <div className="mx-4 mt-6">
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-brand-600 text-white font-bold text-base shadow-lg disabled:opacity-60 active:bg-brand-700"
        >
          {saving ? 'Speichert …' : navigator.onLine ? '💾 Protokoll speichern' : '📶 Offline speichern'}
        </button>
        {!navigator.onLine && (
          <p className="text-xs text-center text-amber-600 mt-2">
            Kein Internet — Daten werden lokal gespeichert und automatisch synchronisiert.
          </p>
        )}
      </div>
    </form>
  )
}
