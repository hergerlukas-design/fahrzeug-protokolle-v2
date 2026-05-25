import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import PdfButton from '../components/PdfButton'
import type { PdfData } from '../lib/generatePdf'
import { DEFAULT_CHECKLISTE, deleteProtocol, type ProtocolConditionData } from '../lib/protocols'
import { SkeletonList } from '../components/Skeleton'
import {
  fetchArchivedProjectsWithCounts,
  unarchiveProject,
  deleteProject,
  getProjectStats,
  type ProjectWithCount,
} from '../lib/projects'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface VehicleRef {
  license_plate: string
  brand_model: string
  vin: string
}

interface ProtocolRow {
  id: number
  vehicle_id: string
  inspector_name: string
  location: string
  odometer: number
  fuel_level: number
  remarks: string
  inspection_date: string
  status: 'draft' | 'final'
  protocol_type: 'annahme' | 'transfer'
  condition_data: ProtocolConditionData
  vehicles: VehicleRef | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, lang = 'de-DE'): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toPdfData(p: ProtocolRow): PdfData {
  const v = p.vehicles
  return {
    protocol_type: p.protocol_type,
    status: p.status,
    inspector_name: p.inspector_name,
    location: p.location,
    odometer: p.odometer,
    fuel_level: p.fuel_level,
    battery: p.condition_data?.battery ?? 0,
    remarks: p.remarks,
    inspection_date: p.inspection_date,
    license_plate: v?.license_plate ?? '—',
    brand_model: v?.brand_model ?? '—',
    vin: v?.vin ?? '—',
    photos: p.condition_data?.photos ?? {},
    conditions: p.condition_data?.conditions ?? [],
    damage_records: p.condition_data?.damage_records ?? [],
    checkliste: p.condition_data?.checkliste ?? DEFAULT_CHECKLISTE,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Archiv() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { t, i18n } = useTranslation()
  const preselectedId = (loc.state as { protocol_id?: number } | null)?.protocol_id ?? null
  const [tab, setTab] = useState<'protokolle' | 'projekte'>('protokolle')
  const [protocols, setProtocols] = useState<ProtocolRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'annahme' | 'transfer'>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [selected, setSelected] = useState<ProtocolRow | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Archived projects state ───────────────────────────────────────────────
  const [archivedProjects, setArchivedProjects] = useState<ProjectWithCount[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectActionId, setProjectActionId] = useState<string | null>(null)
  const [projectMsg, setProjectMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('protocols')
        .select('*, vehicles(license_plate, brand_model, vin)')
        .order('inspection_date', { ascending: false })
      if (err) throw err
      const rows = (data ?? []) as ProtocolRow[]
      setProtocols(rows)
      if (preselectedId) {
        const match = rows.find(p => p.id === preselectedId)
        if (match) setSelected(match)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function loadArchivedProjects() {
    setProjectsLoading(true)
    setProjectMsg(null)
    try {
      const data = await fetchArchivedProjectsWithCounts()
      setArchivedProjects(data)
    } catch (e) {
      setProjectMsg({ ok: false, text: e instanceof Error ? e.message : t('common.error') })
    } finally {
      setProjectsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'projekte') loadArchivedProjects()
  }, [tab])

  async function handleProjectUnarchive(id: string) {
    setProjectActionId(id)
    setProjectMsg(null)
    try {
      await unarchiveProject(id)
      setArchivedProjects((prev) => prev.filter((p) => p.id !== id))
      setProjectMsg({ ok: true, text: t('archiv.project_reactivated') })
    } catch (e) {
      setProjectMsg({ ok: false, text: e instanceof Error ? e.message : t('archiv.project_error') })
    } finally {
      setProjectActionId(null)
    }
  }

  async function handleProjectDelete(id: string, name: string) {
    const stats = await getProjectStats(id).catch(() => ({ vehicleCount: 0, protocolCount: 0 }))
    const vehicleStr = t('archiv.project_vehicle_count', { count: stats.vehicleCount })
    const protocolStr = t('archiv.count', { count: stats.protocolCount })
    const confirmed = window.confirm(
      [
        t('projects.delete_confirm_body', { name }),
        `${vehicleStr} · ${protocolStr}`,
        t('projects.delete_note'),
      ].join('\n\n')
    )
    if (!confirmed) return
    setProjectActionId(id)
    try {
      await deleteProject(id)
      setArchivedProjects((prev) => prev.filter((p) => p.id !== id))
      setProjectMsg({ ok: true, text: t('archiv.project_deleted') })
    } catch (e) {
      setProjectMsg({ ok: false, text: e instanceof Error ? e.message : t('archiv.project_error') })
    } finally {
      setProjectActionId(null)
    }
  }

  async function handleDelete() {
    if (deleteId == null) return
    setDeleting(true)
    setDeleteError(null)
    const target = protocols.find(p => p.id === deleteId)
    try {
      await deleteProtocol(deleteId, target?.condition_data?.photos)
      setProtocols(prev => prev.filter(p => p.id !== deleteId))
      if (selected?.id === deleteId) setSelected(null)
      setDeleteId(null)
    } catch (e: unknown) {
      console.error('handleDelete:', e)
      setDeleteError(e instanceof Error ? e.message : t('common.error'))
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Client-side filtering ──────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const filtered = protocols.filter(p => {
    if (filterType !== 'all' && p.protocol_type !== filterType) return false
    if (filterFrom && p.inspection_date < filterFrom) return false
    if (filterTo && p.inspection_date > filterTo + 'T23:59:59') return false
    if (q) {
      const plate = (p.vehicles?.license_plate ?? '').toLowerCase()
      const name = p.inspector_name.toLowerCase()
      const date = formatDate(p.inspection_date, i18n.language)
      if (!plate.includes(q) && !name.includes(q) && !date.includes(q)) return false
    }
    return true
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Delete error banner */}
      {deleteError && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex gap-2 items-start">
          <span className="text-red-500 mt-0.5 flex-shrink-0">⚠️</span>
          <p className="text-red-700 text-sm flex-1 whitespace-pre-wrap">{deleteError}</p>
          <button onClick={() => setDeleteError(null)} className="text-red-400 text-lg leading-none flex-shrink-0">×</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-800 mb-3">{t('archiv.title')}</h1>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setTab('protokolle')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'protokolle' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t('archiv.tab_protocols')}
          </button>
          <button
            onClick={() => setTab('projekte')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'projekte' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t('archiv.tab_projects')}
          </button>
        </div>

        {tab === 'protokolle' && (
          <>
            {/* Search */}
            <input
              type="text"
              placeholder={t('archiv.search_placeholder')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2"
            />

            {/* Type filter pills */}
            <div className="flex gap-2 mb-2">
              {(['all', 'annahme', 'transfer'] as const).map(ft => (
                <button
                  key={ft}
                  onClick={() => setFilterType(ft)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterType === ft
                      ? ft === 'annahme'
                        ? 'bg-brand-600 text-white border-brand-600'
                        : ft === 'transfer'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {ft === 'all' ? t('archiv.filter_all') : ft === 'annahme' ? t('archiv.filter_intake') : t('archiv.filter_transfer')}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 mb-0.5 block">{t('archiv.date_from')}</label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 mb-0.5 block">{t('archiv.date_to')}</label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {(filterFrom || filterTo) && (
                <button
                  onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  className="self-end mb-0 px-2 py-1.5 text-xs text-gray-400 active:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Archived projects tab */}
      {tab === 'projekte' && (
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))] space-y-2">
          {projectMsg && (
            <div className={`p-3 rounded-xl text-sm font-medium ${projectMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {projectMsg.text}
            </div>
          )}
          {projectsLoading ? (
            <SkeletonList count={3} />
          ) : archivedProjects.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-gray-500 font-medium">{t('archiv.no_archived_projects')}</p>
              <p className="text-gray-400 text-sm mt-1">{t('archiv.no_archived_projects_hint')}</p>
            </div>
          ) : (
            archivedProjects.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {p.color ? (
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: p.color + '33' }}>
                      <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.color }} />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">📦</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-700 truncate">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-400 truncate">{p.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('archiv.project_vehicle_count', { count: p.vehicle_count })} ·{' '}
                      {p.archived_at
                        ? t('archiv.archived_at', { date: new Date(p.archived_at).toLocaleDateString(i18n.language) })
                        : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleProjectUnarchive(p.id)}
                    disabled={projectActionId === p.id}
                    className="flex-1 py-2 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium border border-brand-200 active:bg-brand-100 disabled:opacity-50"
                  >
                    {projectActionId === p.id ? '…' : t('archiv.reactivate')}
                  </button>
                  <button
                    onClick={() => handleProjectDelete(p.id, p.name)}
                    disabled={projectActionId === p.id}
                    className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium border border-red-200 active:bg-red-100 disabled:opacity-50"
                  >
                    {t('archiv.project_delete')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Protocol tab content */}
      {tab === 'protokolle' && (
        <>
      {/* Count */}
      {!loading && !error && (
        <div className="px-4 pt-2 pb-0">
          <p className="text-xs text-gray-400">
            {t('archiv.count', { count: filtered.length })}
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))] space-y-2">
        {loading && <SkeletonList count={6} />}
        {error && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={load}
              className="text-sm text-brand-600 underline"
            >
              {t('archiv.retry')}
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">{t('archiv.empty')}</p>
        )}
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className="w-full text-left bg-white rounded-xl border border-gray-200 p-3 shadow-sm active:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 truncate">
                  {p.vehicles?.license_plate ?? '—'}
                </p>
                <p className="text-xs text-gray-500 truncate">{p.vehicles?.brand_model ?? '—'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{p.inspector_name}</p>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  p.protocol_type === 'annahme'
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {p.protocol_type === 'annahme' ? t('archiv.intake') : t('archiv.transfer')}
                </span>
                {p.status === 'draft' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {t('archiv.draft')}
                  </span>
                )}
                <p className="text-xs text-gray-400">{formatDate(p.inspection_date, i18n.language)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
        </>
      )}

      {/* ── Detail Modal ────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Modal Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white sticky top-0">
            <button
              onClick={() => setSelected(null)}
              className="p-1 rounded-lg text-gray-500 active:bg-gray-100"
              aria-label={t('common.back')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-800 truncate">
                {selected.vehicles?.license_plate ?? '—'}
              </p>
              <p className="text-xs text-gray-500">{formatDate(selected.inspection_date, i18n.language)}</p>
            </div>
            <button
              onClick={() => setDeleteId(selected.id)}
              className="p-1 rounded-lg text-red-500 active:bg-red-50"
              aria-label={t('archiv.delete_title')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom))] space-y-4">
            {/* Type + Status badges */}
            <div className="flex gap-2 flex-wrap">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                selected.protocol_type === 'annahme'
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {selected.protocol_type === 'annahme' ? t('archiv.intake') : t('archiv.transfer')}
              </span>
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                selected.status === 'final'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {selected.status === 'final' ? t('archiv.final') : t('archiv.draft')}
              </span>
            </div>

            {/* Basisdaten */}
            <Section title={t('archiv.section_base')}>
              <Field label={t('archiv.field_plate')} value={selected.vehicles?.license_plate ?? '—'} />
              <Field label={t('archiv.field_brand')} value={selected.vehicles?.brand_model ?? '—'} />
              <Field label={t('archiv.field_vin')} value={selected.vehicles?.vin ?? '—'} />
              <Field label={t('archiv.field_creator')} value={selected.inspector_name} />
              <Field label={t('archiv.field_location')} value={selected.location} />
              <Field label={t('archiv.field_km')} value={`${selected.odometer.toLocaleString(i18n.language)} km`} />
              <Field label={t('archiv.field_date')} value={formatDate(selected.inspection_date, i18n.language)} />
            </Section>

            {/* Technik */}
            <Section title={t('archiv.section_tech')}>
              <Field label={t('archiv.field_fuel')} value={`${selected.fuel_level}%`} />
              <Field label={t('archiv.field_battery')} value={`${selected.condition_data?.battery ?? '—'}%`} />
            </Section>

            {/* Bemerkungen */}
            {selected.remarks && (
              <Section title={t('archiv.section_remarks')}>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.remarks}</p>
              </Section>
            )}

            {/* Schäden */}
            {(selected.condition_data?.damage_records?.length ?? 0) > 0 && (
              <Section title={t('archiv.section_damages', { count: selected.condition_data.damage_records.length })}>
                {selected.condition_data.damage_records.map((d, i) => (
                  <div key={i} className="text-sm text-gray-700 py-1.5 border-b border-gray-200 last:border-0">
                    <span className="font-medium">{t(`damage.positions.${d.pos}`, { defaultValue: d.pos })}</span>
                    <span className="text-gray-500"> — {t(`damage.types.${d.type}`, { defaultValue: d.type })}, {t(`damage.intensities.${d.int}`, { defaultValue: d.int })}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Fotos */}
            {Object.keys(selected.condition_data?.photos ?? {}).filter(k => k !== 'signature').length > 0 && (
              <Section title={t('archiv.section_photos')}>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(selected.condition_data.photos)
                    .filter(([key]) => key !== 'signature')
                    .map(([key, url]) => (
                      <div key={key}>
                        <img
                          src={url}
                          alt={key}
                          className="w-full h-28 object-cover rounded-lg"
                          loading="lazy"
                        />
                        <p className="text-xs text-gray-500 text-center mt-1 capitalize">{key}</p>
                      </div>
                    ))}
                </div>
              </Section>
            )}

            {/* PDF */}
            <div className="flex justify-center pt-2">
              <PdfButton
                data={toPdfData(selected)}
                accent={selected.protocol_type === 'annahme' ? 'brand' : 'green'}
              />
            </div>

            {/* Bearbeiten */}
            <button
              onClick={() => {
                const route = selected.protocol_type === 'annahme' ? '/annahme' : '/ueberfuehrung'
                const cd = selected.condition_data
                navigate(route, {
                  state: {
                    vehicle_id: selected.vehicle_id,
                    license_plate: selected.vehicles?.license_plate ?? '',
                    brand_model: selected.vehicles?.brand_model ?? '',
                    vin: selected.vehicles?.vin ?? '',
                    known_damages: cd?.damage_records ?? [],
                    edit: {
                      protocol_id: selected.id,
                      inspector_name: selected.inspector_name,
                      location: selected.location,
                      conditions: cd?.conditions ?? [],
                      fuel: selected.fuel_level,
                      battery: cd?.battery ?? 0,
                      odometer: selected.odometer,
                      remarks: selected.remarks,
                      checkliste: cd?.checkliste,
                      damages: cd?.damage_records ?? [],
                      photos: cd?.photos ?? {},
                      receiver_name: cd?.receiver_name,
                      transfer_type: cd?.transfer_type,
                    },
                  },
                })
              }}
              className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium active:bg-gray-200"
            >
              {t('archiv.edit_protocol')}
            </button>

            {/* Quick-links: neues Protokoll für dieses Fahrzeug */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => navigate('/annahme', {
                  state: {
                    vehicle_id: selected.vehicle_id,
                    license_plate: selected.vehicles?.license_plate,
                    brand_model: selected.vehicles?.brand_model,
                    vin: selected.vehicles?.vin,
                  },
                })}
                className="flex-1 py-2.5 rounded-xl border border-brand-500 text-brand-600 text-sm font-medium active:bg-brand-50"
              >
                {t('archiv.new_intake')}
              </button>
              <button
                onClick={() => navigate('/ueberfuehrung', {
                  state: {
                    vehicle_id: selected.vehicle_id,
                    license_plate: selected.vehicles?.license_plate,
                    brand_model: selected.vehicles?.brand_model,
                    vin: selected.vehicles?.vin,
                    known_damages: selected.condition_data?.damage_records ?? [],
                  },
                })}
                className="flex-1 py-2.5 rounded-xl border border-green-500 text-green-600 text-sm font-medium active:bg-green-50"
              >
                {t('archiv.new_transfer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Sheet ─────────────────────────────────────────────── */}
      {deleteId != null && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-t-2xl pt-6 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
            <p className="text-base font-semibold text-gray-800 mb-1">{t('archiv.delete_title')}</p>
            <p className="text-sm text-gray-500 mb-5">
              {t('archiv.delete_body')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium active:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-medium active:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t('archiv.deleting') : t('archiv.delete_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-200 last:border-0 gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-800 text-right break-all">{value || '—'}</span>
    </div>
  )
}
