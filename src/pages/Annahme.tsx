import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  X, Camera, Image, ArrowLeft, ArrowRight, ClipboardList, AlertTriangle,
  CheckCircle2, Plus, Save, CloudOff,
} from 'lucide-react'
import {
  DEFAULT_CHECKLISTE,
  DAMAGE_INTENSITIES,
  DAMAGE_TYPES,
  INSPECTION_CONDITIONS,
  saveOffline,
  saveProtocol,
  updateProtocol,
  uploadProtocolPhoto,
  uploadSignature,
  type Checkliste,
  type DamageItem,
  type OfflineEntry,
} from '../lib/protocols'
import { OFFLINE_SAVED_EVENT } from '../components/OfflineIndicator'
import PdfButton from '../components/PdfButton'
import CarDamageSelector from '../components/CarDamageSelector'
import type { PdfData } from '../lib/generatePdf'
import { updateVehicle, updateVehicleKnownDamages, type DamageRecord } from '../lib/vehicles'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AnnahmeEditData {
  protocol_id: number
  inspector_name: string
  location: string
  conditions: string[]
  fuel: number
  battery: number
  odometer: number
  remarks: string
  checkliste: Checkliste
  damages: DamageItem[]
  photos: Record<string, string>
}

interface PrefillState {
  vehicle_id: string
  license_plate: string
  brand_model: string
  vin: string
  known_damages: DamageRecord[]
  edit?: AnnahmeEditData
}

interface DamageFormItem extends DamageItem {
  key: string
  file?: File
  previewUrl?: string
  /** Previously saved photo (from vehicle kartei or this protocol's own storage) */
  photo_url?: string
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
  const { t } = useTranslation()
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    onUpdate(item.key, { file, previewUrl })
    e.target.value = ''
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">{t('annahme.damage_label', { count: index + 1 })}</span>
        <button
          type="button"
          onClick={() => onRemove(item.key)}
          className="text-red-400 text-sm active:text-red-600 flex items-center gap-1"
        >
          <X size={14} /> {t('annahme.damage_remove')}
        </button>
      </div>
      <CarDamageSelector
        value={item.pos || null}
        onChange={(pos) => onUpdate(item.key, { pos })}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={item.type}
          onChange={(e) => onUpdate(item.key, { type: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">{t('annahme.damage_type_placeholder')}</option>
          {DAMAGE_TYPES.map((dt) => (
            <option key={dt} value={dt}>{t(`damage.types.${dt}`, { defaultValue: dt })}</option>
          ))}
        </select>
        <select
          value={item.int}
          onChange={(e) => onUpdate(item.key, { int: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="">{t('annahme.damage_intensity_placeholder')}</option>
          {DAMAGE_INTENSITIES.map((di) => (
            <option key={di} value={di}>{t(`damage.intensities.${di}`, { defaultValue: di })}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        {item.previewUrl || item.photo_url ? (
          <div className="relative">
            <img
              src={item.previewUrl ?? item.photo_url}
              alt={t('annahme.damage_label', { count: index + 1 })}
              className="w-16 h-16 object-cover rounded-lg border border-gray-200"
            />
            {!item.previewUrl && item.photo_url && (
              <span className="absolute -bottom-1 -left-1 bg-gray-900/70 text-white text-[9px] leading-none px-1 py-0.5 rounded">
                {t('damage.existing_photo')}
              </span>
            )}
            <button
              type="button"
              onClick={() => onUpdate(item.key, { file: undefined, previewUrl: undefined, photo_url: undefined })}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-brand-600 border border-brand-200 rounded-lg px-3 py-2 bg-brand-50 active:bg-brand-100"
            >
              <Camera size={15} /> <span>{t('damage.camera')}</span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 active:bg-gray-100"
            >
              <Image size={15} /> <span>{t('damage.gallery')}</span>
            </button>
          </div>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
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
  const { t } = useTranslation()
  const prefill = (loc.state as PrefillState) ?? null

  const sessionKey = useRef(Date.now().toString())

  // ── Form state ─────────────────────────────────────────────────────────────
  const ed = prefill?.edit
  const [inspector, setInspector] = useState(ed?.inspector_name ?? '')
  const [standort, setStandort] = useState(ed?.location ?? '')
  const [conditions, setConditions] = useState<string[]>(ed?.conditions ?? [])
  const [fuel, setFuel] = useState(ed?.fuel ?? 100)
  const [battery, setBattery] = useState(ed?.battery ?? 100)
  const [odometer, setOdometer] = useState(ed?.odometer ?? 0)
  const [remarks, setRemarks] = useState(ed?.remarks ?? '')
  const [vin, setVin] = useState(prefill?.vin ?? '')
  const [checklist, setChecklist] = useState<Checkliste>(ed?.checkliste ?? { ...DEFAULT_CHECKLISTE })

  const [damages, setDamages] = useState<DamageFormItem[]>(() =>
    (ed?.damages ?? prefill?.known_damages ?? []).map((d, i) => ({
      ...d,
      key: `d_${i}`,
      // Edit mode: pull the photo already saved on this protocol.
      // New protocol: carry over the photo already saved on the vehicle's known damages.
      photo_url: ed
        ? ed.photos[`schaden_${i}`] ?? ed.photos[`schaden_d_${i}`]
        : (d as DamageRecord).photo_url,
    }))
  )

  const [existingPhotos, _setExistingPhotos] = useState<Partial<Record<PhotoKey, string>>>(() => {
    if (!ed?.photos) return {}
    const out: Partial<Record<PhotoKey, string>> = {}
    for (const k of PHOTO_KEYS) {
      if (ed.photos[k]) out[k] = ed.photos[k]
    }
    return out
  })

  const [vehiclePhotos, setVehiclePhotos] = useState<Partial<Record<PhotoKey, VehiclePhotoEntry>>>({})
  const photoFileRefs = useRef<Record<PhotoKey, React.RefObject<HTMLInputElement | null>>>({
    vorne: { current: null },
    hinten: { current: null },
    links: { current: null },
    rechts: { current: null },
    schein: { current: null },
  })
  const cameraPhotoFileRefs = useRef<Record<PhotoKey, React.RefObject<HTMLInputElement | null>>>({
    vorne: { current: null },
    hinten: { current: null },
    links: { current: null },
    rechts: { current: null },
    schein: { current: null },
  })
  const [photoPickerKey, setPhotoPickerKey] = useState<PhotoKey | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hasSig, setHasSig] = useState(false)

  const canvasRefCarrier = useRef<HTMLCanvasElement>(null)
  const [carrierPresent, setCarrierPresent] = useState(() => !!ed?.photos?.['signature_carrier'])
  const [hasSigCarrier, setHasSigCarrier] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [savedPdfData, setSavedPdfData] = useState<PdfData | null>(null)

  // ── Step wizard ────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0)
  const stepTitles = [
    `${t('annahme.section_vehicle')} & ${t('annahme.section_creator')}`,
    t('annahme.section_photos'),
    t('annahme.section_damages'),
    `${t('annahme.section_conditions')} & ${t('annahme.section_checklist')}`,
    t('annahme.section_levels'),
    t('annahme.section_remarks'),
    t('annahme.section_signature'),
  ]
  const totalSteps = stepTitles.length
  const isLastStep = step === totalSteps - 1

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [step])

  function goNext() {
    if (step === 0 && !inspector.trim()) {
      setError(t('annahme.creator_required'))
      return
    }
    setError(null)
    setStep((s) => Math.min(s + 1, totalSteps - 1))
  }

  function goBack() {
    if (step === 0) {
      navigate(-1)
      return
    }
    setError(null)
    setStep((s) => Math.max(s - 1, 0))
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
  async function handleSave() {
    if (!prefill) {
      setError(t('annahme.no_vehicle_error'))
      return
    }
    if (!inspector.trim()) {
      setError(t('annahme.creator_required'))
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
        // Copy non-damage photos from edit mode; damage photos are re-indexed below
        const photos: Record<string, string> = ed
          ? Object.fromEntries(Object.entries(ed.photos).filter(([k]) => !k.startsWith('schaden_')))
          : {}
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
        for (let i = 0; i < damages.length; i++) {
          const d = damages[i]
          if (d.file) {
            photos[`schaden_${i}`] = await uploadProtocolPhoto(
              prefill.vehicle_id,
              sessionKey.current,
              `schaden_${i}`,
              d.file
            )
          } else if (d.photo_url) {
            // Preserve existing photo (edit mode) or carry over the vehicle's saved damage photo
            photos[`schaden_${i}`] = d.photo_url
          }
        }
        if (sigDataUrl) {
          photos.signature = await uploadSignature(
            prefill.vehicle_id,
            sessionKey.current,
            sigDataUrl
          )
        }
        if (carrierPresent && hasSigCarrier && canvasRefCarrier.current) {
          const carrierDataUrl = canvasRefCarrier.current.toDataURL('image/png')
          photos.signature_carrier = await uploadSignature(
            prefill.vehicle_id,
            sessionKey.current + '_carrier',
            carrierDataUrl
          )
        } else if (carrierPresent && ed?.photos?.['signature_carrier']) {
          photos.signature_carrier = ed.photos['signature_carrier']
        }
        basePayload.condition_data.photos = photos
        if (ed) {
          await updateProtocol(ed.protocol_id, basePayload)
        } else {
          await saveProtocol(basePayload)
        }
        if (damageRecords.length > 0) {
          const damageRecordsWithPhotos: DamageRecord[] = damages
            .map((d, i) => ({ pos: d.pos, type: d.type, int: d.int, photo_url: photos[`schaden_${i}`] }))
            .filter((d) => d.pos || d.type || d.int)
          await updateVehicleKnownDamages(prefill.vehicle_id, damageRecordsWithPhotos)
        }
        const vinTrimmed = vin.trim().toUpperCase()
        if (vinTrimmed !== prefill.vin) {
          await updateVehicle(prefill.vehicle_id, { license_plate: prefill.license_plate, brand_model: prefill.brand_model, vin: vinTrimmed })
        }
      } else {
        // Offline: store in IndexedDB
        const photoBlobs: Record<string, Blob> = {}
        for (const pk of PHOTO_KEYS) {
          const entry = vehiclePhotos[pk]
          if (entry?.file) photoBlobs[pk] = entry.file
        }
        for (let i = 0; i < damages.length; i++) {
          const d = damages[i]
          if (d.file) photoBlobs[`schaden_${i}`] = d.file
        }
        let signatureBlob: Blob | undefined
        if (sigDataUrl) {
          signatureBlob = await (await fetch(sigDataUrl)).blob()
        }
        let signatureCarrierBlob: Blob | undefined
        if (carrierPresent && hasSigCarrier && canvasRefCarrier.current) {
          const carrierDataUrl = canvasRefCarrier.current.toDataURL('image/png')
          signatureCarrierBlob = await (await fetch(carrierDataUrl)).blob()
        }
        const offlineEntry: OfflineEntry = {
          createdAt: new Date().toISOString(),
          vehicleId: prefill.vehicle_id,
          sessionKey: sessionKey.current,
          payload: basePayload,
          photoBlobs,
          signatureBlob,
          signatureCarrierBlob,
        }
        await saveOffline(offlineEntry)
        window.dispatchEvent(new CustomEvent(OFFLINE_SAVED_EVENT))
        // Build local photo URLs so offline PDF can embed them
        const localPhotos: Record<string, string> = {}
        for (const pk of PHOTO_KEYS) {
          const entry = vehiclePhotos[pk]
          if (entry?.previewUrl) localPhotos[pk] = entry.previewUrl
        }
        for (let i = 0; i < damages.length; i++) {
          const d = damages[i]
          if (d.previewUrl) localPhotos[`schaden_${i}`] = d.previewUrl
        }
        if (sigDataUrl) localPhotos.signature = sigDataUrl
        if (carrierPresent && hasSigCarrier && canvasRefCarrier.current) {
          localPhotos.signature_carrier = canvasRefCarrier.current.toDataURL('image/png')
        }
        basePayload.condition_data.photos = localPhotos
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
        vin: vin.trim().toUpperCase() || prefill.vin,
        photos: { ...basePayload.condition_data.photos },
        conditions: basePayload.condition_data.conditions,
        damage_records: basePayload.condition_data.damage_records,
        checkliste: basePayload.condition_data.checkliste,
      })
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('annahme.save_error'))
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
    setStep(0)
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 gap-6 text-center">
        <CheckCircle2 size={64} className="text-green-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{t('annahme.success_title')}</h1>
          <p className="text-sm text-gray-500">
            {navigator.onLine ? t('annahme.success_online') : t('annahme.success_offline')}
          </p>
        </div>
        {savedPdfData && <PdfButton data={savedPdfData} accent="brand" />}
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={resetForm}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
          >
            {t('annahme.another_protocol')}
          </button>
          <button
            onClick={() => navigate('/fahrzeuge')}
            className="flex-1 py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm"
          >
            {t('annahme.to_overview')}
          </button>
        </div>
      </div>
    )
  }

  // ── No prefill ─────────────────────────────────────────────────────────────
  if (!prefill) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 gap-4 text-center">
        <ClipboardList size={48} className="text-gray-300" />
        <div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">{t('annahme.no_vehicle_error')}</h1>
        </div>
        <button
          onClick={() => navigate('/fahrzeuge')}
          className="py-3 px-6 rounded-xl bg-brand-600 text-white font-semibold text-sm"
        >
          {t('annahme.to_overview')}
        </button>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="block min-h-full bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={goBack}
            className="p-1 -ml-1 text-gray-500 hover:text-gray-800 flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate flex items-center gap-1.5">
              <ClipboardList size={16} className="text-gray-400 flex-shrink-0" /> {t('annahme.title')}
            </h1>
            <p className="text-xs text-gray-500 truncate">{prefill.license_plate}</p>
          </div>
          <span className="text-xs font-medium text-gray-400 flex-shrink-0">
            {t('common.step_of', { current: step + 1, total: totalSteps })}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
        <p className="text-sm font-semibold text-gray-700 mt-2">{stepTitles[step]}</p>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 items-start">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-400 leading-none">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Step 1: Fahrzeugdaten + Ersteller & Standort ── */}
      {step === 0 && (
      <>
      <SectionHeader title={t('annahme.section_vehicle')} />
      <Card>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">{t('annahme.plate_label')}</span>
            <span className="text-sm font-semibold text-gray-900">{prefill.license_plate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">{t('annahme.brand_model_label')}</span>
            <span className="text-sm text-gray-700">{prefill.brand_model || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500 flex-shrink-0">{t('annahme.fin_label')}</span>
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              onBlur={async () => {
                const v = vin.trim().toUpperCase()
                if (v && v !== prefill.vin) {
                  try { await updateVehicle(prefill.vehicle_id, { license_plate: prefill.license_plate, brand_model: prefill.brand_model, vin: v }) } catch { /* silent */ }
                }
              }}
              placeholder={t('annahme.fin_placeholder')}
              maxLength={17}
              autoCapitalize="characters"
              className="flex-1 text-right text-sm font-mono text-gray-700 bg-transparent border-b border-gray-300 focus:outline-none focus:border-brand-400 min-w-0"
            />
          </div>
        </div>
      </Card>

      {/* ── 2. Ersteller & Standort ── */}
      <SectionHeader title={t('annahme.section_creator')} />
      <Card className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('annahme.creator_label')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            placeholder={t('annahme.creator_placeholder')}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('annahme.location_label')}</label>
          <input
            type="text"
            value={standort}
            onChange={(e) => setStandort(e.target.value)}
            placeholder={t('annahme.location_placeholder')}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('annahme.date_label')}</label>
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
      </>
      )}

      {/* ── Step 2: Fahrzeugfotos ── */}
      {step === 1 && (
      <>
      <SectionHeader title={t('annahme.section_photos')} />
      <Card>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {PHOTO_KEYS.slice(0, 3).map((pk) => {
            const entry = vehiclePhotos[pk]
            const previewSrc = entry?.previewUrl ?? existingPhotos[pk] ?? null
            return (
              <div key={pk} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => previewSrc ? undefined : setPhotoPickerKey(pk)}
                  className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors ${
                    previewSrc ? 'border-green-300' : 'border-dashed border-gray-300 active:border-brand-400'
                  }`}
                >
                  {previewSrc ? (
                    <img src={previewSrc} alt={pk} className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} className="text-gray-300" />
                  )}
                </button>
                <span className="text-xs text-gray-500">{t(`photo_labels.${pk}`, { defaultValue: PHOTO_LABELS[pk] })}</span>
                <input ref={photoFileRefs.current[pk]} type="file" accept="image/*" className="hidden" onChange={(e) => { handleVehiclePhotoChange(pk, e); e.target.value = '' }} />
                <input ref={cameraPhotoFileRefs.current[pk]} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleVehiclePhotoChange(pk, e); e.target.value = '' }} />
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PHOTO_KEYS.slice(3).map((pk) => {
            const entry = vehiclePhotos[pk]
            const previewSrc = entry?.previewUrl ?? existingPhotos[pk] ?? null
            return (
              <div key={pk} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => previewSrc ? undefined : setPhotoPickerKey(pk)}
                  className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center overflow-hidden transition-colors ${
                    previewSrc ? 'border-green-300' : 'border-dashed border-gray-300 active:border-brand-400'
                  }`}
                >
                  {previewSrc ? (
                    <img src={previewSrc} alt={pk} className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} className="text-gray-300" />
                  )}
                </button>
                <span className="text-xs text-gray-500">{t(`photo_labels.${pk}`, { defaultValue: PHOTO_LABELS[pk] })}</span>
                <input ref={photoFileRefs.current[pk]} type="file" accept="image/*" className="hidden" onChange={(e) => { handleVehiclePhotoChange(pk, e); e.target.value = '' }} />
                <input ref={cameraPhotoFileRefs.current[pk]} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleVehiclePhotoChange(pk, e); e.target.value = '' }} />
              </div>
            )
          })}
        </div>
      </Card>

      {photoPickerKey && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setPhotoPickerKey(null)}>
          <div className="w-full bg-white rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-700 text-center mb-3">{t('annahme.photo_picker_label', { label: t(`photo_labels.${photoPickerKey}`, { defaultValue: PHOTO_LABELS[photoPickerKey] }) })}</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { const k = photoPickerKey; setPhotoPickerKey(null); cameraPhotoFileRefs.current[k].current?.click() }}
                className="py-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-700 font-medium text-sm active:bg-brand-100 flex items-center justify-center gap-1.5"
              >
                <Camera size={16} /> {t('damage.camera')}
              </button>
              <button
                type="button"
                onClick={() => { const k = photoPickerKey; setPhotoPickerKey(null); photoFileRefs.current[k].current?.click() }}
                className="py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 font-medium text-sm active:bg-gray-100 flex items-center justify-center gap-1.5"
              >
                <Image size={16} /> {t('damage.gallery')}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* ── Step 3: Schadenserfassung ── */}
      {step === 2 && (
      <>
      <SectionHeader title={t('annahme.section_damages')} />
      <div className="mx-4 space-y-3">
        {damages.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm text-gray-400 text-center italic">{t('annahme.no_damages')}</p>
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
          <Plus size={16} /> {t('annahme.add_damage')}
        </button>
      </div>
      </>
      )}

      {/* ── Step 4: Sichtbedingungen + Checkliste ── */}
      {step === 3 && (
      <>
      <SectionHeader title={t('annahme.section_conditions')} />
      <Card>
        <p className="text-xs text-gray-500 mb-2">{t('annahme.conditions_hint')}</p>
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
              {t(`conditions.${c}`, { defaultValue: c })}
            </button>
          ))}
        </div>
      </Card>

      <SectionHeader title={t('annahme.section_checklist')} />
      <Card>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('annahme.checklist_cleanliness')}</p>
        <div className="space-y-2 mb-4">
          {(['floor', 'seats', 'entry', 'instruments', 'trunk', 'engine'] as (keyof Checkliste)[]).map((key) => (
            <Toggle
              key={key}
              label={t(`checklist.${key}`)}
              checked={checklist[key]}
              onChange={(v) => setChecklist((prev) => ({ ...prev, [key]: v }))}
              trueLabel={t('common.clean')}
              falseLabel={t('common.dirty')}
            />
          ))}
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('annahme.checklist_equipment')}</p>
        <div className="space-y-2">
          {(['aid_kit', 'triangle', 'vest', 'cable', 'registration', 'card'] as (keyof Checkliste)[]).map((key) => (
            <Toggle
              key={key}
              label={t(`checklist.${key}`)}
              checked={checklist[key]}
              onChange={(v) => setChecklist((prev) => ({ ...prev, [key]: v }))}
              trueLabel={t('common.yes')}
              falseLabel={t('common.no')}
            />
          ))}
        </div>
      </Card>
      </>
      )}

      {/* ── Step 5: Füllstände ── */}
      {step === 4 && (
      <>
      <SectionHeader title={t('annahme.section_levels')} />
      <Card className="space-y-5">
        <LevelSlider label={t('annahme.fuel_label')} value={fuel} onChange={setFuel} />
        <LevelSlider label={t('annahme.battery_label')} value={battery} onChange={setBattery} />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('annahme.odometer_label')}</label>
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
      </>
      )}

      {/* ── Step 6: Bemerkungen ── */}
      {step === 5 && (
      <>
      <SectionHeader title={t('annahme.section_remarks')} />
      <Card>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder={t('annahme.remarks_placeholder')}
          rows={3}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
        />
      </Card>
      </>
      )}

      {/* ── Step 7: Unterschrift + Spediteur ── */}
      {step === 6 && (
      <>
      <SectionHeader title={t('annahme.section_signature')} />
      <Card>
        <p className="text-xs text-gray-500 mb-3">
          {t('annahme.sig_disclaimer')}{' '}
          <a href="/datenschutz" className="text-brand-600 underline">
            {t('annahme.privacy_link')}
          </a>
        </p>
        <p className="text-xs text-gray-500 mb-2">
          {hasSig ? t('annahme.sig_has') : t('annahme.sig_none')}
        </p>
        <SignatureCanvas canvasRef={canvasRef} onHasStroke={setHasSig} />
      </Card>

      <SectionHeader title={t('annahme.section_carrier_sig')} />
      <Card>
        <button
          type="button"
          onClick={() => { setCarrierPresent(v => !v); setHasSigCarrier(false) }}
          className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 mb-3"
        >
          <span className="text-sm font-medium text-gray-700">{t('annahme.carrier_toggle')}</span>
          <span className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${carrierPresent ? 'bg-brand-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${carrierPresent ? 'translate-x-6' : 'translate-x-1'}`} />
          </span>
        </button>
        {carrierPresent ? (
          <>
            <p className="text-xs text-gray-500 mb-3">
              {t('annahme.carrier_disclaimer')}{' '}
              <a href="/datenschutz" className="text-brand-600 underline">
                {t('annahme.privacy_link')}
              </a>
            </p>
            {ed?.photos?.['signature_carrier'] && !hasSigCarrier && (
              <p className="text-xs text-amber-600 mb-2">{t('annahme.carrier_existing_sig')}</p>
            )}
            <SignatureCanvas canvasRef={canvasRefCarrier} onHasStroke={setHasSigCarrier} />
          </>
        ) : (
          <p className="text-xs text-gray-400 italic">{t('annahme.no_carrier')}</p>
        )}
      </Card>
      </>
      )}

      {/* ── Step navigation ── */}
      <div className="mx-4 mt-6 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={goBack}
            className="flex-1 py-4 rounded-2xl border border-gray-300 text-gray-700 font-semibold text-base flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} /> {t('common.back')}
          </button>
        )}
        {isLastStep ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-4 rounded-2xl bg-brand-600 text-white font-bold text-base shadow-lg disabled:opacity-60 active:bg-brand-700 flex items-center justify-center gap-2"
          >
            {saving ? t('annahme.saving') : navigator.onLine ? <><Save size={18} /> {t('annahme.save_online')}</> : <><CloudOff size={18} /> {t('annahme.save_offline')}</>}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 py-4 rounded-2xl bg-brand-600 text-white font-bold text-base shadow-lg active:bg-brand-700 flex items-center justify-center gap-2"
          >
            {t('common.next')} <ArrowRight size={18} />
          </button>
        )}
      </div>
      {isLastStep && !navigator.onLine && (
        <p className="text-xs text-center text-amber-600 mt-2">
          {t('annahme.offline_hint')}
        </p>
      )}
    </div>
  )
}
