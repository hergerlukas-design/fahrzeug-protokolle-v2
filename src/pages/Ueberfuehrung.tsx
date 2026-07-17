import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  X, Camera, Image, ArrowLeft, ArrowRight, Car, AlertTriangle,
  CheckCircle2, Save,
} from 'lucide-react'
import {
  DEFAULT_CHECKLISTE,
  DAMAGE_INTENSITIES,
  DAMAGE_TYPES,
  INSPECTION_CONDITIONS,
  saveOffline,
  saveProtocol,
  uploadProtocolPhoto,
  uploadSignature,
  type Checkliste,
  type DamageItem,
  type OfflineEntry,
  updateProtocol,
} from '../lib/protocols'
import { OFFLINE_SAVED_EVENT } from '../components/OfflineIndicator'
import PdfButton from '../components/PdfButton'
import CarDamageSelector from '../components/CarDamageSelector'
import SignatureCanvas from '../components/SignatureCanvas'
import type { PdfData } from '../lib/generatePdf'
import { updateVehicle, updateVehicleKnownDamages, type DamageRecord } from '../lib/vehicles'

// ─────────────────────────────────────────────────────────────────────────────
// Edit-mode data (passed via location.state when opening an existing protocol)
// ─────────────────────────────────────────────────────────────────────────────
export interface ProtocolEditData {
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
  receiver_name?: string
  transfer_type?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PrefillState {
  vehicle_id: string
  license_plate: string
  brand_model: string
  vin: string
  known_damages: DamageRecord[]
  edit?: ProtocolEditData
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
        className="w-full accent-green-600"
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
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">{t('annahme.damage_type_placeholder')}</option>
          {DAMAGE_TYPES.map((dt) => (
            <option key={dt} value={dt}>{t(`damage.types.${dt}`, { defaultValue: dt })}</option>
          ))}
        </select>
        <select
          value={item.int}
          onChange={(e) => onUpdate(item.key, { int: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
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
              className="flex items-center gap-1.5 text-sm text-green-600 border border-green-200 rounded-lg px-3 py-2 bg-green-50 active:bg-green-100"
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

export default function Ueberfuehrung() {
  const loc = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const prefill = (loc.state as PrefillState) ?? null

  const sessionKey = useRef(Date.now().toString())

  // ── Form state ─────────────────────────────────────────────────────────────
  const ed = prefill?.edit
  const [fahrer, setFahrer] = useState(ed?.inspector_name ?? '')
  const [abholort, setAbholort] = useState(() => {
    const loc = ed?.location ?? ''
    return loc.includes(' → ') ? loc.split(' → ')[0] : loc
  })
  const [zielort, setZielort] = useState(() => {
    const loc = ed?.location ?? ''
    return loc.includes(' → ') ? (loc.split(' → ')[1] ?? '') : ''
  })
  const [vin, setVin] = useState(prefill?.vin ?? '')
  const [transferType, setTransferType] = useState<string>(ed?.transfer_type ?? 'Hinbringen')
  const [conditions, setConditions] = useState<string[]>(ed?.conditions ?? [])
  const [fuel, setFuel] = useState(ed?.fuel ?? 100)
  const [battery, setBattery] = useState(ed?.battery ?? 100)
  const [odometer, setOdometer] = useState(ed?.odometer ?? 0)
  const [remarks, setRemarks] = useState(ed?.remarks ?? '')
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

  // Existing photo URLs from edit mode (kept if no new file is uploaded for that slot)
  const [existingPhotos, setExistingPhotos] = useState<Partial<Record<PhotoKey, string>>>(() => {
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
  const canvasRefReceiver = useRef<HTMLCanvasElement>(null)
  const [hasSigReceiver, setHasSigReceiver] = useState(false)
  const [receiverName, setReceiverName] = useState(ed?.receiver_name ?? '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [savedPdfData, setSavedPdfData] = useState<PdfData | null>(null)

  // ── Step wizard ────────────────────────────────────────────────────────────
  const [step, setStep] = useState(0)
  const stepTitles = [
    `${t('ueberfuehrung.section_vehicle')} & ${t('ueberfuehrung.section_driver_route')}`,
    t('ueberfuehrung.section_vehicle_state'),
    t('ueberfuehrung.section_photos'),
    t('ueberfuehrung.section_damages'),
    `${t('ueberfuehrung.section_conditions')} & ${t('ueberfuehrung.section_checklist')}`,
    t('ueberfuehrung.section_remarks'),
    `${t('ueberfuehrung.section_driver_sig')} & ${t('ueberfuehrung.section_receiver')}`,
  ]
  const totalSteps = stepTitles.length
  const isLastStep = step === totalSteps - 1

  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 })
  }, [step])

  function goNext() {
    if (step === 0 && !fahrer.trim()) {
      setError(t('ueberfuehrung.creator_required'))
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
      setError(t('ueberfuehrung.no_vehicle_error'))
      return
    }
    if (!fahrer.trim()) {
      setError(t('ueberfuehrung.creator_required'))
      return
    }
    setSaving(true)
    setError(null)

    const damageRecords: DamageItem[] = damages
      .filter((d) => d.pos || d.type || d.int)
      .map(({ pos, type, int }) => ({ pos, type, int }))

    const sigDataUrl =
      hasSig && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null
    const sigReceiverDataUrl =
      hasSigReceiver && canvasRefReceiver.current ? canvasRefReceiver.current.toDataURL('image/png') : null

    // location field stores "Abholort → Zielort" for transfer protocols
    const locationString = [abholort.trim(), zielort.trim()].filter(Boolean).join(' → ')

    const basePayload = {
      vehicle_id: prefill.vehicle_id,
      inspector_name: fahrer.trim(),
      location: locationString,
      odometer,
      fuel_level: fuel,
      remarks: remarks.trim(),
      inspection_date: new Date().toISOString(),
      status: (sigDataUrl && sigReceiverDataUrl ? 'final' : 'draft') as 'final' | 'draft',
      protocol_type: 'transfer' as const,
      condition_data: {
        battery,
        photos: {} as Record<string, string>,
        conditions,
        damage_records: damageRecords,
        checkliste: checklist,
        receiver_name: receiverName.trim() || undefined,
        transfer_type: transferType || undefined,
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
        if (sigReceiverDataUrl) {
          photos.signature_receiver = await uploadSignature(
            prefill.vehicle_id,
            sessionKey.current,
            sigReceiverDataUrl,
            'signature_receiver'
          )
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
        let signatureReceiverBlob: Blob | undefined
        if (sigReceiverDataUrl) {
          signatureReceiverBlob = await (await fetch(sigReceiverDataUrl)).blob()
        }
        const offlineEntry: OfflineEntry = {
          createdAt: new Date().toISOString(),
          vehicleId: prefill.vehicle_id,
          sessionKey: sessionKey.current,
          payload: basePayload,
          photoBlobs,
          signatureBlob,
          signatureReceiverBlob,
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
        if (sigReceiverDataUrl) localPhotos.signature_receiver = sigReceiverDataUrl
        basePayload.condition_data.photos = localPhotos
      }
      setSavedPdfData({
        protocol_type: 'transfer',
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
        receiver_name: receiverName.trim() || undefined,
        transfer_type: transferType || undefined,
      })
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('ueberfuehrung.save_error'))
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setSuccess(false)
    setFahrer('')
    setAbholort('')
    setZielort('')
    setConditions([])
    setFuel(100)
    setBattery(100)
    setOdometer(0)
    setRemarks('')
    setChecklist({ ...DEFAULT_CHECKLISTE })
    setDamages([])
    setVehiclePhotos({})
    setExistingPhotos({})
    setHasSig(false)
    setHasSigReceiver(false)
    setReceiverName('')
    sessionKey.current = Date.now().toString()
    setStep(0)
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 gap-6 text-center">
        <CheckCircle2 size={64} className="text-green-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{t('ueberfuehrung.success_title')}</h1>
          <p className="text-sm text-gray-500">
            {navigator.onLine ? t('ueberfuehrung.success_online') : t('ueberfuehrung.success_offline')}
          </p>
        </div>
        {savedPdfData && <PdfButton data={savedPdfData} accent="green" />}
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={resetForm}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
          >
            {t('ueberfuehrung.another_protocol')}
          </button>
          <button
            onClick={() => navigate('/fahrzeuge')}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm"
          >
            {t('ueberfuehrung.to_overview')}
          </button>
        </div>
      </div>
    )
  }

  // ── No prefill ─────────────────────────────────────────────────────────────
  if (!prefill) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full px-6 gap-4 text-center">
        <Car size={48} className="text-gray-300" />
        <div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">{t('ueberfuehrung.no_vehicle_error')}</h1>
        </div>
        <button
          onClick={() => navigate('/fahrzeuge')}
          className="py-3 px-6 rounded-xl bg-green-600 text-white font-semibold text-sm"
        >
          {t('ueberfuehrung.to_overview')}
        </button>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="block min-h-full bg-gray-50 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))]">
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
              <Car size={16} className="text-gray-400 flex-shrink-0" /> {ed ? t('ueberfuehrung.edit_title') : t('ueberfuehrung.title')}
            </h1>
            <p className="text-xs text-gray-500 truncate">{prefill.license_plate}</p>
          </div>
          <span className="text-xs font-medium text-gray-400 flex-shrink-0">
            {t('common.step_of', { current: step + 1, total: totalSteps })}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-600 rounded-full transition-all duration-300"
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

      {/* ── Step 1: Fahrzeugdaten + Art der Überführung + Fahrer & Route ── */}
      {step === 0 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_vehicle')} />
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

      {/* ── 2. Art der Überführung ── */}
      <SectionHeader title={t('ueberfuehrung.section_transfer_type')} />
      <Card>
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'Hinbringen', label: t('ueberfuehrung.transfer_hinbringen') },
            { value: 'Rücknahme', label: t('ueberfuehrung.transfer_rucknahme') },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTransferType(value)}
              className={`flex-1 min-w-[7rem] py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                transferType === value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* ── 3. Fahrer & Route ── */}
      <SectionHeader title={t('ueberfuehrung.section_driver_route')} />
      <Card className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('ueberfuehrung.fahrer_label')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={fahrer}
            onChange={(e) => setFahrer(e.target.value)}
            placeholder={t('ueberfuehrung.fahrer_placeholder')}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ueberfuehrung.abholort_label')}</label>
          <input
            type="text"
            value={abholort}
            onChange={(e) => setAbholort(e.target.value)}
            placeholder={t('ueberfuehrung.abholort_placeholder')}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ueberfuehrung.zielort_label')}</label>
          <input
            type="text"
            value={zielort}
            onChange={(e) => setZielort(e.target.value)}
            placeholder={t('ueberfuehrung.zielort_placeholder')}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ueberfuehrung.date_label')}</label>
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

      {/* ── Step 2: Fahrzeugzustand ── */}
      {step === 1 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_vehicle_state')} />
      <Card className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ueberfuehrung.odometer_label')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={odometer}
            onChange={(e) => setOdometer(Number(e.target.value))}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <LevelSlider label={t('ueberfuehrung.fuel_label')} value={fuel} onChange={setFuel} />
        <LevelSlider label={t('ueberfuehrung.battery_label')} value={battery} onChange={setBattery} />
      </Card>
      </>
      )}

      {/* ── Step 3: Fahrzeugfotos ── */}
      {step === 2 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_photos')} />
      <Card>
        <div className="grid grid-cols-3 gap-3">
          {PHOTO_KEYS.map((pk) => {
            const entry = vehiclePhotos[pk]
            const existingUrl = existingPhotos[pk]
            const previewSrc = entry?.previewUrl ?? existingUrl ?? null
            const pkLabel = t(`photo_labels.${pk}`, { defaultValue: PHOTO_LABELS[pk] })
            return (
              <div key={pk} className="flex flex-col items-center gap-1">
                {previewSrc ? (
                  <div className="relative w-full aspect-square">
                    <img
                      src={previewSrc}
                      alt={pkLabel}
                      className="w-full h-full object-cover rounded-xl border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (entry) {
                          URL.revokeObjectURL(entry.previewUrl)
                          setVehiclePhotos((prev) => { const next = { ...prev }; delete next[pk]; return next })
                        } else {
                          setExistingPhotos((prev) => { const next = { ...prev }; delete next[pk]; return next })
                        }
                      }}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPhotoPickerKey(pk)}
                    className="w-full aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 bg-gray-50 active:bg-gray-100"
                  >
                    <Camera size={24} className="text-gray-300" />
                    <span className="text-xs text-gray-500">{pkLabel}</span>
                  </button>
                )}
                <input ref={photoFileRefs.current[pk]} type="file" accept="image/*" className="hidden" onChange={(e) => { handleVehiclePhotoChange(pk, e); e.target.value = '' }} />
                <input ref={cameraPhotoFileRefs.current[pk]} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleVehiclePhotoChange(pk, e); e.target.value = '' }} />
                {previewSrc && (
                  <span className="text-xs text-gray-500">{pkLabel}</span>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {photoPickerKey && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setPhotoPickerKey(null)}>
          <div className="w-full bg-white rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-gray-700 text-center mb-3">
              {t('annahme.photo_picker_label', { label: t(`photo_labels.${photoPickerKey}`, { defaultValue: PHOTO_LABELS[photoPickerKey] }) })}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { const k = photoPickerKey; setPhotoPickerKey(null); cameraPhotoFileRefs.current[k].current?.click() }}
                className="py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 font-medium text-sm active:bg-green-100 flex items-center justify-center gap-1.5"
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

      {/* ── Step 4: Schäden ── */}
      {step === 3 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_damages')} />
      <Card className="space-y-3">
        {damages.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">{t('ueberfuehrung.no_damages')}</p>
        )}
        {damages.map((item, i) => (
          <DamageRow
            key={item.key}
            item={item}
            index={i}
            onUpdate={updateDamage}
            onRemove={removeDamage}
          />
        ))}
        <button
          type="button"
          onClick={addDamage}
          className="w-full py-3 rounded-xl border-2 border-dashed border-green-300 text-green-600 font-medium text-sm active:bg-green-50"
        >
          {t('ueberfuehrung.add_damage')}
        </button>
      </Card>
      </>
      )}

      {/* ── Step 5: Sichtbedingungen + Checkliste ── */}
      {step === 4 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_conditions')} />
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
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
            >
              {t(`conditions.${c}`, { defaultValue: c })}
            </button>
          ))}
        </div>
      </Card>

      <SectionHeader title={t('ueberfuehrung.section_checklist')} />
      <Card className="space-y-2">
        <p className="text-xs text-gray-500 mb-1">{t('ueberfuehrung.checklist_interior')}</p>
        {(['floor', 'seats', 'entry', 'instruments', 'trunk', 'engine'] as (keyof Checkliste)[]).map((key) => (
          <Toggle key={key} label={t(`checklist.${key}`)} checked={checklist[key]} onChange={(v) => setChecklist((p) => ({ ...p, [key]: v }))} trueLabel={t('common.clean')} falseLabel={t('common.dirty')} />
        ))}
        <p className="text-xs text-gray-500 pt-2">{t('ueberfuehrung.checklist_equipment')}</p>
        {(['aid_kit', 'triangle', 'vest', 'cable', 'registration', 'card'] as (keyof Checkliste)[]).map((key) => (
          <Toggle key={key} label={t(`checklist.${key}`)} checked={checklist[key]} onChange={(v) => setChecklist((p) => ({ ...p, [key]: v }))} trueLabel={t('common.yes')} falseLabel={t('common.no')} />
        ))}
      </Card>
      </>
      )}

      {/* ── Step 6: Bemerkungen ── */}
      {step === 5 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_remarks')} />
      <Card>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder={t('ueberfuehrung.remarks_placeholder')}
          rows={3}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
        />
      </Card>
      </>
      )}

      {/* ── Step 7: Unterschrift Fahrer + Übernahme Empfänger ── */}
      {step === 6 && (
      <>
      <SectionHeader title={t('ueberfuehrung.section_driver_sig')} />
      <Card>
        <p className="text-xs text-gray-500 mb-3">
          {t('ueberfuehrung.sig_disclaimer')}{' '}
          <a href="/datenschutz" className="text-green-600 underline">
            {t('ueberfuehrung.privacy_link')}
          </a>
        </p>
        <p className="text-xs text-gray-500 mb-2">{t('ueberfuehrung.sig_creator_hint')}</p>
        <SignatureCanvas canvasRef={canvasRef} onHasStroke={setHasSig} />
      </Card>

      {/* ── 11. Übernahme durch Empfänger ── */}
      <SectionHeader title={t('ueberfuehrung.section_receiver')} />
      <Card className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('ueberfuehrung.receiver_name_label')} <span className="text-gray-400 font-normal">({t('annahme.section_carrier_sig').split('(')[1]?.replace(')', '') ?? 'optional'})</span>
          </label>
          <input
            type="text"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            placeholder={t('ueberfuehrung.receiver_placeholder')}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <p className="text-xs text-gray-500 mb-1">
          {t('ueberfuehrung.sig_disclaimer')}{' '}
          <a href="/datenschutz" className="text-green-600 underline">
            {t('ueberfuehrung.privacy_link')}
          </a>
        </p>
        <p className="text-xs text-gray-500">{t('ueberfuehrung.receiver_sig_hint')}</p>
        <SignatureCanvas canvasRef={canvasRefReceiver} onHasStroke={setHasSigReceiver} />
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
            className="flex-1 py-4 rounded-2xl bg-green-600 text-white font-bold text-base active:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving
              ? t('ueberfuehrung.saving')
              : hasSig && hasSigReceiver
              ? <><CheckCircle2 size={18} /> {t('ueberfuehrung.save_final')}</>
              : <><Save size={18} /> {t('ueberfuehrung.save_draft')}</>}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="flex-1 py-4 rounded-2xl bg-green-600 text-white font-bold text-base shadow-lg active:bg-green-700 flex items-center justify-center gap-2"
          >
            {t('common.next')} <ArrowRight size={18} />
          </button>
        )}
      </div>
      {isLastStep && !(hasSig && hasSigReceiver) && (
        <p className="text-xs text-gray-400 text-center mt-2">
          {t('ueberfuehrung.no_sig_hint')}
        </p>
      )}
    </div>
  )
}
