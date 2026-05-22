import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createProject,
  checkProjectNameSimilar,
  PROJECT_COLORS,
  type Project,
} from '../lib/projects'
import { fetchVehicles, createVehicle, getVehiclePhotoUrl, type Vehicle } from '../lib/vehicles'

export const CREATE_EVENT = 'vp-open-create'

type Step = 'root' | 'protokoll' | 'new-vehicle' | 'existing-vehicle' | 'projekt'

function VehicleAvatar({ vehicleId, size = 40 }: { vehicleId: string; size?: number }) {
  const [hasPhoto, setHasPhoto] = useState(true)
  const url = getVehiclePhotoUrl(vehicleId)
  if (!hasPhoto) {
    return (
      <div
        className="rounded-lg bg-gray-100 flex items-center justify-center text-xl flex-shrink-0"
        style={{ width: size, height: size }}
      >
        🚗
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className="rounded-lg object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      onError={() => setHasPhoto(false)}
    />
  )
}

function RootStep({
  onProtokoll,
  onProjekt,
  onClose,
}: {
  onProtokoll: () => void
  onProjekt: () => void
  onClose: () => void
}) {
  return (
    <div className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">Erstellen</h2>
        <button onClick={onClose} className="text-gray-400 text-2xl leading-none px-1">×</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onProtokoll}
          className="flex flex-col items-center gap-3 rounded-2xl bg-brand-50 border-2 border-brand-200 px-4 py-6 active:bg-brand-100 active:scale-95 transition-transform"
        >
          <span className="text-4xl">📋</span>
          <div className="text-center">
            <p className="font-bold text-brand-800 text-base">Protokoll</p>
            <p className="text-xs text-brand-600 mt-0.5 leading-tight">Für bestehendes oder neues Fahrzeug</p>
          </div>
        </button>
        <button
          onClick={onProjekt}
          className="flex flex-col items-center gap-3 rounded-2xl bg-green-50 border-2 border-green-200 px-4 py-6 active:bg-green-100 active:scale-95 transition-transform"
        >
          <span className="text-4xl">📁</span>
          <div className="text-center">
            <p className="font-bold text-green-800 text-base">Projekt</p>
            <p className="text-xs text-green-600 mt-0.5 leading-tight">Neuen Projektordner anlegen</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function ProtokollStep({
  onNew,
  onExisting,
  onBack,
}: {
  onNew: () => void
  onExisting: () => void
  onBack: () => void
}) {
  return (
    <div className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onBack} className="text-brand-600 text-sm font-medium">← Zurück</button>
        <h2 className="text-lg font-bold text-gray-900 flex-1">Protokoll erstellen</h2>
      </div>
      <div className="space-y-3">
        <button
          onClick={onExisting}
          className="w-full flex items-center gap-4 rounded-2xl bg-brand-50 border-2 border-brand-200 px-4 py-5 active:bg-brand-100 text-left"
        >
          <span className="text-3xl">🔍</span>
          <div>
            <p className="font-bold text-brand-800">Bestehendes Fahrzeug</p>
            <p className="text-sm text-brand-600 mt-0.5">Kennzeichen suchen &amp; Überführung starten</p>
          </div>
        </button>
        <button
          onClick={onNew}
          className="w-full flex items-center gap-4 rounded-2xl bg-gray-50 border-2 border-gray-200 px-4 py-5 active:bg-gray-100 text-left"
        >
          <span className="text-3xl">🚗</span>
          <div>
            <p className="font-bold text-gray-800">Neues Fahrzeug</p>
            <p className="text-sm text-gray-500 mt-0.5">Fahrzeug anlegen &amp; Annahmeprotokoll starten</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function NewVehicleStep({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [plate, setPlate] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plate.trim()) { setError('Kennzeichen ist Pflichtfeld.'); return }
    setSaving(true)
    setError(null)
    try {
      const saved = await createVehicle({ license_plate: plate.trim(), brand_model: brandModel.trim(), vin: '' })
      onClose()
      navigate('/annahme', {
        state: {
          vehicle_id: saved.id,
          license_plate: saved.license_plate,
          brand_model: saved.brand_model ?? '',
          vin: saved.vin ?? '',
          known_damages: [],
        },
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Anlegen.')
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onBack} className="text-brand-600 text-sm font-medium">← Zurück</button>
        <h2 className="text-lg font-bold text-gray-900 flex-1">Neues Fahrzeug</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">⚠️ {error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Kennzeichen <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="M-AB 1234"
            autoCapitalize="characters"
            autoFocus
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 uppercase"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Marke / Modell <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={brandModel}
            onChange={(e) => setBrandModel(e.target.value)}
            placeholder="BMW 3er, VW Golf …"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
          >
            Zurück
          </button>
          <button
            type="submit"
            disabled={saving}
            className="py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm disabled:opacity-60"
          >
            {saving ? 'Legt an …' : 'Anlegen & Protokoll →'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ExistingVehicleStep({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Vehicle | null>(null)

  useEffect(() => {
    fetchVehicles()
      .then(setVehicles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const upper = search.toUpperCase()
  const filtered = upper
    ? vehicles.filter(
        (v) =>
          v.license_plate.toUpperCase().includes(upper) ||
          (v.brand_model ?? '').toUpperCase().includes(upper)
      )
    : vehicles

  function handleGo(v: Vehicle) {
    onClose()
    navigate('/ueberfuehrung', {
      state: {
        vehicle_id: v.id,
        license_plate: v.license_plate,
        brand_model: v.brand_model ?? '',
        vin: v.vin ?? '',
        known_damages: v.known_damages ?? [],
      },
    })
  }

  return (
    <>
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="text-brand-600 text-sm font-medium">← Zurück</button>
          <h2 className="text-lg font-bold text-gray-900 flex-1">Fahrzeug suchen</h2>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
          placeholder="🔍 Kennzeichen, Marke …"
          autoFocus
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <p className="text-center text-gray-400 text-sm mt-6 pb-4">Lädt …</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm mt-6 pb-4">Keine Treffer.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => setSelected(v)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    selected?.id === v.id ? 'bg-brand-50' : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                >
                  <VehicleAvatar vehicleId={v.id} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{v.license_plate}</p>
                    <p className="text-sm text-gray-500 truncate">{v.brand_model || '—'}</p>
                  </div>
                  {selected?.id === v.id && <span className="text-brand-600 text-lg">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-2 bg-white">
          <button
            onClick={() => handleGo(selected)}
            className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold text-sm"
          >
            🚙 Überführung für {selected.license_plate} starten →
          </button>
        </div>
      )}

      <div className="flex-shrink-0 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-2 bg-white">
        <button
          onClick={onBack}
          className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm"
        >
          Zurück
        </button>
      </div>
    </>
  )
}

function ProjektStep({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<Project[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(val: string) {
    setName(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSimilar([]); return }
    debounceRef.current = setTimeout(async () => {
      try { setSimilar(await checkProjectNameSimilar(val)) } catch { /* silent */ }
    }, 300)
  }

  const exactDuplicate = similar.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name ist Pflichtfeld.'); return }
    if (exactDuplicate) { setError('Ein Projekt mit diesem Namen existiert bereits.'); return }
    setSaving(true)
    setError(null)
    try {
      await createProject({ name, description, color: color || undefined })
      onClose()
      navigate('/fahrzeuge')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onBack} className="text-brand-600 text-sm font-medium">← Zurück</button>
        <h2 className="text-lg font-bold text-gray-900 flex-1">Neues Projekt</h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">⚠️ {error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="z.B. Audi, IAA, LYNK …"
            autoFocus
            className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${
              exactDuplicate ? 'border-red-400 bg-red-50' : 'border-gray-300'
            }`}
          />
          {similar.length > 0 && (
            <p className="text-xs text-amber-600 mt-1">
              ⚠️ Ähnliche Projekte: {similar.map((p) => p.name).join(', ')}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Beschreibung <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kurzbeschreibung …"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Farbe <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setColor('')}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs ${!color ? 'border-gray-800' : 'border-gray-300'} bg-gray-100`}
            >
              ✕
            </button>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-gray-800 scale-110' : 'border-transparent'} transition-transform`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
          >
            Zurück
          </button>
          <button
            type="submit"
            disabled={saving || exactDuplicate}
            className="py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm disabled:opacity-60"
          >
            {saving ? 'Speichert …' : 'Erstellen'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function CreateWizard() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('root')

  useEffect(() => {
    function handler() { setOpen(true); setStep('root') }
    window.addEventListener(CREATE_EVENT, handler)
    return () => window.removeEventListener(CREATE_EVENT, handler)
  }, [])

  function handleClose() { setOpen(false); setStep('root') }

  if (!open) return null

  const isScrollable = step === 'existing-vehicle'

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={handleClose} />
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl ${
          isScrollable ? 'max-h-[90dvh] flex flex-col' : ''
        }`}
      >
        <div className="flex justify-center pt-3 pb-3 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {step === 'root' && (
          <RootStep
            onProtokoll={() => setStep('protokoll')}
            onProjekt={() => setStep('projekt')}
            onClose={handleClose}
          />
        )}
        {step === 'protokoll' && (
          <ProtokollStep
            onNew={() => setStep('new-vehicle')}
            onExisting={() => setStep('existing-vehicle')}
            onBack={() => setStep('root')}
          />
        )}
        {step === 'new-vehicle' && (
          <NewVehicleStep onBack={() => setStep('protokoll')} onClose={handleClose} />
        )}
        {step === 'existing-vehicle' && (
          <ExistingVehicleStep onBack={() => setStep('protokoll')} onClose={handleClose} />
        )}
        {step === 'projekt' && (
          <ProjektStep onBack={() => setStep('root')} onClose={handleClose} />
        )}
      </div>
    </>
  )
}
