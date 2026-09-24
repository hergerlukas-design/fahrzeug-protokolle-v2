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
 */
const GERMAN = /\b[A-ZÄÖÜ]{1,3}[- ][A-Z]{1,2} ?\d{1,4}[EH]?\b/

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
