import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SkeletonList } from '../components/Skeleton'
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  uploadVehiclePhoto,
  getVehiclePhotoUrl,
  normalizeKennzeichen,
  type Vehicle,
} from '../lib/vehicles'

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────


function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 items-start">
      <span className="text-red-500 mt-0.5">⚠️</span>
      <p className="text-red-700 text-sm flex-1">{msg}</p>
      <button onClick={onClose} className="text-red-400 text-lg leading-none">×</button>
    </div>
  )
}

function VehicleAvatar({ vehicleId, size = 48 }: { vehicleId: number; size?: number }) {
  const [hasPhoto, setHasPhoto] = useState(true)
  const url = getVehiclePhotoUrl(vehicleId)
  if (!hasPhoto) {
    return (
      <div
        className="rounded-lg bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0"
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

// ─────────────────────────────────────────────────────────────────────────────
// New vehicle + protocol flow (bottom sheet)
// ─────────────────────────────────────────────────────────────────────────────

function NewVehicleFlow({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
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
      const saved = await createVehicle({
        license_plate: plate.trim(),
        brand_model: brandModel.trim(),
        vin: '',
      })
      onCreated()
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
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[85dvh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <form onSubmit={handleSubmit} className="px-4 pb-8 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mt-1">Neues Fahrzeug & Protokoll</h2>
          <p className="text-sm text-gray-500">Fahrzeug anlegen und direkt zum Annahmeprotokoll.</p>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ⚠️ {error}
            </div>
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
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase"
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
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-60"
            >
              {saving ? 'Legt an …' : 'Anlegen & Protokoll →'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing vehicle → choose protocol type flow (bottom sheet)
// ─────────────────────────────────────────────────────────────────────────────

function ExistingVehicleFlow({
  vehicles,
  onCancel,
}: {
  vehicles: Vehicle[]
  onCancel: () => void
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [protocolType, setProtocolType] = useState<'transfer' | 'intake'>('transfer')

  const upper = search.toUpperCase()
  const filtered = upper
    ? vehicles.filter(
        (v) =>
          v.license_plate.toUpperCase().includes(upper) ||
          (v.brand_model ?? '').toUpperCase().includes(upper)
      )
    : vehicles

  function handleGo() {
    if (!selected) return
    const state = {
      vehicle_id: selected.id,
      license_plate: selected.license_plate,
      brand_model: selected.brand_model ?? '',
      vin: selected.vin ?? '',
      known_damages: selected.known_damages ?? [],
    }
    navigate(protocolType === 'transfer' ? '/ueberfuehrung' : '/annahme', { state })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[90dvh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-4 pb-3 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 mt-1 mb-3">
            Protokoll für bestehendes Fahrzeug
          </h2>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
            placeholder="🔍 Kennzeichen, Marke …"
            autoFocus
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm mt-8">Keine Treffer.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelected(v)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selected?.id === v.id
                        ? 'bg-blue-50'
                        : 'hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    <VehicleAvatar vehicleId={v.id} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{v.license_plate}</p>
                      <p className="text-sm text-gray-500 truncate">{v.brand_model || '—'}</p>
                    </div>
                    {selected?.id === v.id && (
                      <span className="text-blue-600 text-lg">✓</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3 pb-2 bg-white space-y-3">
            <p className="text-sm font-medium text-gray-700">
              Protokolltyp für <strong>{selected.license_plate}</strong>:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setProtocolType('transfer')}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  protocolType === 'transfer'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                🚙 Überführung
              </button>
              <button
                onClick={() => setProtocolType('intake')}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  protocolType === 'intake'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                📝 Annahme
              </button>
            </div>
            <button
              onClick={handleGo}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm"
            >
              Weiter zum Protokoll →
            </button>
          </div>
        )}

        <div className="flex-shrink-0 px-4 pb-6 pt-2 bg-white">
          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle list
// ─────────────────────────────────────────────────────────────────────────────

function VehicleList({
  vehicles,
  search,
  onSearchChange,
  onSelect,
  onNew,
  onNewWithProtocol,
  onExistingProtocol,
}: {
  vehicles: Vehicle[]
  search: string
  onSearchChange: (v: string) => void
  onSelect: (v: Vehicle) => void
  onNew: () => void
  onNewWithProtocol: () => void
  onExistingProtocol: () => void
}) {
  const upper = search.toUpperCase()
  const filtered = upper
    ? vehicles.filter(
        (v) =>
          v.license_plate.toUpperCase().includes(upper) ||
          (v.brand_model ?? '').toUpperCase().includes(upper) ||
          (v.vin ?? '').toUpperCase().includes(upper)
      )
    : vehicles

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900 mb-3">🚗 Fahrzeuge</h1>
        {/* Protocol entry buttons */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={onNewWithProtocol}
            className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-blue-600 text-white text-center active:bg-blue-700 shadow-sm"
          >
            <span className="text-xl leading-none">➕</span>
            <span className="text-xs font-semibold leading-tight">Neues Fahrzeug<br />& Protokoll</span>
          </button>
          <button
            onClick={onExistingProtocol}
            className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-green-600 text-white text-center active:bg-green-700 shadow-sm"
          >
            <span className="text-xl leading-none">🚙</span>
            <span className="text-xs font-semibold leading-tight">Protokoll für<br />bestehendes Fzg.</span>
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="🔍 Kennzeichen, Marke, FIN …"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm mt-12">
            {search ? 'Keine Treffer.' : 'Noch keine Fahrzeuge vorhanden.'}
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-400 px-4 pt-3 pb-1">
              {filtered.length} Fahrzeug{filtered.length !== 1 ? 'e' : ''}
            </p>
            <ul className="divide-y divide-gray-100">
              {filtered.map((v) => {
                const protos = v.protocols ?? []
                const drafts = protos.filter((p) => p.status === 'draft').length
                const last = protos.length
                  ? protos.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
                      .created_at
                  : null
                return (
                  <li key={v.id}>
                    <button
                      onClick={() => onSelect(v)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 text-left"
                    >
                      <VehicleAvatar vehicleId={v.id} size={48} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{v.license_plate}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {v.brand_model || <span className="italic text-gray-300">Marke unbekannt</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
                          {drafts > 0 && (
                            <span className="ml-1 text-amber-500">· {drafts} Entwurf</span>
                          )}
                          {last && (
                            <span className="ml-1">· {last.slice(0, 10)}</span>
                          )}
                        </p>
                      </div>
                      <span className="text-gray-300 text-lg">›</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={onNew}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full bg-blue-600 text-white text-2xl shadow-lg flex items-center justify-center active:bg-blue-700 z-20"
        aria-label="Fahrzeug anlegen"
      >
        +
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle detail
// ─────────────────────────────────────────────────────────────────────────────

function VehicleDetail({
  vehicle,
  onBack,
  onEdit,
  onDelete,
}: {
  vehicle: Vehicle
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const protos = (vehicle.protocols ?? []).slice().sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )
  const damages = vehicle.known_damages ?? []

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={onBack} className="text-blue-600 text-sm font-medium pr-1">
          ← Zurück
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1 truncate">{vehicle.license_plate}</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Vehicle card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex gap-4">
          <VehicleAvatar vehicleId={vehicle.id} size={72} />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-lg">{vehicle.license_plate}</p>
            <p className="text-gray-600 text-sm">{vehicle.brand_model || '—'}</p>
            <p className="text-gray-400 text-xs mt-1">
              FIN: {vehicle.vin || '—'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              navigate('/annahme', {
                state: {
                  vehicle_id: vehicle.id,
                  license_plate: vehicle.license_plate,
                  brand_model: vehicle.brand_model ?? '',
                  vin: vehicle.vin ?? '',
                  known_damages: vehicle.known_damages ?? [],
                },
              })
            }
            className="py-3 rounded-xl bg-blue-50 text-blue-700 font-medium text-sm active:bg-blue-100"
          >
            📝 Neues Annahmeprotokoll
          </button>
          <button
            onClick={() =>
              navigate('/ueberfuehrung', {
                state: {
                  vehicle_id: vehicle.id,
                  license_plate: vehicle.license_plate,
                  brand_model: vehicle.brand_model ?? '',
                  vin: vehicle.vin ?? '',
                  known_damages: vehicle.known_damages ?? [],
                },
              })
            }
            className="py-3 rounded-xl bg-green-50 text-green-700 font-medium text-sm active:bg-green-100"
          >
            🚙 Neues Überführungsprotokoll
          </button>
        </div>

        {/* Known damages */}
        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <summary className="px-4 py-3 font-medium text-gray-800 cursor-pointer select-none flex items-center justify-between">
            <span>🔧 Bekannte Vorschäden ({damages.length})</span>
            <span className="text-gray-400 text-xs">details</span>
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {damages.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Keine dauerhaften Vorschäden hinterlegt.</p>
            ) : (
              damages.map((d, i) => (
                <div
                  key={i}
                  className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-gray-700"
                >
                  📍 {d.pos} · 🛠️ {d.type} · ⚠️ {d.int}
                </div>
              ))
            )}
          </div>
        </details>

        {/* Protocols */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Protokolle ({protos.length})
          </h2>
          {protos.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-4">
              Noch keine Protokolle für dieses Fahrzeug.
            </p>
          ) : (
            <ul className="space-y-2">
              {protos.map((p) => {
                const isTransfer = p.protocol_type === 'transfer'
                const isDraft = p.status === 'draft'
                return (
                  <li
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-start gap-3"
                  >
                    <span className="text-lg mt-0.5">{isTransfer ? '🔄' : '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {p.created_at.slice(0, 10)}
                        {isDraft && (
                          <span className="ml-2 text-xs text-amber-600 font-normal">⚠️ Entwurf</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {isTransfer ? 'Überführung' : 'Annahme'}
                        {p.inspector_name ? ` · ${p.inspector_name}` : ''}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Edit / Delete */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={onEdit}
            className="py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm active:bg-gray-200"
          >
            ✏️ Bearbeiten
          </button>
          <button
            onClick={onDelete}
            className="py-3 rounded-xl bg-red-50 text-red-600 font-medium text-sm active:bg-red-100"
          >
            🗑️ Löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle form (add / edit) — slides up as a bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function VehicleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Vehicle | null
  onSave: (v: Vehicle) => void
  onCancel: () => void
}) {
  const [plate, setPlate] = useState(initial?.license_plate ?? '')
  const [brandModel, setBrandModel] = useState(initial?.brand_model ?? '')
  const [vin, setVin] = useState(initial?.vin ?? '')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setPhotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plate.trim()) {
      setError('Kennzeichen ist Pflichtfeld.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      let saved: Vehicle
      if (initial) {
        saved = await updateVehicle(initial.id, {
          license_plate: plate.trim(),
          brand_model: brandModel.trim(),
          vin: vin.trim().toUpperCase(),
        })
      } else {
        saved = await createVehicle({
          license_plate: plate.trim(),
          brand_model: brandModel.trim(),
          vin: vin.trim().toUpperCase(),
        })
      }
      if (photoFile) {
        try {
          await uploadVehiclePhoto(saved.id, photoFile)
        } catch {
          // Photo upload failed — vehicle is still saved, just no photo
        }
      }
      onSave(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
      setSaving(false)
    }
  }

  const normalized = normalizeKennzeichen(plate)
  const plateWarning = plate && normalized.length > 0 && normalized.length < 5
    ? `Kennzeichen ist sehr kurz (${normalized.length} Zeichen). Bitte prüfen.`
    : null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <form onSubmit={handleSubmit} className="px-4 pb-8 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mt-1 mb-4">
            {initial ? 'Fahrzeug bearbeiten' : 'Fahrzeug anlegen'}
          </h2>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ⚠️ {error}
            </div>
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
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase"
              required
            />
            {plateWarning && (
              <p className="text-xs text-amber-600 mt-1">⚠️ {plateWarning}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marke / Modell</label>
            <input
              type="text"
              value={brandModel}
              onChange={(e) => setBrandModel(e.target.value)}
              placeholder="BMW 3er, VW Golf …"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">FIN / VIN</label>
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="17-stellige Fahrzeugidentnummer"
              autoCapitalize="characters"
              maxLength={17}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 uppercase font-mono tracking-wider"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fahrzeugfoto <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            {photoPreview ? (
              <div className="relative inline-block">
                <img src={photoPreview} alt="Vorschau" className="w-32 h-32 object-cover rounded-xl border border-gray-200" />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                >×</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-xl py-5 text-gray-500 text-sm flex flex-col items-center gap-1 active:border-blue-400 active:text-blue-600"
              >
                <span className="text-2xl">📷</span>
                <span>Foto aufnehmen oder auswählen</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm active:bg-gray-50">
              Abbrechen
            </button>
            <button type="submit" disabled={saving} className="py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-60 active:bg-blue-700">
              {saving ? 'Speichert …' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirmation dialog
// ─────────────────────────────────────────────────────────────────────────────

function DeleteConfirm({ vehicle, onConfirm, onCancel, deleting }: { vehicle: Vehicle; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Fahrzeug löschen?</h2>
        <p className="text-sm text-gray-600 mb-1">Soll <strong>{vehicle.license_plate}</strong> dauerhaft gelöscht werden?</p>
        <p className="text-xs text-red-600 mb-6">⚠️ Zugehörige Protokolle bleiben erhalten, aber die Fahrzeugverknüpfung geht verloren.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm">Abbrechen</button>
          <button onClick={onConfirm} disabled={deleting} className="py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60">
            {deleting ? 'Löscht …' : 'Ja, löschen'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type View = 'list' | 'detail'

export default function Fahrzeuge() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showNewFlow, setShowNewFlow] = useState(false)
  const [showExistingFlow, setShowExistingFlow] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchVehicles()
      setVehicles(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleSelect(v: Vehicle) { setSelected(v); setView('detail') }
  function handleBack() { setView('list'); setSelected(null) }
  function handleNew() { setEditTarget(null); setShowForm(true) }
  function handleEdit() { setEditTarget(selected); setShowForm(true) }

  async function handleFormSave(saved: Vehicle) {
    setShowForm(false)
    await load()
    if (view === 'detail') {
      setVehicles((prev) => {
        const updated = prev.find((v) => v.id === saved.id)
        if (updated) setSelected(updated)
        return prev
      })
    }
  }

  async function handleDeleteConfirm() {
    if (!selected) return
    setDeleting(true)
    try {
      await deleteVehicle(selected.id)
      setShowDelete(false)
      setView('list')
      setSelected(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.')
      setShowDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}
      {loading ? (
        <SkeletonList count={5} />
      ) : view === 'detail' && selected ? (
        <VehicleDetail vehicle={selected} onBack={handleBack} onEdit={handleEdit} onDelete={() => setShowDelete(true)} />
      ) : (
        <VehicleList
          vehicles={vehicles}
          search={search}
          onSearchChange={setSearch}
          onSelect={handleSelect}
          onNew={handleNew}
          onNewWithProtocol={() => setShowNewFlow(true)}
          onExistingProtocol={() => setShowExistingFlow(true)}
        />
      )}
      {showForm && <VehicleForm initial={editTarget} onSave={handleFormSave} onCancel={() => setShowForm(false)} />}
      {showDelete && selected && <DeleteConfirm vehicle={selected} onConfirm={handleDeleteConfirm} onCancel={() => setShowDelete(false)} deleting={deleting} />}
      {showNewFlow && (
        <NewVehicleFlow
          onCancel={() => setShowNewFlow(false)}
          onCreated={() => { setShowNewFlow(false); load() }}
        />
      )}
      {showExistingFlow && (
        <ExistingVehicleFlow
          vehicles={vehicles}
          onCancel={() => setShowExistingFlow(false)}
        />
      )}
    </div>
  )
}
