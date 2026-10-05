import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Globe, GraduationCap, ChevronRight, LogOut, Scale, Lock,
  UploadCloud, CheckCircle2, Archive, Folder, KeyRound, ChevronUp,
  ChevronDown, Copy, Eraser, RefreshCw,
} from 'lucide-react'
import { logout, changePin } from '../lib/auth'
import { supabase, errorText } from '../lib/supabase'
import { syncOffline, getPendingOffline } from '../lib/protocols'
import PageHeader from '../components/PageHeader'
import { TUTORIAL_EVENT } from '../components/OnboardingOverlay'
import LanguageToggle from '../components/LanguageToggle'

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
  const { t } = useTranslation()

  // ── App-Update ───────────────────────────────────────────────────────────
  const [checking, setChecking] = useState(false)

  /**
   * Holt den Service Worker neu, wirft die Caches weg und lädt die App neu.
   * Der UpdateBanner meldet sich nur, wenn der Browser von selbst ein Update
   * bemerkt — hierüber lässt es sich manuell anstoßen.
   */
  async function checkForUpdate() {
    setChecking(true)
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        await reg?.update()
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } finally {
      window.location.reload()
    }
  }

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
      setDupMsg({ ok: false, text: errorText(err, t('settings.dup_search_error')) })
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
      setDupMsg({ ok: false, text: errorText(err, t('settings.dup_error')) })
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
      setEmptyMsg({ ok: false, text: errorText(err, t('settings.empty_search_error')) })
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
      setEmptyMsg({ ok: false, text: errorText(err, t('settings.empty_error')) })
    } finally {
      setEmptyDeleting(false)
    }
  }

  return (
    <div className="block min-h-full bg-gray-100 pb-8">
      <PageHeader title={t('nav.settings')} />

      <div className="px-4 pt-4 max-w-lg mx-auto w-full flex flex-col gap-3">
        {/* ── Daten ── */}
        <Group>
          <Row
            to="/archiv"
            icon={<Archive size={20} />}
            tone="brand"
            title={t('settings.archive_title')}
            desc={t('settings.archive_desc')}
          />
          <Row
            to="/fahrzeuge"
            icon={<Folder size={20} />}
            title={t('settings.project_mgmt_title')}
            desc={t('settings.project_mgmt_desc')}
          />
        </Group>

        {/* ── Offline-Synchronisierung ── */}
        <Group>
          <div className="flex items-center gap-3 px-4 py-3">
            <Tile tone={pendingCount > 0 ? 'amber' : 'green'}>
              {pendingCount > 0 ? <UploadCloud size={20} /> : <CheckCircle2 size={20} />}
            </Tile>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-gray-900">{t('settings.sync_title')}</p>
              <p className="text-[13px] font-semibold text-gray-600">
                {pendingCount > 0
                  ? t(pendingCount === 1 ? 'settings.sync_pending_one' : 'settings.sync_pending_other', { count: pendingCount })
                  : t('settings.sync_done')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || pendingCount === 0}
              className="h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-[13px] font-bold text-gray-900 disabled:opacity-40"
            >
              {syncing ? t('settings.syncing') : t('settings.sync_now')}
            </button>
          </div>
        </Group>

        {/* ── App ── */}
        <Group>
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Tile><Globe size={20} /></Tile>
            <span className="flex-1 text-[15px] font-bold text-gray-900">{t('settings.language_title')}</span>
            <LanguageToggle />
          </div>
          <Row
            onClick={() => { setPinSection(v => !v); setPinMsg(null) }}
            icon={<KeyRound size={20} />}
            title={t('settings.pin_title')}
            expanded={pinSection}
          />
              {pinSection && (
                <form onSubmit={handlePinChange} className="px-4 pb-4 flex flex-col gap-3 pt-1">
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
                    className="w-full py-3 rounded-xl bg-brand-700 text-white font-semibold hover:bg-brand-800 active:scale-95 transition-all"
                  >
                    {t('settings.pin_save')}
                  </button>
                </form>
              )}
          <Row
            onClick={() => window.dispatchEvent(new CustomEvent(TUTORIAL_EVENT))}
            icon={<GraduationCap size={20} />}
            title={t('settings.tutorial_title')}
            desc={t('settings.tutorial_desc')}
          />
        </Group>

        {/* ── Wartung: selten gebraucht, deshalb unten ── */}
        <h2 className="px-1 pt-2 text-xs font-extrabold tracking-wider uppercase text-gray-500">{t('settings.tab_admin')}</h2>
        <Group>
          <Row
            onClick={() => { setDupSection(v => !v); setDupMsg(null); setDupIds(null) }}
            icon={<Copy size={20} />}
            title={t('settings.dup_title')}
            desc={t('settings.dup_desc')}
            expanded={dupSection}
          />
              {dupSection && (
                <div className="px-4 pb-4 pt-1 space-y-3">
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
          <Row
            onClick={() => { setEmptySection(v => !v); setEmptyMsg(null); setEmptyRows(null) }}
            icon={<Eraser size={20} />}
            title={t('settings.empty_title')}
            desc={t('settings.empty_desc')}
            expanded={emptySection}
          />
              {emptySection && (
                <div className="px-4 pb-4 pt-1 space-y-3">
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
        </Group>

        {/* ── Rechtliches ── */}
        <Group>
          <Row to="/impressum" icon={<Scale size={20} />} title={t('settings.impressum')} />
          <Row to="/datenschutz" icon={<Lock size={20} />} title={t('settings.privacy')} />
        </Group>

        <button
          type="button"
          onClick={handleLogout}
          className="min-h-[52px] rounded-2xl bg-white text-brand-700 text-[15px] font-extrabold flex items-center justify-center gap-2 active:bg-gray-50"
        >
          <LogOut size={18} /> {t('settings.logout')}
        </button>

        {/* App-Info: klein, unten – gebraucht wird sie selten, dann aber zum Nachsehen. */}
        <div className="flex flex-col items-center gap-1 pt-2 text-xs font-semibold text-gray-500">
          <span>Fahrzeug-Protokolle v2 · {t('settings.version_label')} {__APP_VERSION__} · CarHandling</span>
          <button
            type="button"
            onClick={checkForUpdate}
            disabled={checking}
            className="min-h-[44px] px-3 inline-flex items-center gap-1.5 text-brand-700 font-bold disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {t('settings.check_update')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bausteine der Liste
// ─────────────────────────────────────────────────────────────────────────────

const TONES = {
  gray: 'bg-gray-100 text-gray-700',
  brand: 'bg-brand-100 text-brand-800',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
} as const

/** Symbol in einer kleinen Kachel – wie im Entwurf. */
function Tile({ children, tone = 'gray' }: { children: React.ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Weiße Gruppe; die Zeilen darin trennt eine feine Linie. */
function Group({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl overflow-hidden divide-y divide-gray-100">{children}</div>
}

/**
 * Eine Zeile: Link (`to`) oder Knopf (`onClick`). Mit `expanded` klappt sie
 * auf – der Inhalt folgt dann als nächstes Kind der Gruppe.
 */
function Row({ to, onClick, icon, tone, title, desc, expanded }: {
  to?: string
  onClick?: () => void
  icon: React.ReactNode
  tone?: keyof typeof TONES
  title: string
  desc?: string
  expanded?: boolean
}) {
  const body = (
    <>
      <Tile tone={tone}>{icon}</Tile>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-bold text-gray-900">{title}</span>
        {desc && <span className="text-[13px] font-semibold text-gray-600">{desc}</span>}
      </span>
      {expanded === undefined
        ? <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
        : expanded
          ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
    </>
  )
  const cls = 'w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left active:bg-gray-50'
  return to
    ? <Link to={to} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} aria-expanded={expanded} className={cls}>{body}</button>
}
