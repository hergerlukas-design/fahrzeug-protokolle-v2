import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

// ViewId 'back' aligns with locale key damage_selector.view_back
type ViewId = 'top' | 'front' | 'back' | 'left' | 'right'

/** idle = nothing reported, marked = damage already reported here, active = current selection */
type ZoneState = 'active' | 'marked' | 'idle'

interface Props {
  value: string | null
  onChange: (pos: string) => void
  /** Positions that already have a damage reported — shown as marked zones even when not active. */
  markers?: string[]
}

const ZONE_TO_VIEW: Record<string, ViewId> = {
  'Motorhaube': 'top',
  'Dach': 'top',
  'Spiegel links': 'top',
  'Spiegel rechts': 'top',
  'Frontscheibe': 'front',
  'Scheinwerfer links': 'front',
  'Scheinwerfer rechts': 'front',
  'Stoßfänger vorne': 'front',
  'Kennzeichen vorne': 'front',
  'Heckscheibe': 'back',
  'Rückleuchte links': 'back',
  'Rückleuchte rechts': 'back',
  'Stoßfänger hinten': 'back',
  'Kennzeichen hinten': 'back',
  'Kotflügel vorne links': 'left',
  'Tür vorne links': 'left',
  'Tür hinten links': 'left',
  'Kotflügel hinten links': 'left',
  'Seitenscheibe vorne links': 'left',
  'Seitenscheibe hinten links': 'left',
  'Reifen vorne links': 'left',
  'Felge vorne links': 'left',
  'Reifen hinten links': 'left',
  'Felge hinten links': 'left',
  'Kotflügel vorne rechts': 'right',
  'Tür vorne rechts': 'right',
  'Tür hinten rechts': 'right',
  'Kotflügel hinten rechts': 'right',
  'Seitenscheibe vorne rechts': 'right',
  'Seitenscheibe hinten rechts': 'right',
  'Reifen vorne rechts': 'right',
  'Felge vorne rechts': 'right',
  'Reifen hinten rechts': 'right',
  'Felge hinten rechts': 'right',
}

/** Zone reachable through the Innenraum button rather than a view diagram. */
export const INTERIOR_POSITION = 'Innenraum'

// ─── Colors ──────────────────────────────────────────────────────────────────

function zFill(state: ZoneState) {
  if (state === 'active') return '#fbbf24'
  if (state === 'marked') return '#fecaca'
  return '#e5e7eb'
}
function zStroke(state: ZoneState) {
  if (state === 'active') return '#d97706'
  if (state === 'marked') return '#ef4444'
  return '#9ca3af'
}
function zText(state: ZoneState) {
  if (state === 'active') return '#78350f'
  if (state === 'marked') return '#7f1d1d'
  return '#374151'
}

function zoneState(pos: string, sel: string, markers: Set<string>): ZoneState {
  if (pos === sel) return 'active'
  if (markers.has(pos)) return 'marked'
  return 'idle'
}

// ─── Zone label helper ────────────────────────────────────────────────────────

function Label({
  x, y, lines, fontSize = 9, state,
}: {
  x: number; y: number; lines: string[]; fontSize?: number; state: ZoneState
}) {
  const lh = fontSize + 2
  return (
    <>
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={y + (i - (lines.length - 1) / 2) * lh}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight={state === 'idle' ? '500' : '700'}
          fill={zText(state)}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {line}
        </text>
      ))}
    </>
  )
}

// ─── Shared zone props helper ─────────────────────────────────────────────────

function zProps(pos: string, sel: string, markers: Set<string>, on: (p: string) => void) {
  const state = zoneState(pos, sel, markers)
  return {
    fill: zFill(state),
    stroke: zStroke(state),
    strokeWidth: 1.5 as number,
    onClick: () => on(pos),
    style: { cursor: 'pointer' as const },
  }
}

interface ViewProps {
  sel: string
  markers: Set<string>
  on: (p: string) => void
  sl: (key: string) => string[]
}

// ─── TOP VIEW ─────────────────────────────────────────────────────────────────
// viewBox="0 0 360 240" — landscape, front on LEFT, rear on RIGHT
// All coords derived from portrait original via (x,y) → (y, 240-x)

function TopView({ sel, markers, on, sl }: ViewProps) {
  const st = (p: string) => zoneState(p, sel, markers)
  return (
    <svg viewBox="0 0 360 240" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {/* Car body outline */}
      <path
        d="M 18,145 L 18,95 L 28,64 L 58,60
           L 103,55 L 106,30 L 152,30 L 155,55
           L 268,58 L 295,62 L 338,78 L 342,120
           L 338,162 L 295,178 L 268,182
           L 155,185 L 152,210 L 106,210 L 103,185
           L 58,180 L 28,176 Z"
        fill="#f9fafb" stroke="#6b7280" strokeWidth={1.5}
      />
      {/* Windshield divider — vertical */}
      <line x1="138" y1="68" x2="138" y2="172" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 3" />
      {/* Rear windshield divider — vertical */}
      <line x1="268" y1="68" x2="268" y2="172" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 3" />

      {/* Motorhaube — left side (front) */}
      <polygon points="25,175 25,65 55,62 135,60 135,180 55,178" {...zProps('Motorhaube', sel, markers, on)} />
      <Label x={80} y={120} lines={sl('Motorhaube')} fontSize={11} state={st('Motorhaube')} />

      {/* Dach — middle */}
      <rect x={155} y={62} width={110} height={116} rx={4} {...zProps('Dach', sel, markers, on)} />
      <Label x={210} y={120} lines={sl('Dach')} fontSize={13} state={st('Dach')} />

      {/* Spiegel links — bottom (Fahrerseite DE) */}
      <rect x={103} y={178} width={50} height={34} rx={3} {...zProps('Spiegel links', sel, markers, on)} />
      <Label x={128} y={195} lines={sl('Spiegel links')} fontSize={7.5} state={st('Spiegel links')} />

      {/* Spiegel rechts — top */}
      <rect x={103} y={28} width={50} height={34} rx={3} {...zProps('Spiegel rechts', sel, markers, on)} />
      <Label x={128} y={45} lines={sl('Spiegel rechts')} fontSize={7.5} state={st('Spiegel rechts')} />
    </svg>
  )
}

// ─── FRONT VIEW ───────────────────────────────────────────────────────────────
// viewBox="0 0 300 200"

function FrontView({ sel, markers, on, sl }: ViewProps) {
  const st = (p: string) => zoneState(p, sel, markers)
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {/* Car body outline */}
      <path
        d="M 110,15 L 190,15 L 225,26 L 230,58
           L 275,60 L 276,130 L 268,162 L 32,162
           L 24,130 L 25,60 L 70,58 L 75,26 Z"
        fill="#f9fafb" stroke="#6b7280" strokeWidth={1.5}
      />
      {/* Grille area (decorative) */}
      <rect x={84} y={92} width={132} height={38} rx={4} fill="#f3f4f6" stroke="#d1d5db" strokeWidth={1} />

      {/* Frontscheibe */}
      <polygon points="88,18 212,18 222,90 78,90" {...zProps('Frontscheibe', sel, markers, on)} />
      <Label x={150} y={55} lines={sl('Frontscheibe')} fontSize={10} state={st('Frontscheibe')} />

      {/* Scheinwerfer links */}
      <polygon points="28,60 84,60 84,128 25,125" {...zProps('Scheinwerfer links', sel, markers, on)} />
      <Label x={56} y={94} lines={sl('Scheinwerfer links')} fontSize={8.5} state={st('Scheinwerfer links')} />

      {/* Scheinwerfer rechts */}
      <polygon points="216,60 272,60 275,125 216,128" {...zProps('Scheinwerfer rechts', sel, markers, on)} />
      <Label x={244} y={94} lines={sl('Scheinwerfer rechts')} fontSize={8.5} state={st('Scheinwerfer rechts')} />

      {/* Stoßfänger vorne */}
      <rect x={28} y={133} width={244} height={26} rx={6} {...zProps('Stoßfänger vorne', sel, markers, on)} />
      <Label x={150} y={146} lines={sl('Stoßfänger vorne')} fontSize={9.5} state={st('Stoßfänger vorne')} />

      {/* Kennzeichen vorne — small plate in center of bumper, drawn on top for click priority */}
      <rect x={112} y={136} width={76} height={20} rx={3} {...zProps('Kennzeichen vorne', sel, markers, on)} />
      <Label x={150} y={146} lines={sl('Kennzeichen vorne')} fontSize={8} state={st('Kennzeichen vorne')} />
    </svg>
  )
}

// ─── REAR VIEW ────────────────────────────────────────────────────────────────
// viewBox="0 0 300 200"

function RearView({ sel, markers, on, sl }: ViewProps) {
  const st = (p: string) => zoneState(p, sel, markers)
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {/* Car body outline */}
      <path
        d="M 110,15 L 190,15 L 225,26 L 230,58
           L 275,60 L 276,130 L 268,162 L 32,162
           L 24,130 L 25,60 L 70,58 L 75,26 Z"
        fill="#f9fafb" stroke="#6b7280" strokeWidth={1.5}
      />
      {/* Heckscheibe */}
      <polygon points="95,18 205,18 215,80 85,80" {...zProps('Heckscheibe', sel, markers, on)} />
      <Label x={150} y={50} lines={sl('Heckscheibe')} fontSize={10} state={st('Heckscheibe')} />

      {/* Rückleuchte links */}
      <rect x={28} y={60} width={58} height={68} rx={4} {...zProps('Rückleuchte links', sel, markers, on)} />
      <Label x={57} y={94} lines={sl('Rückleuchte links')} fontSize={9} state={st('Rückleuchte links')} />

      {/* Rückleuchte rechts */}
      <rect x={214} y={60} width={58} height={68} rx={4} {...zProps('Rückleuchte rechts', sel, markers, on)} />
      <Label x={243} y={94} lines={sl('Rückleuchte rechts')} fontSize={9} state={st('Rückleuchte rechts')} />

      {/* Stoßfänger hinten */}
      <rect x={28} y={133} width={244} height={26} rx={6} {...zProps('Stoßfänger hinten', sel, markers, on)} />
      <Label x={150} y={146} lines={sl('Stoßfänger hinten')} fontSize={9.5} state={st('Stoßfänger hinten')} />

      {/* Kennzeichen hinten — center plate zone between tail lights */}
      <rect x={108} y={92} width={84} height={28} rx={3} {...zProps('Kennzeichen hinten', sel, markers, on)} />
      <Label x={150} y={106} lines={sl('Kennzeichen hinten')} fontSize={8} state={st('Kennzeichen hinten')} />
    </svg>
  )
}

// ─── LEFT SIDE VIEW ───────────────────────────────────────────────────────────
// viewBox="0 0 540 235" — landscape, front on left

const SIDE_OUTLINE =
  'M 30,168 L 30,138 C 32,118 45,108 60,105 ' +
  'L 62,58 C 62,22 78,12 152,12 ' +
  'L 285,10 C 395,10 415,12 428,16 ' +
  'L 510,58 L 512,168 ' +
  'L 462,168 A 40,40 0 0 0 382,168 ' +
  'L 143,168 A 40,40 0 0 0 63,168 Z'

function LeftView({ sel, markers, on, sl }: ViewProps) {
  const sx = ' links'
  const st = (p: string) => zoneState(p + sx, sel, markers)
  return (
    <svg viewBox="0 0 540 235" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {/* Car body outline */}
      <path d={SIDE_OUTLINE} fill="#f9fafb" stroke="#6b7280" strokeWidth={1.5} />
      {/* Belt line */}
      <line x1="152" y1="95" x2="418" y2="95" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 3" />

      {/* Kotflügel vorne links */}
      <rect x={55} y={52} width={92} height={116} rx={4} {...zProps('Kotflügel vorne' + sx, sel, markers, on)} />
      <Label x={101} y={110} lines={sl('Kotflügel vorne')} fontSize={9} state={st('Kotflügel vorne')} />

      {/* Seitenscheibe vorne links */}
      <rect x={152} y={12} width={130} height={81} rx={4} {...zProps('Seitenscheibe vorne' + sx, sel, markers, on)} />
      <Label x={217} y={53} lines={sl('Seitenscheibe vorne')} fontSize={9} state={st('Seitenscheibe vorne')} />

      {/* Tür vorne links */}
      <rect x={152} y={95} width={130} height={71} rx={4} {...zProps('Tür vorne' + sx, sel, markers, on)} />
      <Label x={217} y={130} lines={sl('Tür vorne')} fontSize={9} state={st('Tür vorne')} />

      {/* Seitenscheibe hinten links */}
      <rect x={287} y={12} width={128} height={81} rx={4} {...zProps('Seitenscheibe hinten' + sx, sel, markers, on)} />
      <Label x={351} y={53} lines={sl('Seitenscheibe hinten')} fontSize={9} state={st('Seitenscheibe hinten')} />

      {/* Tür hinten links */}
      <rect x={287} y={95} width={128} height={71} rx={4} {...zProps('Tür hinten' + sx, sel, markers, on)} />
      <Label x={351} y={130} lines={sl('Tür hinten')} fontSize={9} state={st('Tür hinten')} />

      {/* Kotflügel hinten links */}
      <rect x={420} y={52} width={88} height={116} rx={4} {...zProps('Kotflügel hinten' + sx, sel, markers, on)} />
      <Label x={464} y={110} lines={sl('Kotflügel hinten')} fontSize={9} state={st('Kotflügel hinten')} />

      {/* Wheel vorne — outer ring = Reifen, inner circle = Felge */}
      <circle cx={103} cy={188} r={44} {...zProps('Reifen vorne' + sx, sel, markers, on)} />
      <Label x={103} y={218} lines={sl('Reifen vorne')} fontSize={7} state={st('Reifen vorne')} />
      <circle cx={103} cy={188} r={20} {...zProps('Felge vorne' + sx, sel, markers, on)} />
      <Label x={103} y={188} lines={sl('Felge vorne')} fontSize={7.5} state={st('Felge vorne')} />

      {/* Wheel hinten — outer ring = Reifen, inner circle = Felge */}
      <circle cx={422} cy={188} r={44} {...zProps('Reifen hinten' + sx, sel, markers, on)} />
      <Label x={422} y={218} lines={sl('Reifen hinten')} fontSize={7} state={st('Reifen hinten')} />
      <circle cx={422} cy={188} r={20} {...zProps('Felge hinten' + sx, sel, markers, on)} />
      <Label x={422} y={188} lines={sl('Felge hinten')} fontSize={7.5} state={st('Felge hinten')} />
    </svg>
  )
}

// ─── RIGHT SIDE VIEW ──────────────────────────────────────────────────────────
// viewBox="0 0 540 235" — mirrored: front on right, rear on left
// Zone x-coords: x_right = 540 - x_left - width

function RightView({ sel, markers, on, sl }: ViewProps) {
  const sx = ' rechts'
  const st = (p: string) => zoneState(p + sx, sel, markers)
  return (
    <svg viewBox="0 0 540 235" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {/* Car outline — mirrored horizontally */}
      <g transform="scale(-1,1) translate(-540,0)">
        <path d={SIDE_OUTLINE} fill="#f9fafb" stroke="#6b7280" strokeWidth={1.5} />
        <line x1="152" y1="95" x2="418" y2="95" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="6 3" />
      </g>

      {/* Kotflügel vorne rechts — on the RIGHT (front side in mirrored view) */}
      <rect x={393} y={52} width={92} height={116} rx={4} {...zProps('Kotflügel vorne' + sx, sel, markers, on)} />
      <Label x={439} y={110} lines={sl('Kotflügel vorne')} fontSize={9} state={st('Kotflügel vorne')} />

      {/* Seitenscheibe vorne rechts */}
      <rect x={258} y={12} width={130} height={81} rx={4} {...zProps('Seitenscheibe vorne' + sx, sel, markers, on)} />
      <Label x={323} y={53} lines={sl('Seitenscheibe vorne')} fontSize={9} state={st('Seitenscheibe vorne')} />

      {/* Tür vorne rechts */}
      <rect x={258} y={95} width={130} height={71} rx={4} {...zProps('Tür vorne' + sx, sel, markers, on)} />
      <Label x={323} y={130} lines={sl('Tür vorne')} fontSize={9} state={st('Tür vorne')} />

      {/* Seitenscheibe hinten rechts */}
      <rect x={125} y={12} width={128} height={81} rx={4} {...zProps('Seitenscheibe hinten' + sx, sel, markers, on)} />
      <Label x={189} y={53} lines={sl('Seitenscheibe hinten')} fontSize={9} state={st('Seitenscheibe hinten')} />

      {/* Tür hinten rechts */}
      <rect x={125} y={95} width={128} height={71} rx={4} {...zProps('Tür hinten' + sx, sel, markers, on)} />
      <Label x={189} y={130} lines={sl('Tür hinten')} fontSize={9} state={st('Tür hinten')} />

      {/* Kotflügel hinten rechts — on the LEFT (rear side in mirrored view) */}
      <rect x={32} y={52} width={88} height={116} rx={4} {...zProps('Kotflügel hinten' + sx, sel, markers, on)} />
      <Label x={76} y={110} lines={sl('Kotflügel hinten')} fontSize={9} state={st('Kotflügel hinten')} />

      {/* Wheel vorne rechts — on the RIGHT — outer ring = Reifen, inner = Felge */}
      <circle cx={437} cy={188} r={44} {...zProps('Reifen vorne' + sx, sel, markers, on)} />
      <Label x={437} y={218} lines={sl('Reifen vorne')} fontSize={7} state={st('Reifen vorne')} />
      <circle cx={437} cy={188} r={20} {...zProps('Felge vorne' + sx, sel, markers, on)} />
      <Label x={437} y={188} lines={sl('Felge vorne')} fontSize={7.5} state={st('Felge vorne')} />

      {/* Wheel hinten rechts — on the LEFT — outer ring = Reifen, inner = Felge */}
      <circle cx={118} cy={188} r={44} {...zProps('Reifen hinten' + sx, sel, markers, on)} />
      <Label x={118} y={218} lines={sl('Reifen hinten')} fontSize={7} state={st('Reifen hinten')} />
      <circle cx={118} cy={188} r={20} {...zProps('Felge hinten' + sx, sel, markers, on)} />
      <Label x={118} y={188} lines={sl('Felge hinten')} fontSize={7.5} state={st('Felge hinten')} />
    </svg>
  )
}

// ─── Diagram (tabs + view + Innenraum) ────────────────────────────────────────

const VIEW_IDS: ViewId[] = ['top', 'front', 'back', 'left', 'right']

function DamageDiagram({
  sel, markerSet, onSelect,
}: {
  sel: string
  markerSet: Set<string>
  onSelect: (pos: string) => void
}) {
  const { t } = useTranslation()

  // Short label helper: looks up damage.short.<key> and splits on '|' for multiline SVG text
  const sl = (key: string): string[] =>
    t(`damage.short.${key}`, { defaultValue: key }).split('|')

  // Manually picked tab, remembered together with the selection it was picked
  // for. As long as the selection doesn't change, the manual choice wins; once
  // the position changes — a zone click, or an existing damage opened for
  // editing — the diagram jumps to the view that position lives in, so nobody
  // has to click through the tabs to find it.
  const [tab, setTab] = useState<{ forSel: string; view: ViewId } | null>(null)
  const activeView: ViewId =
    tab && tab.forSel === sel ? tab.view : (ZONE_TO_VIEW[sel] ?? tab?.view ?? 'top')

  // Which of the 5 view tabs contain at least one marked (damaged) zone, so the
  // tab bar itself gives an at-a-glance overview before switching views.
  const viewsWithMarkers = useMemo(() => {
    const set = new Set<ViewId>()
    markerSet.forEach((pos) => {
      const view = ZONE_TO_VIEW[pos]
      if (view) set.add(view)
    })
    return set
  }, [markerSet])

  const viewProps: ViewProps = { sel, markers: markerSet, on: onSelect, sl }

  return (
    <>
      {/* View tabs */}
      <div className="flex border-b border-gray-100 shrink-0">
        {VIEW_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab({ forSel: sel, view: id })}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              activeView === id
                ? 'text-brand-600 border-b-2 border-brand-500'
                : 'text-gray-500'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1">
              {t(`damage_selector.view_${id}`)}
              {viewsWithMarkers.has(id) && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* SVG diagram area — fixed height so all views look the same */}
      <div className="px-1 py-2 shrink-0" style={{ height: 200 }}>
        {activeView === 'top' && <TopView {...viewProps} />}
        {activeView === 'front' && <FrontView {...viewProps} />}
        {activeView === 'back' && <RearView {...viewProps} />}
        {activeView === 'left' && <LeftView {...viewProps} />}
        {activeView === 'right' && <RightView {...viewProps} />}
      </div>

      {/* Innenraum — no diagram zone, so it gets its own button */}
      <button
        type="button"
        onClick={() => onSelect(INTERIOR_POSITION)}
        className={`w-full py-2 rounded-xl border text-sm font-medium transition-colors ${
          sel === INTERIOR_POSITION
            ? 'bg-amber-100 border-amber-400 text-amber-800'
            : markerSet.has(INTERIOR_POSITION)
              ? 'bg-red-50 border-red-300 text-red-700'
              : 'border-gray-200 text-gray-500 active:border-brand-400'
        }`}
      >
        🪑 {t(`damage.positions.${INTERIOR_POSITION}`, { defaultValue: INTERIOR_POSITION })}
      </button>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CarDamageSelector({ value, onChange, markers = [] }: Props) {
  const { t } = useTranslation()
  const sel = value ?? ''   // null → '' for internal use
  const markerSet = useMemo(() => new Set(markers), [markers])

  return (
    <div className="space-y-2">
      <DamageDiagram sel={sel} markerSet={markerSet} onSelect={onChange} />
      <p className={`text-xs font-medium px-1 ${sel ? 'text-amber-700' : 'text-gray-400'}`}>
        {sel
          ? `✓ ${t(`damage.positions.${sel}`, { defaultValue: sel })}`
          : t('annahme.damage_position_placeholder')}
      </p>
    </div>
  )
}
