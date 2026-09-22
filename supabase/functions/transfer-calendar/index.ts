// Edge Function: transfer-calendar
//
// Liest den veröffentlichten iCloud-Kalender mit den Überführungsterminen und
// gibt die Termine als JSON zurück. Zwei Gründe, warum das nicht im Browser
// passieren kann: die Feed-URL ist wie ein Passwort zu behandeln und darf
// deshalb nicht ins Client-Bundle, und iCloud liefert keine CORS-Header.
//
// Die Feed-URL steht als Secret TRANSFER_CALENDAR_URL
// (Dashboard -> Edge Functions -> Secrets).
//
// Bewusst ohne Datenbankzugriff: die Zuordnung zum Fahrzeug und das Erkennen
// bereits übernommener Termine macht die App, die beides ohnehin geladen hat.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Zeitzone, in der die Wandzeiten des Kalenders gelesen werden. */
const TZ = 'Europe/Berlin'

// ─────────────────────────────────────────────────────────────────────────────
// iCalendar-Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gefaltete Zeilen wieder zusammensetzen. Im iCalendar-Format wird jede Zeile
 * nach 75 Oktetten umbrochen und mit einem führenden Leerzeichen fortgesetzt –
 * ohne das Entfalten zerfallen längere Titel und Notizen.
 */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (out.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

interface Prop {
  params: Record<string, string>
  value: string
}

function parseLine(line: string): { name: string; prop: Prop } | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const [name, ...paramParts] = head.split(';')
  const params: Record<string, string> = {}
  for (const part of paramParts) {
    const eq = part.indexOf('=')
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), prop: { params, value } }
}

/** \n, \, und \; sind im iCalendar-Text maskiert. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

interface DateTimeParts {
  date: string        // yyyy-MM-dd
  time: string | null // HH:MM, null bei ganztägigen Terminen
  allDay: boolean
}

/**
 * Wandelt einen DTSTART/DTEND-Wert in Datum und Uhrzeit um.
 *
 * Drei Formen kommen vor:
 *   VALUE=DATE:20260918                -> ganztägig
 *   TZID=Europe/Berlin:20260918T083000 -> Wandzeit in der genannten Zone
 *   20260918T063000Z                   -> UTC, muss umgerechnet werden
 *
 * Eine Wandzeit ohne Z wird so übernommen, wie sie dasteht. Bei einer anderen
 * TZID als der eigenen wäre das ungenau – für einen Kalender, der in derselben
 * Zeitzone geführt wird wie die Disposition, ist es richtig.
 */
function parseDateTime(prop: Prop): DateTimeParts | null {
  const v = prop.value.trim()

  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly || prop.params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v)
    if (!m) return null
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null, allDay: true }
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v)
  if (!dt) return null
  const [, y, mo, d, h, mi, , zulu] = dt

  if (!zulu) {
    return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, allDay: false }
  }

  // UTC -> lokale Wandzeit. Intl kennt die Sommerzeitregeln, eine eigene
  // Offsetrechnung wäre im Sommer um eine Stunde daneben.
  const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, 0))
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(utc).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
    allDay: false,
  }
}

/** Einen Tag abziehen – für das exklusive Enddatum ganztägiger Termine. */
function previousDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export interface CalendarEvent {
  uid: string
  summary: string
  description: string | null
  location: string | null
  date_from: string
  date_to: string | null
  time_from: string | null
  time_to: string | null
  all_day: boolean
  /** Serientermine werden gemeldet, aber nicht aufgelöst. */
  recurring: boolean
}

function parseCalendar(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  let current: Record<string, Prop> | null = null

  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue }

    if (line === 'END:VEVENT') {
      if (current) {
        const ev = buildEvent(current)
        if (ev) events.push(ev)
      }
      current = null
      continue
    }

    if (!current) continue
    const parsed = parseLine(line)
    // Bei wiederholten Eigenschaften gewinnt die erste – das ist bei
    // EXDATE und ähnlichen Listen unerheblich, weil wir sie nicht auswerten.
    if (parsed && !(parsed.name in current)) current[parsed.name] = parsed.prop
  }

  events.sort((a, b) => (a.date_from + (a.time_from ?? '')).localeCompare(b.date_from + (b.time_from ?? '')))
  return events
}

function buildEvent(props: Record<string, Prop>): CalendarEvent | null {
  const uid = props.UID?.value?.trim()
  const start = props.DTSTART ? parseDateTime(props.DTSTART) : null
  if (!uid || !start) return null

  const end = props.DTEND ? parseDateTime(props.DTEND) : null

  let dateTo: string | null = null
  let timeTo: string | null = null
  if (end) {
    // Bei ganztägigen Terminen ist DTEND exklusiv: ein eintägiger Termin am
    // 18.09. hat DTEND 19.09. Wörtlich genommen wäre alles einen Tag zu lang.
    dateTo = start.allDay ? previousDay(end.date) : end.date
    timeTo = end.time
    if (dateTo < start.date) dateTo = start.date
  }

  return {
    uid,
    summary: unescapeText(props.SUMMARY?.value ?? ''),
    description: props.DESCRIPTION ? unescapeText(props.DESCRIPTION.value) || null : null,
    location: props.LOCATION ? unescapeText(props.LOCATION.value) || null : null,
    date_from: start.date,
    date_to: dateTo && dateTo !== start.date ? dateTo : null,
    time_from: start.time,
    time_to: timeTo,
    all_day: start.allDay,
    recurring: 'RRULE' in props,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const feedUrl = Deno.env.get('TRANSFER_CALENDAR_URL')
  if (!feedUrl) {
    return json({
      error: 'Kalender nicht eingerichtet.',
      hint: 'Secret TRANSFER_CALENDAR_URL unter Edge Functions -> Secrets hinterlegen.',
    }, 503)
  }

  // webcal:// ist nur ein Protokollhinweis für Kalender-Apps; abgerufen wird
  // dieselbe Adresse über https.
  const httpsUrl = feedUrl.replace(/^webcal:\/\//i, 'https://')

  let text: string
  try {
    const res = await fetch(httpsUrl, { headers: { Accept: 'text/calendar, text/plain, */*' } })
    if (!res.ok) {
      return json({ error: `Kalender antwortete mit HTTP ${res.status}.` }, 502)
    }
    text = await res.text()
  } catch (e) {
    return json({ error: `Kalender nicht erreichbar: ${e instanceof Error ? e.message : String(e)}` }, 502)
  }

  if (!text.includes('BEGIN:VCALENDAR')) {
    return json({
      error: 'Die Antwort ist kein Kalender.',
      hint: 'Zeigt die URL wirklich auf einen veröffentlichten Kalender?',
    }, 502)
  }

  const events = parseCalendar(text)
  return json({ count: events.length, events })
})
