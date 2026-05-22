import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Sparkles, Droplets, Fuel, Zap, CircleCheck, Navigation } from 'lucide-react'
import { SkeletonList } from '../components/Skeleton'
import {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  uploadVehiclePhoto,
  getVehiclePhotoUrl,
  normalizeKennzeichen,
  updateVehicleKnownDamages,
  updateVehicleStatus,
  uploadDamagePhoto,
  type Vehicle,
  type DamageRecord,
} from '../lib/vehicles'
import {
  fetchProjectsWithCounts,
  fetchAllProjects,
  createProject,
  updateProject,
  archiveProject,
  deleteProject,
  getProjectStats,
  checkProjectNameSimilar,
  fetchVehicleProjects,
  addVehicleToProject,
  removeVehicleFromProject,
  fetchVehiclesForProject,
  fetchVehiclesWithoutProject,
  countVehiclesWithoutProject,
  PROJECT_COLORS,
  type Project,
  type ProjectWithCount,
} from '../lib/projects'
import { DAMAGE_POSITIONS, DAMAGE_TYPES, DAMAGE_INTENSITIES } from '../lib/protocols'

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

function VehicleAvatar({ vehicleId, size = 48 }: { vehicleId: string; size?: number }) {
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

function StatusToggle({
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

// ─────────────────────────────────────────────────────────────────────────────
// Project helpers
// ─────────────────────────────────────────────────────────────────────────────

function ProjectColorDot({ color, size = 10 }: { color: string | null; size?: number }) {
  if (!color) return null
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Project form (create / edit) – bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

function ProjectForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Project | null
  onSave: (p: Project) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [color, setColor] = useState(initial?.color ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<Project[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(val: string) {
    setName(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSimilar([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await checkProjectNameSimilar(val)
        setSimilar(found.filter((p) => p.id !== initial?.id))
      } catch {
        // silent
      }
    }, 300)
  }

  const exactDuplicate = similar.some(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase() && p.id !== initial?.id
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name ist Pflichtfeld.'); return }
    if (exactDuplicate) { setError('Ein Projekt mit diesem Namen existiert bereits.'); return }
    setSaving(true)
    setError(null)
    try {
      let saved: Project
      if (initial) {
        saved = await updateProject(initial.id, { name, description, color: color || undefined })
      } else {
        saved = await createProject({ name, description, color: color || undefined })
      }
      onSave(saved)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <form onSubmit={handleSubmit} className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mt-1">
            {initial ? 'Projekt bearbeiten' : 'Neues Projekt'}
          </h2>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ⚠️ {error}
            </div>
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
              <div className="mt-2 space-y-1">
                <p className="text-xs text-amber-600 font-medium">⚠️ Ähnliche Projekte gefunden:</p>
                {similar.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                    <ProjectColorDot color={p.color} />
                    <span className={p.is_archived ? 'line-through text-gray-400' : ''}>
                      {p.name}
                    </span>
                    {p.is_archived && <span className="text-gray-400">(archiviert)</span>}
                  </div>
                ))}
              </div>
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
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs ${
                  !color ? 'border-gray-800' : 'border-gray-300'
                } bg-gray-100`}
              >
                ✕
              </button>
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    color === c ? 'border-gray-800 scale-110' : 'border-transparent'
                  } transition-transform`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
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
              disabled={saving || exactDuplicate}
              className="py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm disabled:opacity-60"
            >
              {saving ? 'Speichert …' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Project context menu (long-press)
// ─────────────────────────────────────────────────────────────────────────────

function ProjectContextMenu({
  project,
  onEdit,
  onArchive,
  onDelete,
  onClose,
}: {
  project: Project
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="px-4 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 py-3 border-b border-gray-100 mb-2">
            <ProjectColorDot color={project.color} size={12} />
            <p className="font-semibold text-gray-900">{project.name}</p>
          </div>
          <button
            onClick={() => { onEdit(); onClose() }}
            className="w-full flex items-center gap-3 px-2 py-3.5 text-left text-gray-800 font-medium rounded-xl active:bg-gray-100"
          >
            <span className="text-xl w-8 text-center">✏️</span>
            Bearbeiten
          </button>
          <button
            onClick={() => { onArchive(); onClose() }}
            className="w-full flex items-center gap-3 px-2 py-3.5 text-left text-amber-700 font-medium rounded-xl active:bg-amber-50"
          >
            <span className="text-xl w-8 text-center">📦</span>
            Archivieren
          </button>
          <button
            onClick={() => { onDelete(); onClose() }}
            className="w-full flex items-center gap-3 px-2 py-3.5 text-left text-red-600 font-medium rounded-xl active:bg-red-50"
          >
            <span className="text-xl w-8 text-center">🗑️</span>
            Löschen
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Project archive confirm
// ─────────────────────────────────────────────────────────────────────────────

function ProjectArchiveConfirm({
  project,
  onConfirm,
  onCancel,
  loading,
}: {
  project: Project
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const [stats, setStats] = useState<{ vehicleCount: number; protocolCount: number } | null>(null)

  useEffect(() => {
    getProjectStats(project.id).then(setStats).catch(() => setStats({ vehicleCount: 0, protocolCount: 0 }))
  }, [project.id])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom))]">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Projekt archivieren?</h2>
        <p className="text-sm text-gray-600 mb-1">
          Projekt <strong>„{project.name}"</strong> archivieren?
          {stats && (
            <span> Es enthält {stats.vehicleCount} Fahrzeug{stats.vehicleCount !== 1 ? 'e' : ''} und {stats.protocolCount} Protokoll{stats.protocolCount !== 1 ? 'e' : ''}.</span>
          )}
        </p>
        <p className="text-xs text-amber-700 mb-6">📦 Das Projekt verschwindet aus der Übersicht und erscheint im Archiv.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm">Abbrechen</button>
          <button onClick={onConfirm} disabled={loading} className="py-3 rounded-xl bg-amber-600 text-white font-semibold text-sm disabled:opacity-60">
            {loading ? 'Archiviert …' : 'Archivieren'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Project delete confirm
// ─────────────────────────────────────────────────────────────────────────────

function ProjectDeleteConfirm({
  project,
  onConfirm,
  onCancel,
  loading,
}: {
  project: Project
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const [stats, setStats] = useState<{ vehicleCount: number; protocolCount: number } | null>(null)

  useEffect(() => {
    getProjectStats(project.id).then(setStats).catch(() => setStats({ vehicleCount: 0, protocolCount: 0 }))
  }, [project.id])

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom))]">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Projekt löschen?</h2>
        <p className="text-sm text-gray-600 mb-1">
          Projekt <strong>„{project.name}"</strong> löschen?
          {stats && (
            <span> Es enthält {stats.vehicleCount} Fahrzeug{stats.vehicleCount !== 1 ? 'e' : ''} und {stats.protocolCount} Protokoll{stats.protocolCount !== 1 ? 'e' : ''}.</span>
          )}
        </p>
        <p className="text-xs text-red-600 mb-6">
          ⚠️ Die Fahrzeuge werden nicht gelöscht – sie landen in „Ohne Projekt".
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm">Abbrechen</button>
          <button onClick={onConfirm} disabled={loading} className="py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60">
            {loading ? 'Löscht …' : 'Löschen'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Kartei (main project overview)
// ─────────────────────────────────────────────────────────────────────────────

function ProjectKartei({
  projects,
  noneCount,
  loading,
  onSelectProject,
  onSelectNone,
  onNewProject,
  onEditProject,
  onArchiveProject,
  onDeleteProject,
  onSearch,
}: {
  projects: ProjectWithCount[]
  noneCount: number
  loading: boolean
  onSelectProject: (p: ProjectWithCount) => void
  onSelectNone: () => void
  onNewProject: () => void
  onEditProject: (p: Project) => void
  onArchiveProject: (p: Project) => void
  onDeleteProject: (p: Project) => void
  onSearch: (term: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<Project | null>(null)
  const [search, setSearch] = useState('')
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressTapRef = useRef(false)

  function startLongPress(p: Project) {
    longPressRef.current = setTimeout(() => {
      suppressTapRef.current = true
      setContextMenu(p)
    }, 500)
  }

  function cancelLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }

  function handleSearchChange(val: string) {
    setSearch(val)
    onSearch(val)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">📁 Projekte</h1>
          <button
            onClick={onNewProject}
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-brand-600 text-white text-sm font-semibold active:bg-brand-700"
          >
            <span>+</span>
            <span>Neu</span>
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="🔍 Fahrzeug suchen (alle Projekte) …"
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Only show project cards when not searching */}
      {!search && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 && noneCount === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📁</p>
              <p className="text-gray-500 font-medium">Noch keine Projekte</p>
              <p className="text-gray-400 text-sm mt-1">Erstelle dein erstes Projekt mit dem + Button.</p>
            </div>
          ) : (
            <>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (suppressTapRef.current) { suppressTapRef.current = false; return }
                    onSelectProject(p)
                  }}
                  onTouchStart={() => startLongPress(p)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onMouseDown={() => startLongPress(p)}
                  onMouseUp={cancelLongPress}
                  onMouseLeave={cancelLongPress}
                  className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3 active:scale-98 transition-transform text-left select-none"
                >
                  {p.color ? (
                    <div
                      className="w-10 h-10 rounded-xl flex-shrink-0"
                      style={{ backgroundColor: p.color + '33' }}
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-xl">
                      📁
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{p.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {p.vehicle_count} Fahrzeug{p.vehicle_count !== 1 ? 'e' : ''}
                    </p>
                  </div>
                  <span className="text-gray-300 text-lg flex-shrink-0">›</span>
                </button>
              ))}

              {/* Ohne Projekt – fixed at bottom, non-removable */}
              <div className="border-t border-gray-200 pt-3 mt-2">
                <button
                  onClick={onSelectNone}
                  className="w-full bg-gray-50 rounded-2xl border border-gray-200 px-4 py-4 flex items-center gap-3 active:bg-gray-100 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0 flex items-center justify-center text-xl">
                    📂
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-600">Ohne Projekt</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {noneCount} Fahrzeug{noneCount !== 1 ? 'e' : ''}
                    </p>
                  </div>
                  <span className="text-gray-300 text-lg flex-shrink-0">›</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {contextMenu && (
        <ProjectContextMenu
          project={contextMenu}
          onEdit={() => onEditProject(contextMenu)}
          onArchive={() => onArchiveProject(contextMenu)}
          onDelete={() => onDeleteProject(contextMenu)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// New vehicle + protocol flow (bottom sheet)
// ─────────────────────────────────────────────────────────────────────────────

function NewVehicleFlow({
  onCancel,
  onCreated,
  preselectedProjectId,
  allProjects,
}: {
  onCancel: () => void
  onCreated: () => void
  preselectedProjectId?: string
  allProjects: Project[]
}) {
  const navigate = useNavigate()
  const [plate, setPlate] = useState('')
  const [brandModel, setBrandModel] = useState('')
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(
    preselectedProjectId ? [preselectedProjectId] : []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [dropdownOpen])

  function toggleProject(id: string) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plate.trim()) { setError('Kennzeichen ist Pflichtfeld.'); return }
    if (activeProjects.length > 0 && selectedProjectIds.length === 0) {
      setError('Bitte mindestens ein Projekt auswählen.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await createVehicle({
        license_plate: plate.trim(),
        brand_model: brandModel.trim(),
        vin: '',
      })
      // Assign to selected projects
      await Promise.all(
        selectedProjectIds.map((pid) => addVehicleToProject(saved.id, pid))
      )
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

  const activeProjects = allProjects.filter((p) => !p.is_archived)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30" onClick={onCancel} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <form onSubmit={handleSubmit} className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] space-y-4">
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
          {activeProjects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Projekt <span className="text-red-500">*</span>
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen((o) => !o)}
                  className="w-full flex items-center justify-between border border-gray-300 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <span className={selectedProjectIds.length === 0 ? 'text-gray-400' : 'text-gray-900 font-medium'}>
                    {selectedProjectIds.length === 0
                      ? 'Projekt auswählen …'
                      : `${selectedProjectIds.length} Projekt${selectedProjectIds.length !== 1 ? 'e' : ''} gewählt`}
                  </span>
                  <span className="text-gray-400 text-xs ml-2">{dropdownOpen ? '▲' : '▼'}</span>
                </button>

                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {activeProjects.map((p) => {
                      const selected = selectedProjectIds.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProject(p.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected ? 'bg-brand-600 border-brand-600' : 'border-gray-300'}`}>
                            {selected && <span className="text-white text-xs leading-none">✓</span>}
                          </span>
                          {p.color && (
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                          )}
                          <span className="flex-1 text-gray-800">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedProjectIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedProjectIds.map((id) => {
                    const p = activeProjects.find((x) => x.id === id)
                    if (!p) return null
                    return (
                      <span
                        key={id}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200"
                      >
                        {p.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />}
                        {p.name}
                        <button
                          type="button"
                          onClick={() => toggleProject(id)}
                          className="ml-0.5 text-brand-400 hover:text-brand-600 leading-none font-bold"
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}
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
              className="py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm disabled:opacity-60"
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
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                        ? 'bg-brand-50'
                        : 'hover:bg-gray-50 active:bg-gray-100'
                    }`}
                  >
                    <VehicleAvatar vehicleId={v.id} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{v.license_plate}</p>
                      <p className="text-sm text-gray-500 truncate">{v.brand_model || '—'}</p>
                    </div>
                    {selected?.id === v.id && (
                      <span className="text-brand-600 text-lg">✓</span>
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
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                📝 Annahme
              </button>
            </div>
            <button
              onClick={handleGo}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm"
            >
              Weiter zum Protokoll →
            </button>
          </div>
        )}

        <div className="flex-shrink-0 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-2 bg-white">
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
  onNewWithProtocol,
  onExistingProtocol,
  onBack,
  projectName,
}: {
  vehicles: Vehicle[]
  search: string
  onSearchChange: (v: string) => void
  onSelect: (v: Vehicle) => void
  onNewWithProtocol: () => void
  onExistingProtocol: () => void
  onBack: () => void
  projectName: string | null
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
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="text-brand-600 text-sm font-medium pr-1 flex-shrink-0">
            ← Projekte
          </button>
          <h1 className="text-lg font-bold text-gray-900 flex-1 truncate">
            {projectName === null ? '📂 Ohne Projekt' : `📁 ${projectName}`}
          </h1>
        </div>
        {/* Protocol entry buttons */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={onNewWithProtocol}
            className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl bg-brand-600 text-white text-center active:bg-brand-700 shadow-sm"
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
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm mt-12">
            {search ? 'Keine Treffer.' : 'Keine Fahrzeuge in diesem Projekt.'}
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Global search results (across all projects)
// ─────────────────────────────────────────────────────────────────────────────

function GlobalSearchResults({
  search,
  onSelect,
  onBack,
}: {
  search: string
  onSelect: (v: Vehicle) => void
  onBack: () => void
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [vehicleProjects, setVehicleProjects] = useState<Record<string, Project[]>>({})

  useEffect(() => {
    setLoading(true)
    fetchVehicles()
      .then(async (all) => {
        setVehicles(all)
        // Fetch project assignments for search results
        const { data: vp } = await supabase
          .from('vehicle_projects')
          .select('vehicle_id, projects(id, name, color, is_archived, archived_at, created_at, description)')
        const map: Record<string, Project[]> = {}
        for (const r of vp ?? []) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const proj = r.projects as any
          if (proj) {
            if (!map[r.vehicle_id]) map[r.vehicle_id] = []
            const p = Array.isArray(proj) ? proj[0] : proj
            if (p) map[r.vehicle_id].push(p as Project)
          }
        }
        setVehicleProjects(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const upper = search.toUpperCase()
  const filtered = upper
    ? vehicles.filter(
        (v) =>
          v.license_plate.toUpperCase().includes(upper) ||
          (v.brand_model ?? '').toUpperCase().includes(upper) ||
          (v.vin ?? '').toUpperCase().includes(upper)
      )
    : []

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <button onClick={onBack} className="text-brand-600 text-sm font-medium mb-2 block">
          ← Zurück
        </button>
        <p className="text-sm text-gray-500">
          {loading ? 'Lädt …' : `${filtered.length} Treffer für „${search}"`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList count={3} />
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-400 text-sm mt-12">Keine Treffer.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((v) => {
              const projs = vehicleProjects[v.id] ?? []
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
                      {projs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {projs.map((p) => (
                            <span
                              key={p.id}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200"
                            >
                              {p.color && (
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: p.color }}
                                />
                              )}
                              {p.name}
                              {p.is_archived && ' 📦'}
                            </span>
                          ))}
                        </div>
                      )}
                      {projs.length === 0 && (
                        <span className="text-xs text-gray-400 mt-0.5 block">Ohne Projekt</span>
                      )}
                    </div>
                    <span className="text-gray-300 text-lg">›</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle project section (inside detail)
// ─────────────────────────────────────────────────────────────────────────────

function VehicleProjectSection({
  vehicleId,
  allProjects,
  onProjectsChanged,
}: {
  vehicleId: string
  allProjects: Project[]
  onProjectsChanged?: () => void
}) {
  const [assignments, setAssignments] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addDropdownOpen, setAddDropdownOpen] = useState(false)
  const addDropdownRef = useRef<HTMLDivElement>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!addDropdownOpen) return
    function handleOutside(e: MouseEvent) {
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) {
        setAddDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [addDropdownOpen])

  const loadAssignments = useCallback(async () => {
    try {
      const data = await fetchVehicleProjects(vehicleId)
      setAssignments(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => { loadAssignments() }, [loadAssignments])

  async function handleAdd(projectId: string) {
    setSavingId(projectId)
    setError(null)
    try {
      await addVehicleToProject(vehicleId, projectId)
      await loadAssignments()
      setAddDropdownOpen(false)
      onProjectsChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Hinzufügen.')
    } finally {
      setSavingId(null)
    }
  }

  async function handleRemove(project: Project) {
    if (assignments.length <= 1) {
      setRemoveConfirm(project)
      return
    }
    await doRemove(project.id)
  }

  async function doRemove(projectId: string) {
    setSavingId(projectId)
    setError(null)
    try {
      await removeVehicleFromProject(vehicleId, projectId)
      await loadAssignments()
      setRemoveConfirm(null)
      onProjectsChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Entfernen.')
    } finally {
      setSavingId(null)
    }
  }

  const assignedIds = new Set(assignments.map((p) => p.id))
  const available = allProjects.filter((p) => !p.is_archived && !assignedIds.has(p.id))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">📁 Projekte</h3>
        {available.length > 0 && (
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs text-brand-600 font-medium"
          >
            {showAdd ? 'Schließen' : '+ Hinzufügen'}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
          ⚠️ {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Lädt …</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignments.length === 0 ? (
            <span className="text-xs text-gray-400 italic">Kein Projekt zugeordnet (in „Ohne Projekt")</span>
          ) : (
            assignments.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-medium border border-gray-200 bg-gray-50"
              >
                {p.color && (
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                )}
                <span className="text-gray-700">{p.name}</span>
                <button
                  onClick={() => handleRemove(p)}
                  disabled={savingId === p.id}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-40 leading-none ml-0.5"
                  aria-label="Entfernen"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      )}

      {showAdd && available.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="relative" ref={addDropdownRef}>
            <button
              type="button"
              onClick={() => setAddDropdownOpen((o) => !o)}
              className="w-full flex items-center justify-between border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <span className="text-gray-400">Projekt auswählen …</span>
              <span className="text-gray-400 text-xs ml-2">{addDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {addDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {available.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAdd(p.id)}
                    disabled={savingId === p.id}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                  >
                    {p.color && (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    )}
                    <span className="flex-1 text-gray-800">{savingId === p.id ? '…' : p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last-project removal confirm */}
      {removeConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30" onClick={() => setRemoveConfirm(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Letztes Projekt entfernen?</h2>
            <p className="text-sm text-gray-600 mb-4">
              Das Fahrzeug hat dann kein Projekt mehr und landet in „Ohne Projekt". Fortfahren?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setRemoveConfirm(null)} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm">
                Abbrechen
              </button>
              <button onClick={() => doRemove(removeConfirm.id)} className="py-3 rounded-xl bg-red-600 text-white font-semibold text-sm">
                Entfernen
              </button>
            </div>
          </div>
        </>
      )}
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
  onDamagesChange,
  allProjects,
}: {
  vehicle: Vehicle
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onDamagesChange: (damages: DamageRecord[]) => void
  allProjects: Project[]
}) {
  const navigate = useNavigate()
  const protos = (vehicle.protocols ?? []).slice().sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )

  const [damages, setDamages] = useState<DamageRecord[]>(vehicle.known_damages ?? [])
  const [formOpen, setFormOpen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [formPos, setFormPos] = useState('')
  const [formType, setFormType] = useState('')
  const [formInt, setFormInt] = useState('')
  const [formPhotoFile, setFormPhotoFile] = useState<File | null>(null)
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null)
  const formPhotoRef = useRef<HTMLInputElement>(null)
  const formCameraRef = useRef<HTMLInputElement>(null)
  const [dmgSaving, setDmgSaving] = useState(false)
  const [dmgError, setDmgError] = useState<string | null>(null)

  const [statusInnen, setStatusInnen] = useState<string>(vehicle.cleanliness_interior ?? 'schmutzig')
  const [statusAussen, setStatusAussen] = useState<string>(vehicle.cleanliness_exterior ?? 'schmutzig')
  const [isFueled, setIsFueled] = useState<boolean>(vehicle.is_fueled ?? false)
  const [isCharged, setIsCharged] = useState<boolean>(vehicle.is_charged ?? false)
  const [availability, setAvailability] = useState<string>(vehicle.availability ?? 'verfügbar')
  const [currentOdometer, setCurrentOdometer] = useState<number | string>(vehicle.current_odometer ?? '')
  const [statusError, setStatusError] = useState<string | null>(null)

  async function saveStatus(patch: Parameters<typeof updateVehicleStatus>[1]) {
    setStatusError(null)
    try {
      await updateVehicleStatus(vehicle.id, patch)
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    }
  }

  function openAdd() {
    setEditIdx(null); setFormPos(''); setFormType(''); setFormInt('')
    setFormPhotoFile(null); setFormPhotoPreview(null)
    setDmgError(null); setFormOpen(true)
  }

  function openEdit(i: number) {
    setEditIdx(i); setFormPos(damages[i].pos); setFormType(damages[i].type)
    setFormInt(damages[i].int)
    setFormPhotoFile(null)
    setFormPhotoPreview(damages[i].photo_url ?? null)
    setDmgError(null); setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false); setDmgError(null)
    setFormPhotoFile(null); setFormPhotoPreview(null)
  }

  function handleFormPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFormPhotoFile(file)
    setFormPhotoPreview(URL.createObjectURL(file))
  }

  async function handleDamageSave() {
    if (!formPos || !formType || !formInt) {
      setDmgError('Alle Felder ausfüllen.')
      return
    }
    setDmgSaving(true)
    setDmgError(null)
    try {
      const targetIdx = editIdx !== null ? editIdx : damages.length
      let photoUrl: string | undefined =
        editIdx !== null ? damages[editIdx].photo_url : undefined

      if (formPhotoFile) {
        photoUrl = await uploadDamagePhoto(vehicle.id, targetIdx, formPhotoFile)
      }

      const newRecord: DamageRecord = {
        pos: formPos, type: formType, int: formInt,
        ...(photoUrl ? { photo_url: photoUrl } : {}),
      }
      const updated =
        editIdx !== null
          ? damages.map((d, i) => (i === editIdx ? newRecord : d))
          : [...damages, newRecord]
      await updateVehicleKnownDamages(vehicle.id, updated)
      setDamages(updated)
      onDamagesChange(updated)
      closeForm()
    } catch (e: unknown) {
      setDmgError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.')
    } finally {
      setDmgSaving(false)
    }
  }

  async function handleDamageDelete(i: number) {
    const updated = damages.filter((_, idx) => idx !== i)
    try {
      await updateVehicleKnownDamages(vehicle.id, updated)
      setDamages(updated)
      onDamagesChange(updated)
    } catch (e: unknown) {
      setDmgError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.')
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={onBack} className="text-brand-600 text-sm font-medium pr-1">
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
            <p className="text-gray-400 text-xs mt-1">FIN: {vehicle.vin || '—'}</p>
            <div className="flex gap-3 mt-2.5">
              {([
                { icon: <Sparkles size={18} />, label: 'Innen', active: statusInnen === 'sauber' },
                { icon: <Droplets size={18} />, label: 'Außen', active: statusAussen === 'sauber' },
                { icon: <Fuel size={18} />, label: 'Tank', active: isFueled },
                { icon: <Zap size={18} />, label: 'Akku', active: isCharged },
              ] as { icon: React.ReactNode; label: string; active: boolean }[]).map(({ icon, label, active }) => (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className={active ? 'text-green-500' : 'text-gray-300'}>{icon}</span>
                  <span className={`text-[10px] font-medium ${active ? 'text-green-600' : 'text-gray-300'}`}>{label}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-0.5">
                <span className={availability === 'verfügbar' ? 'text-green-500' : 'text-orange-400'}>
                  {availability === 'verfügbar' ? <CircleCheck size={18} /> : <Navigation size={18} />}
                </span>
                <span className={`text-[10px] font-medium ${availability === 'verfügbar' ? 'text-green-600' : 'text-orange-500'}`}>
                  {availability === 'verfügbar' ? 'Verfügbar' : 'Unterwegs'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Project assignments */}
        <VehicleProjectSection
          vehicleId={vehicle.id}
          allProjects={allProjects}
        />

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
                  known_damages: damages,
                },
              })
            }
            className="py-3 rounded-xl bg-brand-50 text-brand-700 font-medium text-sm active:bg-brand-100"
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
                  known_damages: damages,
                },
              })
            }
            className="py-3 rounded-xl bg-green-50 text-green-700 font-medium text-sm active:bg-green-100"
          >
            🚙 Neues Überführungsprotokoll
          </button>
        </div>

        {/* Known damages */}
        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" open>
          <summary className="px-4 py-3 font-medium text-gray-800 cursor-pointer select-none flex items-center justify-between">
            <span>🔧 Bekannte Vorschäden ({damages.length})</span>
            <span className="text-gray-400 text-xs">details</span>
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {dmgError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                ⚠️ {dmgError}
              </p>
            )}
            {damages.length === 0 && !formOpen && (
              <p className="text-sm text-gray-400 italic">Keine dauerhaften Vorschäden hinterlegt.</p>
            )}
            {damages.map((d, i) => (
              <div key={i} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <span className="flex-1">📍 {d.pos} · 🛠️ {d.type} · ⚠️ {d.int}</span>
                  <button type="button" onClick={() => openEdit(i)} className="text-gray-400 hover:text-gray-600 active:text-gray-800 p-1 flex-shrink-0" aria-label="Bearbeiten">✏️</button>
                  <button type="button" onClick={() => handleDamageDelete(i)} className="text-red-400 hover:text-red-600 active:text-red-800 p-1 flex-shrink-0" aria-label="Löschen">🗑️</button>
                </div>
                {d.photo_url && (
                  <img src={d.photo_url} alt="Schadenfoto" className="mt-2 w-full max-h-40 object-cover rounded-lg border border-amber-200" loading="lazy" />
                )}
              </div>
            ))}

            {formOpen && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 mt-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {editIdx !== null ? 'Schaden bearbeiten' : 'Neuer Schaden'}
                </p>
                <select value={formPos} onChange={(e) => setFormPos(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="">Position wählen …</option>
                  {DAMAGE_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                    <option value="">Art …</option>
                    {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={formInt} onChange={(e) => setFormInt(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
                    <option value="">Intensität …</option>
                    {DAMAGE_INTENSITIES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  {formPhotoPreview ? (
                    <div className="relative flex-shrink-0">
                      <img src={formPhotoPreview} alt="Vorschau" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                      <button type="button" onClick={() => { setFormPhotoFile(null); setFormPhotoPreview(null) }} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => formCameraRef.current?.click()} className="flex items-center gap-1.5 text-sm text-brand-600 border border-brand-200 rounded-lg px-3 py-2 bg-brand-50 active:bg-brand-100">📷 <span>Kamera</span></button>
                      <button type="button" onClick={() => formPhotoRef.current?.click()} className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-300 rounded-lg px-3 py-2 bg-white active:bg-gray-50">🖼 <span>Galerie</span></button>
                    </div>
                  )}
                  <input ref={formCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFormPhoto} />
                  <input ref={formPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleFormPhoto} />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={closeForm} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium active:bg-gray-100">Abbrechen</button>
                  <button type="button" onClick={handleDamageSave} disabled={dmgSaving} className="flex-1 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold disabled:opacity-60 active:bg-brand-700">
                    {dmgSaving ? 'Speichert …' : 'Speichern'}
                  </button>
                </div>
              </div>
            )}

            {!formOpen && (
              <button type="button" onClick={openAdd} className="w-full mt-1 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 flex items-center justify-center gap-2 active:border-brand-400 active:text-brand-600">
                + Schaden hinzufügen
              </button>
            )}
          </div>
        </details>

        {/* Fahrzeugstatus */}
        <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <summary className="px-4 py-3 font-medium text-gray-800 cursor-pointer select-none flex items-center justify-between">
            <span>📊 Fahrzeugstatus</span>
            <span className="text-gray-400 text-xs">details</span>
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {statusError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {statusError}</p>
            )}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pb-1">Sauberkeit</p>
            <StatusToggle label="Innen" checked={statusInnen === 'sauber'} onChange={(v) => { const val = v ? 'sauber' : 'schmutzig'; setStatusInnen(val); saveStatus({ cleanliness_interior: val }) }} trueLabel="Sauber" falseLabel="Schmutzig" />
            <StatusToggle label="Außen" checked={statusAussen === 'sauber'} onChange={(v) => { const val = v ? 'sauber' : 'schmutzig'; setStatusAussen(val); saveStatus({ cleanliness_exterior: val }) }} trueLabel="Sauber" falseLabel="Schmutzig" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2 pb-1">Tank / Ladung</p>
            <StatusToggle label="Getankt" checked={isFueled} onChange={(v) => { setIsFueled(v); saveStatus({ is_fueled: v }) }} trueLabel="Ja" falseLabel="Nein" />
            <StatusToggle label="Geladen" checked={isCharged} onChange={(v) => { setIsCharged(v); saveStatus({ is_charged: v }) }} trueLabel="Ja" falseLabel="Nein" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2 pb-1">Verfügbarkeit</p>
            <StatusToggle label="Status" checked={availability === 'verfügbar'} onChange={(v) => { const val = v ? 'verfügbar' : 'unterwegs'; setAvailability(val); saveStatus({ availability: val }) }} trueLabel="Verfügbar" falseLabel="Unterwegs" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2 pb-1">Kilometerstand</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={currentOdometer}
                onChange={(e) => setCurrentOdometer(e.target.value)}
                onBlur={() => { const val = currentOdometer === '' ? null : Number(currentOdometer); saveStatus({ current_odometer: val }) }}
                placeholder="—"
                min={0}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <span className="text-sm text-gray-500 font-medium pr-1">km</span>
            </div>
          </div>
        </details>

        {/* Protocols */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Protokolle ({protos.length})
          </h2>
          {protos.length === 0 ? (
            <p className="text-sm text-gray-400 italic text-center py-4">Noch keine Protokolle für dieses Fahrzeug.</p>
          ) : (
            <ul className="space-y-2">
              {protos.map((p) => {
                const isTransfer = p.protocol_type === 'transfer'
                const isDraft = p.status === 'draft'
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => navigate('/archiv', { state: { protocol_id: p.id } })}
                      className="w-full bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-start gap-3 active:bg-gray-50 text-left"
                    >
                      <span className="text-lg mt-0.5">{isTransfer ? '🔄' : '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {p.created_at.slice(0, 10)}
                          {isDraft && <span className="ml-2 text-xs text-amber-600 font-normal">⚠️ Entwurf</span>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {isTransfer ? 'Überführung' : 'Annahme'}
                          {p.inspector_name ? ` · ${p.inspector_name}` : ''}
                        </p>
                      </div>
                      <span className="text-gray-400 text-xs mt-1">›</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Edit / Delete */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button onClick={onEdit} className="py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm active:bg-gray-200">✏️ Bearbeiten</button>
          <button onClick={onDelete} className="py-3 rounded-xl bg-red-50 text-red-600 font-medium text-sm active:bg-red-100">🗑️ Löschen</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vehicle form (add / edit)
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
  const cameraFileRef = useRef<HTMLInputElement>(null)

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
    if (!plate.trim()) { setError('Kennzeichen ist Pflichtfeld.'); return }
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
        try { await uploadVehiclePhoto(saved.id, photoFile) } catch { /* photo is optional */ }
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
        <form onSubmit={handleSubmit} className="px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] space-y-4">
          <h2 className="text-lg font-bold text-gray-900 mt-1 mb-4">
            {initial ? 'Fahrzeug bearbeiten' : 'Fahrzeug anlegen'}
          </h2>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">⚠️ {error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kennzeichen <span className="text-red-500">*</span></label>
            <input type="text" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="M-AB 1234" autoCapitalize="characters" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 uppercase" required />
            {plateWarning && <p className="text-xs text-amber-600 mt-1">⚠️ {plateWarning}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marke / Modell</label>
            <input type="text" value={brandModel} onChange={(e) => setBrandModel(e.target.value)} placeholder="BMW 3er, VW Golf …" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">FIN / VIN</label>
            <input type="text" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17-stellige Fahrzeugidentnummer" autoCapitalize="characters" maxLength={17} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 uppercase font-mono tracking-wider" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fahrzeugfoto <span className="text-gray-400 font-normal">(optional)</span></label>
            {photoPreview ? (
              <div className="relative inline-block">
                <img src={photoPreview} alt="Vorschau" className="w-32 h-32 object-cover rounded-xl border border-gray-200" />
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null) }} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => cameraFileRef.current?.click()} className="border-2 border-dashed border-brand-300 rounded-xl py-5 text-brand-600 text-sm flex flex-col items-center gap-1 active:border-brand-500 active:bg-brand-50">
                  <span className="text-2xl">📷</span><span>Kamera</span>
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl py-5 text-gray-500 text-sm flex flex-col items-center gap-1 active:border-brand-400 active:text-brand-600">
                  <span className="text-2xl">🖼</span><span>Galerie</span>
                </button>
              </div>
            )}
            <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onCancel} className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm active:bg-gray-50">Abbrechen</button>
            <button type="submit" disabled={saving} className="py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm disabled:opacity-60 active:bg-brand-700">
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
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl px-6 pt-6 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom))]">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Fahrzeug löschen?</h2>
        <p className="text-sm text-gray-600 mb-1">Soll <strong>{vehicle.license_plate}</strong> dauerhaft gelöscht werden?</p>
        <p className="text-xs text-red-600 mb-6">⚠️ Alle verknüpften Protokolle werden ebenfalls unwiderruflich gelöscht.</p>
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

type View = 'projects' | 'list' | 'detail' | 'search'

export default function Fahrzeuge() {
  // Project state
  const [projects, setProjects] = useState<ProjectWithCount[]>([])
  const [noneCount, setNoneCount] = useState(0)
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [activeProject, setActiveProject] = useState<ProjectWithCount | null | undefined>(undefined)
  const [allProjects, setAllProjects] = useState<Project[]>([])

  // Vehicle state
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)

  // UI state
  const [view, setView] = useState<View>('projects')
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [search, setSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showNewFlow, setShowNewFlow] = useState(false)
  const [showExistingFlow, setShowExistingFlow] = useState(false)

  // Project modals
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editProjectTarget, setEditProjectTarget] = useState<Project | null>(null)
  const [projectArchiveTarget, setProjectArchiveTarget] = useState<Project | null>(null)
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<Project | null>(null)
  const [projectActionLoading, setProjectActionLoading] = useState(false)

  async function loadProjects() {
    setProjectsLoading(true)
    try {
      const [p, nc, ap] = await Promise.all([
        fetchProjectsWithCounts(),
        countVehiclesWithoutProject(),
        fetchAllProjects(),
      ])
      setProjects(p)
      setNoneCount(nc)
      setAllProjects(ap)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Projekte konnten nicht geladen werden.')
    } finally {
      setProjectsLoading(false)
    }
  }

  async function loadVehiclesForProject(project: ProjectWithCount | null) {
    setVehiclesLoading(true)
    setVehicles([])
    try {
      const data = project === null
        ? await fetchVehiclesWithoutProject()
        : await fetchVehiclesForProject(project.id)
      setVehicles(data as Vehicle[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fahrzeuge konnten nicht geladen werden.')
    } finally {
      setVehiclesLoading(false)
    }
  }

  useEffect(() => { loadProjects() }, [])

  function handleSelectProject(p: ProjectWithCount) {
    setActiveProject(p)
    setSearch('')
    setView('list')
    loadVehiclesForProject(p)
  }

  function handleSelectNone() {
    setActiveProject(null)
    setSearch('')
    setView('list')
    loadVehiclesForProject(null)
  }

  function handleBackToProjects() {
    setView('projects')
    setActiveProject(undefined)
    setVehicles([])
    loadProjects()
  }

  function handleSelectVehicle(v: Vehicle) {
    setSelected(v)
    setView('detail')
  }

  function handleBackToList() {
    setView('list')
    setSelected(null)
  }

  function handleEdit() { setEditTarget(selected); setShowForm(true) }

  async function handleFormSave(saved: Vehicle) {
    setShowForm(false)
    await loadVehiclesForProject(activeProject ?? null)
    if (view === 'detail') {
      setVehicles((prev) => {
        const updated = prev.find((v) => v.id === saved.id)
        if (updated) setSelected(updated)
        return prev
      })
    }
  }

  function handleDamagesChange(damages: DamageRecord[]) {
    setSelected((prev) => prev ? { ...prev, known_damages: damages } : null)
    setVehicles((prev) => prev.map((v) => v.id === selected?.id ? { ...v, known_damages: damages } : v))
  }

  async function handleDeleteConfirm() {
    if (!selected) return
    setDeleting(true)
    try {
      await deleteVehicle(selected.id)
      setShowDelete(false)
      setView('list')
      setSelected(null)
      await loadVehiclesForProject(activeProject ?? null)
      await loadProjects()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.')
      setShowDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  // ── Project actions ──────────────────────────────────────────────────────

  async function handleProjectArchive() {
    if (!projectArchiveTarget) return
    setProjectActionLoading(true)
    try {
      await archiveProject(projectArchiveTarget.id)
      setProjectArchiveTarget(null)
      await loadProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archivieren fehlgeschlagen.')
    } finally {
      setProjectActionLoading(false)
    }
  }

  async function handleProjectDelete() {
    if (!projectDeleteTarget) return
    setProjectActionLoading(true)
    try {
      await deleteProject(projectDeleteTarget.id)
      setProjectDeleteTarget(null)
      await loadProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.')
    } finally {
      setProjectActionLoading(false)
    }
  }

  function handleGlobalSearch(term: string) {
    setGlobalSearch(term)
    if (term) {
      setView('search')
    } else {
      setView('projects')
    }
  }

  function handleSearchVehicleSelect(v: Vehicle) {
    setSelected(v)
    setActiveProject(undefined)
    setView('detail')
  }

  const activeProjectName = activeProject === null
    ? null
    : activeProject?.name ?? null

  // All vehicles for ExistingVehicleFlow (needs all vehicles)
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([])
  useEffect(() => {
    if (showExistingFlow && allVehicles.length === 0) {
      fetchVehicles().then(setAllVehicles).catch(() => {})
    }
  }, [showExistingFlow, allVehicles.length])

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}

      {view === 'projects' && (
        <ProjectKartei
          projects={projects}
          noneCount={noneCount}
          loading={projectsLoading}
          onSelectProject={handleSelectProject}
          onSelectNone={handleSelectNone}
          onNewProject={() => { setEditProjectTarget(null); setShowProjectForm(true) }}
          onEditProject={(p) => { setEditProjectTarget(p); setShowProjectForm(true) }}
          onArchiveProject={(p) => setProjectArchiveTarget(p)}
          onDeleteProject={(p) => setProjectDeleteTarget(p)}
          onSearch={handleGlobalSearch}
        />
      )}

      {view === 'search' && (
        <GlobalSearchResults
          search={globalSearch}
          onSelect={handleSearchVehicleSelect}
          onBack={() => { setView('projects'); setGlobalSearch('') }}
        />
      )}

      {view === 'list' && (
        vehiclesLoading ? (
          <div className="flex flex-col">
            <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
              <button onClick={handleBackToProjects} className="text-brand-600 text-sm font-medium mb-1">← Projekte</button>
            </div>
            <SkeletonList count={5} />
          </div>
        ) : (
          <VehicleList
            vehicles={vehicles}
            search={search}
            onSearchChange={setSearch}
            onSelect={handleSelectVehicle}
            onNewWithProtocol={() => setShowNewFlow(true)}
            onExistingProtocol={() => setShowExistingFlow(true)}
            onBack={handleBackToProjects}
            projectName={activeProjectName}
          />
        )
      )}

      {view === 'detail' && selected && (
        <VehicleDetail
          vehicle={selected}
          onBack={view === 'detail' && activeProject === undefined && globalSearch
            ? () => { setView('search'); setSelected(null) }
            : handleBackToList
          }
          onEdit={handleEdit}
          onDelete={() => setShowDelete(true)}
          onDamagesChange={handleDamagesChange}
          allProjects={allProjects.filter((p) => !p.is_archived)}
        />
      )}

      {/* Vehicle modals */}
      {showForm && <VehicleForm initial={editTarget} onSave={handleFormSave} onCancel={() => setShowForm(false)} />}
      {showDelete && selected && (
        <DeleteConfirm vehicle={selected} onConfirm={handleDeleteConfirm} onCancel={() => setShowDelete(false)} deleting={deleting} />
      )}
      {showNewFlow && (
        <NewVehicleFlow
          onCancel={() => setShowNewFlow(false)}
          onCreated={() => {
            setShowNewFlow(false)
            loadVehiclesForProject(activeProject ?? null)
            loadProjects()
          }}
          preselectedProjectId={activeProject?.id}
          allProjects={allProjects}
        />
      )}
      {showExistingFlow && (
        <ExistingVehicleFlow
          vehicles={allVehicles}
          onCancel={() => setShowExistingFlow(false)}
        />
      )}

      {/* Project modals */}
      {showProjectForm && (
        <ProjectForm
          initial={editProjectTarget}
          onSave={async () => { setShowProjectForm(false); await loadProjects() }}
          onCancel={() => setShowProjectForm(false)}
        />
      )}
      {projectArchiveTarget && (
        <ProjectArchiveConfirm
          project={projectArchiveTarget}
          onConfirm={handleProjectArchive}
          onCancel={() => setProjectArchiveTarget(null)}
          loading={projectActionLoading}
        />
      )}
      {projectDeleteTarget && (
        <ProjectDeleteConfirm
          project={projectDeleteTarget}
          onConfirm={handleProjectDelete}
          onCancel={() => setProjectDeleteTarget(null)}
          loading={projectActionLoading}
        />
      )}
    </div>
  )
}
