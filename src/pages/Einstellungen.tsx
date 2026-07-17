import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Globe, GraduationCap, ChevronRight, Info, LogOut, Scale, Lock,
  UploadCloud, CheckCircle2, Archive, Folder, KeyRound, ChevronUp,
  ChevronDown, Copy, Eraser,
} from 'lucide-react'
import { logout, changePin } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { syncOffline, getPendingOffline } from '../lib/protocols'
import { TUTORIAL_EVENT } from '../components/OnboardingOverlay'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProtocolRow {
  id: number
  vehicle_id: string
  protocol_type: string
  inspection_date: string
  inspector_name: string
  condition_data: Record<string, unknown> | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Einstellungen() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const isEN = i18n.language.startsWith('en')
  const [activeTab, setActiveTab] = useState<'einstellungen' | 'verwaltung'>('einstellungen')

  // ── PIN ──────────────────────────────────────────────────────────────────
  const [pinSection, setPinSection] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Duplikate ────────────────────────────────────────────────────────────
  const [dupSection, setDupSection] = useState(false)
  const [dupSearching, setDupSearching] = useState(false)
  const [dupIds, setDupIds] = useState<number[] | null>(null)
  const [dupDeleting, setDupDeleting] = useState(false)
  const [dupMsg, setDupMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Leere Beiträge ───────────────────────────────────────────────────────
  const [emptySection, setEmptySection] = useState(false)
  const [emptySearching, setEmptySearching] = useState(false)
  const [emptyRows, setEmptyRows] = useState<ProtocolRow[] | null>(null)
  const [emptyDeleting, setEmptyDeleting] = useState(false)
  const [emptyMsg, setEmptyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // ── Offline-Sync ─────────────────────────────────────────────────────────
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    getPendingOffline().then(p => setPendingCount(p.length))
  }, [])

  async function handleSync() {
    setSyncing(true)
    try { await syncOffline() }
    finally {
      setSyncing(false)
      const p = await getPendingOffline()
      setPendingCount(p.length)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handlePinChange(e: React.FormEvent) {
    e.preventDefault()
    setPinMsg(null)
    if (newPin.length < 4) {
      setPinMsg({ ok: false, text: t('settings.pin_min_length') })
      return
    }
    if (newPin !== confirmPin) {
      setPinMsg({ ok: false, text: t('settings.pin_mismatch') })
      return
    }
    const ok = changePin(currentPin, newPin)
    if (ok) {
      setPinMsg({ ok: true, text: t('settings.pin_success') })
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setPinSection(false)
    } else {
      setPinMsg({ ok: false, text: t('settings.pin_wrong') })
    }
  }

  // ── Duplikate: Suche ─────────────────────────────────────────────────────
  async function findDuplicates() {
    setDupSearching(true)
    setDupIds(null)
    setDupMsg(null)
    try {
      const { data, error } = await supabase
        .from('protocols')
        .select('id, vehicle_id, protocol_type, inspection_date, inspector_name')
        .order('id', { ascending: true })
      if (error) throw error

      const groups: Record<string, { id: number }[]> = {}
      for (const p of data ?? []) {
        const dateKey = (p.inspection_date ?? '').slice(0, 10)
        const key = `${p.vehicle_id}_${p.protocol_type}_${dateKey}`
        if (!groups[key]) groups[key] = []
        groups[key].push({ id: p.id })
      }

      const toDelete: number[] = []
      for (const group of Object.values(groups)) {
        if (group.length > 1) {
          const sorted = [...group].sort((a, b) => b.id - a.id)
          toDelete.push(...sorted.slice(1).map((p) => p.id))
        }
      }
      setDupIds(toDelete)
      if (toDelete.length === 0) {
        setDupMsg({ ok: true, text: t('settings.dup_none') })
      }
    } catch (err: unknown) {
      setDupMsg({ ok: false, text: err instanceof Error ? err.message : t('settings.dup_search_error') })
    } finally {
      setDupSearching(false)
    }
  }

  async function deleteDuplicates() {
    if (!dupIds?.length) return
    setDupDeleting(true)
    try {
      const { error } = await supabase.from('protocols').delete().in('id', dupIds)
      if (error) throw error
      setDupMsg({
        ok: true,
        text: t(dupIds.length === 1 ? 'settings.dup_deleted_one' : 'settings.dup_deleted_other', { count: dupIds.length }),
      })
      setDupIds(null)
    } catch (err: unknown) {
      setDupMsg({ ok: false, text: err instanceof Error ? err.message : t('settings.dup_error') })
    } finally {
      setDupDeleting(false)
    }
  }

  // ── Leere Beiträge: Suche ────────────────────────────────────────────────
  async function findEmptyProtocols() {
    setEmptySearching(true)
    setEmptyRows(null)
    setEmptyMsg(null)
    try {
      const { data, error } = await supabase
        .from('protocols')
        .select('id, vehicle_id, protocol_type, inspection_date, inspector_name, condition_data')
        .eq('status', 'draft')
        .order('id', { ascending: true })
      if (error) throw error

      const empty = (data ?? []).filter((p) => {
        const cd = p.condition_data as Record<string, unknown> | null
        if (!cd) return true
        const photos = cd.photos as Record<string, string> | undefined
        const damages = cd.damage_records as unknown[] | undefined
        const conditions = cd.conditions as unknown[] | undefined
        const checkliste = cd.checkliste as Record<string, boolean> | undefined
        const hasPhotos = photos && Object.keys(photos).length > 0
        const hasDamages = damages && damages.length > 0
        const hasConditions = conditions && conditions.length > 0
        const hasCheckliste = checkliste && Object.values(checkliste).some(Boolean)
        return !hasPhotos && !hasDamages && !hasConditions && !hasCheckliste
      }) as ProtocolRow[]

      setEmptyRows(empty)
      if (empty.length === 0) {
        setEmptyMsg({ ok: true, text: t('settings.empty_none') })
      }
    } catch (err: unknown) {
      setEmptyMsg({ ok: false, text: err instanceof Error ? err.message : t('settings.empty_search_error') })
    } finally {
      setEmptySearching(false)
    }
  }

  async function deleteEmptyProtocols() {
    if (!emptyRows?.length) return
    setEmptyDeleting(true)
    const ids = emptyRows.map((r) => r.id)
    try {
      const { error } = await supabase.from('protocols').delete().in('id', ids)
      if (error) throw error
      setEmptyMsg({
        ok: true,
        text: t(ids.length === 1 ? 'settings.empty_deleted_one' : 'settings.empty_deleted_other', { count: ids.length }),
      })
      setEmptyRows(null)
    } catch (err: unknown) {
      setEmptyMsg({ ok: false, text: err instanceof Error ? err.message : t('settings.empty_error') })
    } finally {
      setEmptyDeleting(false)
    }
  }

  return (
    <div className="block min-h-full bg-gray-50 pb-[calc(1rem+4rem+env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-10 bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo.webp" alt="" className="w-6 h-6 object-contain flex-shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
            <h1 className="text-lg font-bold text-gray-800">{t('nav.settings')}</h1>
          </div>
        </div>
        {/* Sub-Tab Bar */}
        <div className="border-b border-gray-200 flex">
        <button
          type="button"
          onClick={() => setActiveTab('einstellungen')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'einstellungen'
              ? 'text-brand-600 border-brand-600'
              : 'text-gray-500 border-transparent'
          }`}
        >
          {t('settings.tab_settings')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('verwaltung')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'verwaltung'
              ? 'text-brand-600 border-brand-600'
              : 'text-gray-500 border-transparent'
          }`}
        >
          {t('settings.tab_admin')}
        </button>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto w-full">
        {/* ── Tab: Einstellungen ── */}
        {activeTab === 'einstellungen' && (
          <>
            {/* Sprache / Language */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <Globe size={22} className="text-gray-400" />
                <span className="font-semibold text-gray-800">{t('settings.language_title')} / Language</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage('de')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    !isEN
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  DE
                </button>
                <button
                  type="button"
                  onClick={() => i18n.changeLanguage('en')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                    isEN
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Tutorial */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent(TUTORIAL_EVENT))}
                className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 active:scale-95 transition-all"
              >
                <GraduationCap size={22} className="text-gray-400" />
                <div>
                  <span className="font-semibold text-gray-800">{t('settings.tutorial_title')}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{t('settings.tutorial_desc')}</p>
                </div>
                <ChevronRight size={16} className="ml-auto text-gray-400" />
              </button>
            </div>

            {/* App-Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <Info size={22} className="text-gray-400" />
                <span className="font-semibold text-gray-800">{t('settings.app_info_title')}</span>
              </div>
              <div className="flex flex-col gap-1.5 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.app_label')}</span>
                  <span>Fahrzeug-Protokolle v2</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.version_label')}</span>
                  <span>1.7.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.operator_label')}</span>
                  <span>CarHandling</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.stack_label')}</span>
                  <span>React + Supabase + PWA</span>
                </div>
              </div>
            </div>

            {/* Abmelden */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-4 text-red-600 font-semibold hover:bg-red-50 active:scale-95 transition-all"
              >
                <LogOut size={22} />
                <span>{t('settings.logout')}</span>
              </button>
            </div>

            {/* Rechtliches */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <a
                href="/impressum"
                className="flex items-center gap-3 px-4 py-4 text-gray-600 hover:bg-gray-50 border-b border-gray-100"
              >
                <Scale size={22} className="text-gray-400" />
                <span className="font-medium">{t('settings.impressum')}</span>
                <ChevronRight size={16} className="ml-auto text-gray-400" />
              </a>
              <a
                href="/datenschutz"
                className="flex items-center gap-3 px-4 py-4 text-gray-600 hover:bg-gray-50"
              >
                <Lock size={22} className="text-gray-400" />
                <span className="font-medium">{t('settings.privacy')}</span>
                <ChevronRight size={16} className="ml-auto text-gray-400" />
              </a>
            </div>
          </>
        )}

        {/* ── Tab: Verwaltung ── */}
        {activeTab === 'verwaltung' && (
          <>
            {/* Offline synchronisieren */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 px-4 py-4">
              <div className="flex items-center gap-3 mb-3">
                <UploadCloud size={22} className="text-gray-400" />
                <div>
                  <span className="font-semibold text-gray-800">{t('settings.sync_title')}</span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {pendingCount > 0
                      ? t(pendingCount === 1 ? 'settings.sync_pending_one' : 'settings.sync_pending_other', { count: pendingCount })
                      : t('settings.sync_done')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing || pendingCount === 0}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                  pendingCount > 0 && !syncing
                    ? 'bg-brand-600 text-white hover:bg-brand-700 active:scale-95'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {syncing
                  ? t('settings.syncing')
                  : pendingCount > 0
                  ? t('settings.sync_button')
                  : <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={16} /> {t('settings.sync_done')}</span>}
              </button>
            </div>

            {/* Archiv */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <a
                href="/archiv"
                className="w-full flex items-center gap-3 px-4 py-4 text-left"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Archive size={22} className="text-gray-400" />
                  <div>
                    <span className="font-semibold text-gray-800">{t('settings.archive_title')}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{t('settings.archive_desc')}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </a>
            </div>

            {/* Projektverwaltung */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <a
                href="/fahrzeuge"
                className="w-full flex items-center gap-3 px-4 py-4 text-left"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Folder size={22} className="text-gray-400" />
                  <div>
                    <span className="font-semibold text-gray-800">{t('settings.project_mgmt_title')}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{t('settings.project_mgmt_desc')}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400" />
              </a>
            </div>

            {/* PIN ändern */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-4 text-left"
                onClick={() => { setPinSection(v => !v); setPinMsg(null) }}
              >
                <div className="flex items-center gap-3">
                  <KeyRound size={22} className="text-gray-400" />
                  <span className="font-semibold text-gray-800">{t('settings.pin_title')}</span>
                </div>
                <span className="text-gray-400">{pinSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>

              {pinSection && (
                <form onSubmit={handlePinChange} className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder={t('settings.pin_current')}
                    value={currentPin}
                    onChange={e => setCurrentPin(e.target.value)}
                    className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoComplete="current-password"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder={t('settings.pin_new')}
                    value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoComplete="new-password"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder={t('settings.pin_confirm')}
                    value={confirmPin}
                    onChange={e => setConfirmPin(e.target.value)}
                    className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                    autoComplete="new-password"
                  />
                  {pinMsg && (
                    <p className={`text-sm font-medium ${pinMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {pinMsg.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 active:scale-95 transition-all"
                  >
                    {t('settings.pin_save')}
                  </button>
                </form>
              )}
            </div>

            {/* Duplikate bereinigen */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-4 text-left"
                onClick={() => { setDupSection(v => !v); setDupMsg(null); setDupIds(null) }}
              >
                <div className="flex items-center gap-3">
                  <Copy size={22} className="text-gray-400" />
                  <div>
                    <span className="font-semibold text-gray-800">{t('settings.dup_title')}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{t('settings.dup_desc')}</p>
                  </div>
                </div>
                <span className="text-gray-400">{dupSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>

              {dupSection && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-sm text-gray-500">{t('settings.dup_hint')}</p>
                  <button
                    type="button"
                    onClick={findDuplicates}
                    disabled={dupSearching}
                    className="w-full py-3 rounded-xl border border-brand-300 text-brand-700 font-medium text-sm active:bg-brand-50 disabled:opacity-50"
                  >
                    {dupSearching ? t('settings.dup_searching') : t('settings.dup_search')}
                  </button>
                  {dupMsg && (
                    <p className={`text-sm font-medium ${dupMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {dupMsg.text}
                    </p>
                  )}
                  {dupIds && dupIds.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                      <p className="text-sm text-amber-800 font-medium">
                        {t(dupIds.length === 1 ? 'settings.dup_found_one' : 'settings.dup_found_other', { count: dupIds.length, ids: dupIds.join(', ') })}
                      </p>
                      <p className="text-xs text-amber-700">{t('settings.dup_irreversible')}</p>
                      <button
                        type="button"
                        onClick={deleteDuplicates}
                        disabled={dupDeleting}
                        className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60"
                      >
                        {dupDeleting ? t('settings.dup_deleting') : t(dupIds.length === 1 ? 'settings.dup_delete_one' : 'settings.dup_delete_other', { count: dupIds.length })}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Leere Beiträge bereinigen */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-4 text-left"
                onClick={() => { setEmptySection(v => !v); setEmptyMsg(null); setEmptyRows(null) }}
              >
                <div className="flex items-center gap-3">
                  <Eraser size={22} className="text-gray-400" />
                  <div>
                    <span className="font-semibold text-gray-800">{t('settings.empty_title')}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{t('settings.empty_desc')}</p>
                  </div>
                </div>
                <span className="text-gray-400">{emptySection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>

              {emptySection && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
                  <p className="text-sm text-gray-500">{t('settings.empty_hint')}</p>
                  <button
                    type="button"
                    onClick={findEmptyProtocols}
                    disabled={emptySearching}
                    className="w-full py-3 rounded-xl border border-brand-300 text-brand-700 font-medium text-sm active:bg-brand-50 disabled:opacity-50"
                  >
                    {emptySearching ? t('settings.empty_searching') : t('settings.empty_search')}
                  </button>
                  {emptyMsg && (
                    <p className={`text-sm font-medium ${emptyMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {emptyMsg.text}
                    </p>
                  )}
                  {emptyRows && emptyRows.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                      <p className="text-sm text-amber-800 font-medium">
                        {t(emptyRows.length === 1 ? 'settings.empty_found_one' : 'settings.empty_found_other', { count: emptyRows.length })}
                      </p>
                      <ul className="space-y-1">
                        {emptyRows.map((r) => (
                          <li key={r.id} className="text-xs text-amber-700">
                            #{r.id} — {r.protocol_type === 'transfer' ? t('protocol_type.transfer') : t('protocol_type.intake')},{' '}
                            {r.inspector_name || t('settings.no_name')},{' '}
                            {r.inspection_date?.slice(0, 10) ?? '—'}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-amber-700">{t('settings.empty_irreversible')}</p>
                      <button
                        type="button"
                        onClick={deleteEmptyProtocols}
                        disabled={emptyDeleting}
                        className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60"
                      >
                        {emptyDeleting
                          ? t('settings.empty_deleting')
                          : t(emptyRows.length === 1 ? 'settings.empty_delete_one' : 'settings.empty_delete_other', { count: emptyRows.length })}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
