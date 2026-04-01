import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PdfButton from '../components/PdfButton'
import type { PdfData } from '../lib/generatePdf'
import { DEFAULT_CHECKLISTE, type ProtocolConditionData } from '../lib/protocols'
import { SkeletonList } from '../components/Skeleton'

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
  vehicle_id: number
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('protocols')
        .select('*, vehicles(license_plate, brand_model, vin)')
        .order('inspection_date', { ascending: false })
      if (err) throw err
      setProtocols((data ?? []) as ProtocolRow[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete() {
    if (deleteId == null) return
    setDeleting(true)
    try {
      const { error: err } = await supabase
        .from('protocols')
        .delete()
        .eq('id', deleteId)
      if (err) throw err
      setProtocols(prev => prev.filter(p => p.id !== deleteId))
      if (selected?.id === deleteId) setSelected(null)
      setDeleteId(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Fehler beim Löschen')
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
      const date = formatDate(p.inspection_date)
      if (!plate.includes(q) && !name.includes(q) && !date.includes(q)) return false
    }
    return true
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-800 mb-3">Archiv & Verwaltung</h1>

        {/* Search */}
        <input
          type="text"
          placeholder="Kennzeichen, Name, Datum…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2"
        />

        {/* Type filter pills */}
        <div className="flex gap-2 mb-2">
          {(['all', 'annahme', 'transfer'] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterType === t
                  ? t === 'annahme'
                    ? 'bg-brand-600 text-white border-brand-600'
                    : t === 'transfer'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-gray-700 text-white border-gray-700'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {t === 'all' ? 'Alle' : t === 'annahme' ? 'Annahme' : 'Überführung'}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-gray-400 mb-0.5 block">Von</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-gray-400 mb-0.5 block">Bis</label>
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
      </div>

      {/* Count */}
      {!loading && !error && (
        <div className="px-4 pt-2 pb-0">
          <p className="text-xs text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'Protokoll' : 'Protokolle'}
          </p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <SkeletonList count={6} />}
        {error && (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={load}
              className="text-sm text-brand-600 underline"
            >
              Erneut versuchen
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-12">Keine Protokolle gefunden</p>
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
                  {p.protocol_type === 'annahme' ? 'Annahme' : 'Überführung'}
                </span>
                {p.status === 'draft' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Entwurf
                  </span>
                )}
                <p className="text-xs text-gray-400">{formatDate(p.inspection_date)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Detail Modal ────────────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          {/* Modal Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white sticky top-0">
            <button
              onClick={() => setSelected(null)}
              className="p-1 rounded-lg text-gray-500 active:bg-gray-100"
              aria-label="Zurück"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-800 truncate">
                {selected.vehicles?.license_plate ?? '—'}
              </p>
              <p className="text-xs text-gray-500">{formatDate(selected.inspection_date)}</p>
            </div>
            <button
              onClick={() => setDeleteId(selected.id)}
              className="p-1 rounded-lg text-red-500 active:bg-red-50"
              aria-label="Protokoll löschen"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Type + Status badges */}
            <div className="flex gap-2 flex-wrap">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                selected.protocol_type === 'annahme'
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {selected.protocol_type === 'annahme' ? 'Annahme' : 'Überführung'}
              </span>
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                selected.status === 'final'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {selected.status === 'final' ? 'Abgeschlossen' : 'Entwurf'}
              </span>
            </div>

            {/* Basisdaten */}
            <Section title="Basisdaten">
              <Field label="Kennzeichen" value={selected.vehicles?.license_plate ?? '—'} />
              <Field label="Marke / Modell" value={selected.vehicles?.brand_model ?? '—'} />
              <Field label="VIN" value={selected.vehicles?.vin ?? '—'} />
              <Field label="Ersteller" value={selected.inspector_name} />
              <Field label="Standort / Route" value={selected.location} />
              <Field label="KM-Stand" value={`${selected.odometer.toLocaleString('de-DE')} km`} />
              <Field label="Datum" value={formatDate(selected.inspection_date)} />
            </Section>

            {/* Technik */}
            <Section title="Technik & Betriebsstoffe">
              <Field label="Kraftstoff" value={`${selected.fuel_level}%`} />
              <Field label="Batterie" value={`${selected.condition_data?.battery ?? '—'}%`} />
            </Section>

            {/* Bemerkungen */}
            {selected.remarks && (
              <Section title="Bemerkungen">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.remarks}</p>
              </Section>
            )}

            {/* Schäden */}
            {(selected.condition_data?.damage_records?.length ?? 0) > 0 && (
              <Section title={`Schäden (${selected.condition_data.damage_records.length})`}>
                {selected.condition_data.damage_records.map((d, i) => (
                  <div key={i} className="text-sm text-gray-700 py-1.5 border-b border-gray-200 last:border-0">
                    <span className="font-medium">{d.pos}</span>
                    <span className="text-gray-500"> — {d.type}, {d.int}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Fotos */}
            {Object.keys(selected.condition_data?.photos ?? {}).filter(k => k !== 'signature').length > 0 && (
              <Section title="Fotos">
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

            {/* Quick-links: neues Protokoll für dieses Fahrzeug */}
            <div className="flex gap-2 pb-6">
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
                + Annahme
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
                + Überführung
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Sheet ─────────────────────────────────────────────── */}
      {deleteId != null && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-t-2xl p-6 shadow-xl">
            <p className="text-base font-semibold text-gray-800 mb-1">Protokoll löschen?</p>
            <p className="text-sm text-gray-500 mb-5">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium active:bg-gray-50 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-medium active:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Lösche…' : 'Löschen'}
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
