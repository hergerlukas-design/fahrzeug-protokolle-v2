import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout, changePin } from '../lib/auth'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProtocolRow {
  id: number
  vehicle_id: number
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

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function handlePinChange(e: React.FormEvent) {
    e.preventDefault()
    setPinMsg(null)
    if (newPin.length < 4) {
      setPinMsg({ ok: false, text: 'Neuer PIN muss mindestens 4 Zeichen haben.' })
      return
    }
    if (newPin !== confirmPin) {
      setPinMsg({ ok: false, text: 'Neuer PIN und Bestätigung stimmen nicht überein.' })
      return
    }
    const ok = changePin(currentPin, newPin)
    if (ok) {
      setPinMsg({ ok: true, text: 'PIN erfolgreich geändert.' })
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setPinSection(false)
    } else {
      setPinMsg({ ok: false, text: 'Aktueller PIN ist falsch.' })
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

      // Gruppe: vehicle_id + protocol_type + Datum (YYYY-MM-DD)
      const groups: Record<string, { id: number }[]> = {}
      for (const p of data ?? []) {
        const dateKey = (p.inspection_date ?? '').slice(0, 10)
        const key = `${p.vehicle_id}_${p.protocol_type}_${dateKey}`
        if (!groups[key]) groups[key] = []
        groups[key].push({ id: p.id })
      }

      // Älteste behalten (höchste ID = neueste), Rest als Duplikat markieren
      const toDelete: number[] = []
      for (const group of Object.values(groups)) {
        if (group.length > 1) {
          const sorted = [...group].sort((a, b) => b.id - a.id)
          toDelete.push(...sorted.slice(1).map((p) => p.id))
        }
      }
      setDupIds(toDelete)
      if (toDelete.length === 0) {
        setDupMsg({ ok: true, text: 'Keine Duplikate gefunden.' })
      }
    } catch (err: unknown) {
      setDupMsg({ ok: false, text: err instanceof Error ? err.message : 'Fehler bei der Suche.' })
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
        text: `${dupIds.length} Duplikat${dupIds.length !== 1 ? 'e' : ''} gelöscht.`,
      })
      setDupIds(null)
    } catch (err: unknown) {
      setDupMsg({ ok: false, text: err instanceof Error ? err.message : 'Fehler beim Löschen.' })
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
        setEmptyMsg({ ok: true, text: 'Keine leeren Entwürfe gefunden.' })
      }
    } catch (err: unknown) {
      setEmptyMsg({ ok: false, text: err instanceof Error ? err.message : 'Fehler bei der Suche.' })
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
        text: `${ids.length} leere${ids.length !== 1 ? ' Entwürfe' : 'r Entwurf'} gelöscht.`,
      })
      setEmptyRows(null)
    } catch (err: unknown) {
      setEmptyMsg({ ok: false, text: err instanceof Error ? err.message : 'Fehler beim Löschen.' })
    } finally {
      setEmptyDeleting(false)
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-800 mb-6">Einstellungen</h1>

      {/* PIN ändern */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-4 text-left"
          onClick={() => { setPinSection(v => !v); setPinMsg(null) }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔑</span>
            <span className="font-semibold text-gray-800">PIN ändern</span>
          </div>
          <span className="text-gray-400 text-sm">{pinSection ? '▲' : '▼'}</span>
        </button>

        {pinSection && (
          <form onSubmit={handlePinChange} className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
            <input
              type="password"
              inputMode="numeric"
              placeholder="Aktueller PIN"
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value)}
              className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoComplete="current-password"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Neuer PIN"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              className="border border-gray-300 rounded-xl px-4 py-3 text-lg tracking-widest w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoComplete="new-password"
            />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Neuer PIN bestätigen"
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
              PIN speichern
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
            <span className="text-2xl">🔁</span>
            <div>
              <span className="font-semibold text-gray-800">Duplikate bereinigen</span>
              <p className="text-xs text-gray-400 mt-0.5">Doppelte Protokolle finden und löschen</p>
            </div>
          </div>
          <span className="text-gray-400 text-sm">{dupSection ? '▲' : '▼'}</span>
        </button>

        {dupSection && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm text-gray-500">
              Sucht Protokolle mit gleicher Fahrzeug-ID, gleichem Protokolltyp und gleichem Datum.
              Bei Duplikaten wird jeweils der neueste Eintrag behalten.
            </p>

            <button
              type="button"
              onClick={findDuplicates}
              disabled={dupSearching}
              className="w-full py-3 rounded-xl border border-brand-300 text-brand-700 font-medium text-sm active:bg-brand-50 disabled:opacity-50"
            >
              {dupSearching ? 'Suche läuft …' : '🔍 Duplikate suchen'}
            </button>

            {dupMsg && (
              <p className={`text-sm font-medium ${dupMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {dupMsg.text}
              </p>
            )}

            {dupIds && dupIds.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                <p className="text-sm text-amber-800 font-medium">
                  {dupIds.length} Duplikat{dupIds.length !== 1 ? 'e' : ''} gefunden (IDs: {dupIds.join(', ')})
                </p>
                <p className="text-xs text-amber-700">
                  Diese Einträge werden unwiderruflich gelöscht.
                </p>
                <button
                  type="button"
                  onClick={deleteDuplicates}
                  disabled={dupDeleting}
                  className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60"
                >
                  {dupDeleting ? 'Lösche …' : `🗑 ${dupIds.length} Duplikat${dupIds.length !== 1 ? 'e' : ''} löschen`}
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
            <span className="text-2xl">🧹</span>
            <div>
              <span className="font-semibold text-gray-800">Leere Beiträge bereinigen</span>
              <p className="text-xs text-gray-400 mt-0.5">Leere Entwürfe ohne Inhalt löschen</p>
            </div>
          </div>
          <span className="text-gray-400 text-sm">{emptySection ? '▲' : '▼'}</span>
        </button>

        {emptySection && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm text-gray-500">
              Sucht Protokolle im Status "Entwurf" ohne Fotos, Schäden, Checkliste oder Bedingungen.
            </p>

            <button
              type="button"
              onClick={findEmptyProtocols}
              disabled={emptySearching}
              className="w-full py-3 rounded-xl border border-brand-300 text-brand-700 font-medium text-sm active:bg-brand-50 disabled:opacity-50"
            >
              {emptySearching ? 'Suche läuft …' : '🔍 Leere Entwürfe suchen'}
            </button>

            {emptyMsg && (
              <p className={`text-sm font-medium ${emptyMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {emptyMsg.text}
              </p>
            )}

            {emptyRows && emptyRows.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-3">
                <p className="text-sm text-amber-800 font-medium">
                  {emptyRows.length} leere{emptyRows.length !== 1 ? ' Entwürfe' : 'r Entwurf'} gefunden:
                </p>
                <ul className="space-y-1">
                  {emptyRows.map((r) => (
                    <li key={r.id} className="text-xs text-amber-700">
                      #{r.id} — {r.protocol_type === 'transfer' ? 'Überführung' : 'Annahme'},{' '}
                      {r.inspector_name || '(kein Name)'},{' '}
                      {r.inspection_date?.slice(0, 10) ?? '—'}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700">
                  Diese Einträge werden unwiderruflich gelöscht.
                </p>
                <button
                  type="button"
                  onClick={deleteEmptyProtocols}
                  disabled={emptyDeleting}
                  className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60"
                >
                  {emptyDeleting
                    ? 'Lösche …'
                    : `🗑 ${emptyRows.length} leere${emptyRows.length !== 1 ? ' Entwürfe' : 'n Entwurf'} löschen`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* App-Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4 px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">ℹ️</span>
          <span className="font-semibold text-gray-800">App-Info</span>
        </div>
        <div className="flex flex-col gap-1.5 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-400">App</span>
            <span>Fahrzeug-Protokolle v2</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Version</span>
            <span>2.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Betreiber</span>
            <span>CarHandling</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Stack</span>
            <span>React + Supabase + PWA</span>
          </div>
        </div>
      </div>

      {/* Abmelden */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-4 text-red-600 font-semibold hover:bg-red-50 active:scale-95 transition-all"
        >
          <span className="text-2xl">🚪</span>
          <span>Abmelden</span>
        </button>
      </div>
    </div>
  )
}
