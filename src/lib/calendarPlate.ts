/**
 * Kennzeichen im Termintitel finden, die noch zu keinem Fahrzeug gehören.
 *
 * `matchVehiclesByPlate` sucht nur nach Kennzeichen, die es in der Flotte schon
 * gibt. Steht ein neues Fahrzeug zum ersten Mal im Kalender, bleibt dort nichts
 * hängen – hier wird der Titel deshalb nach etwas durchsucht, das wie ein
 * Kennzeichen aussieht, damit die Fahrt das Fahrzeug gleich mitbringen kann.
 *
 * Wie alles am Kalender ein Vorschlag: Kennzeichen und Modell landen im
 * Formular und sind dort änderbar.
 */

import { normalizeKennzeichen } from './vehicles'

/** Ein Fahrzeug, das beim Speichern der Fahrt erst angelegt wird. */
export interface NewVehicle {
  license_plate: string
  brand_model: string
}

/**
 * Deutsches Kennzeichen: Ort, Trenner, ein bis zwei Buchstaben, Ziffern,
 * dahinter optional E (elektrisch) oder H (historisch) – "WI-L 8957E".
 * Der Trenner ist Pflicht: ohne ihn sähe auch "MY27" wie eines aus.
 *
 * Mit Bindestrich darf das Leerzeichen vor den Ziffern fehlen ("M-AB1234"),
 * mit Leerzeichen nicht ("M AB 1234"): sonst wären "BMW M3" oder "VW T6"
 * Kennzeichen.
 */
const GERMAN = /\b[A-ZÄÖÜ]{1,3}(?:-[A-Z]{1,2} ?| [A-Z]{1,2} )\d{1,4}[EH]?\b/

/**
 * Alles andere, was zusammengeschrieben aus Buchstaben und Ziffern besteht –
 * ausländische oder Überführungskennzeichen wie "DPG98A". Mindestens fünf
 * Zeichen, damit Modellbezeichnungen ("MY27", "02") nicht mitkommen.
 */
const COMPACT = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,8}\b/g

/** Modelljahre ("MY2027") sehen aus wie ein Kennzeichen, sind aber keines. */
const MODEL_YEAR = /^MY\d{2,4}$/

/** Schlagwörter am Titelanfang – sie beschreiben den Termin, nicht das Fahrzeug. */
const LEAD = /^(?:abholung|rückholung|ruckholung|überführung|ueberfuehrung|tausch|wechsel|lieferung|zustellung)\s*:?\s*/i

/** Das erste Kennzeichen im Titel – oder null, wenn nichts danach aussieht. */
export function findPlate(summary: string | null | undefined): string | null {
  const text = summary ?? ''
  const german = text.match(GERMAN)
  if (german) return german[0].trim()

  for (const m of text.matchAll(COMPACT)) {
    if (!MODEL_YEAR.test(m[0])) return m[0]
  }
  return null
}

/**
 * Das Modell steht meist vor dem Kennzeichen: "LYNK 02 DPG98A Emmering".
 * Höchstens drei Wörter – danach beginnt in der Regel der Ort.
 */
function modelBefore(summary: string, plate: string): string {
  const at = summary.indexOf(plate)
  if (at <= 0) return ''
  return summary
    .slice(0, at)
    .replace(LEAD, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
}

/**
 * Ein Kennzeichen aus dem Titel, das noch keinem Fahrzeug gehört.
 *
 * Gibt es das Fahrzeug schon, kommt null zurück – dann ist es kein neues,
 * sondern eines, das `matchVehiclesByPlate` findet.
 */
export function unknownPlate(
  summary: string | null | undefined,
  vehicles: { license_plate: string }[]
): NewVehicle | null {
  const plate = findPlate(summary)
  if (!plate) return null

  const key = normalizeKennzeichen(plate)
  if (vehicles.some((v) => normalizeKennzeichen(v.license_plate ?? '') === key)) return null

  return { license_plate: plate, brand_model: modelBefore(summary ?? '', plate) }
}

/** Was eine Abholung erwartet, bevor ein Kennzeichen feststeht. */
export interface ExpectedVehicles {
  /** Wie viele Fahrzeuge – "2x", "2 Fahrzeuge", "zwei". */
  count: number
  /** Was es ist, so gut der Titel es sagt – "BMW M3". Kann leer sein. */
  model: string
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, fuenf: 5,
  sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
}

/** "2x", "2 ×", "2 Stk.", "2 Fahrzeuge", "zwei Fahrzeuge", "zwei x". */
const COUNT = new RegExp(
  '(?:^|\\s)(\\d{1,2}|' + Object.keys(NUMBER_WORDS).join('|') + ')' +
  '\\s*(x|×|stk\\.?|stück|fahrzeuge?|fzg\\.?|autos?)?(?=\\s|$|[,:])',
  'gi'
)

/** Wo nach dem Modell der Ort oder das Datum beginnt. */
const MODEL_END = /\s(?:in|nach|von|bei|aus|ab|am|für|fuer)\s|\s\d{1,2}\.\d{1,2}\.|[,(?]|\s[-–]\s/i

/**
 * Wie viele Fahrzeuge welcher Art der Titel nennt – für Termine ohne
 * Kennzeichen: "Abholung 2x BMW M3 in München".
 *
 * Eine Zahl zählt nur mit Einheit ("2x", "2 Fahrzeuge") oder als Wort
 * ("zwei"): eine nackte Ziffer ist meist Teil des Modells ("LYNK 02").
 * `explicit` sagt, ob der Titel überhaupt eine Anzahl nennt – ohne sie ist
 * es eher ein Fahrzeug aus der Flotte, dessen Kennzeichen nur nicht im Titel
 * steht.
 */
export function expectedVehicles(
  summary: string | null | undefined
): ExpectedVehicles & { explicit: boolean } {
  let text = (summary ?? '').replace(LEAD, '').trim()
  let count = 1
  let explicit = false

  for (const m of text.matchAll(COUNT)) {
    const raw = m[1].toLowerCase()
    const word = NUMBER_WORDS[raw]
    const n = word ?? (m[2] ? Number(raw) : NaN)
    // "ein BMW" nennt keine Anzahl, sondern nur das Fahrzeug.
    if (!Number.isFinite(n) || n < 1 || (n === 1 && !m[2])) continue
    count = n
    explicit = true
    text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim()
    break
  }

  const end = text.search(MODEL_END)
  const model = (end >= 0 ? text.slice(0, end) : text)
    .replace(/\b(?:neue[nrs]?|fahrzeuge?|autos?)\b/gi, '')
    .replace(/^\s*(?:ein|eine[nr]?)\s+/i, '')
    .replace(/^[\s:–-]+|[\s:–-]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(' ')

  return { count, model, explicit }
}
