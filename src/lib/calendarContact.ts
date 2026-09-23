/**
 * Ansprechpartner und Telefonnummer aus den Notizen eines Kalendertermins lesen.
 *
 * Die Notizen sind Freitext – es gibt kein Format, auf das man sich verlassen
 * könnte. Gelesen wird deshalb in zwei Stufen: zuerst beschriftete Angaben
 * ("Ansprechpartner: …", "Tel: …"), danach als Rückfall die erste Zeichenfolge,
 * die wie eine Rufnummer aussieht, samt dem Text davor.
 *
 * Alles hier ist ein Vorschlag. Das Ergebnis landet im Formular und wird dort
 * bestätigt – wie die Fahrzeugzuordnung über das Kennzeichen auch.
 */

export interface CalendarContact {
  name: string | null
  phone: string | null
}

const LINE_SPLIT = /\r\n|\r|\n/

/** Zeilen, in denen ohnehin nichts Brauchbares steht. */
const SKIP_LINE = /(https?:\/\/|www\.|@\S+\.\w)/i

/** Beschriftung vor einer Rufnummer – längere Varianten zuerst. */
const PHONE_LABEL =
  /\b(?:telefonnummer|telefonnr|telefon|telnr|tel|mobilnummer|mobiltelefon|mobil|handynummer|handy|phone|mobile|cell|fon)\b[.\s]*[:\-–]?\s*/i

/** Beschriftung vor einem Namen. */
const NAME_LABEL =
  /^[\s•*\-–]*(?:ansprechpartnerin|ansprechpartner|ansprechperson|kontaktperson|kontakt|contact|abholerin|abholer|übergabe an|uebergabe an|name)\b\s*[:\-–]?\s*(.+)$/i

/** Kurzformen brauchen einen Doppelpunkt – "AP" steckt sonst in jedem Wort. */
const NAME_LABEL_SHORT = /^[\s•*\-–]*(?:ap|kp)\s*[:\-–]\s*(.+)$/i

/**
 * Beginnt mit Ziffer, Plus oder Klammer, danach Ziffern und die üblichen
 * Trennzeichen. Der Doppelpunkt fehlt bewusst: "08:30" ist eine Uhrzeit.
 */
const PHONE_CANDIDATE = /[+(]?[\d][\d\s./()-]{4,}\d/g

/** Datumsangaben haben genug Ziffern, um als Rufnummer durchzugehen. */
const DATE_LIKE: RegExp[] = [
  /\d{1,2}\s*[./]\s*\d{1,2}\s*[./]\s*\d{2,4}/, // 18.09.2026, 18/09/26
  /^\d{1,2}\s*\.\s*\d{1,2}\s*\.(?!\d)/,        // 08.09. – 10.09.
  /^\d{4}-\d{1,2}-\d{1,2}$/,                   // 2026-09-18
]

interface PhoneHit {
  value: string
  /** Position im Ausgangstext – davor steht oft der Name. */
  index: number
}

function trimEdges(raw: string): string {
  return raw.replace(/^[\s.\-–/]+/, '').replace(/[\s.\-–/(]+$/, '')
}

/**
 * Erste Rufnummer in einer Zeile.
 *
 * `requirePrefix` gilt für die unbeschriftete Suche: ohne Beschriftung zählt
 * nur, was mit 0, +, 00 oder einer Klammer beginnt. Sonst wäre jede
 * Auftragsnummer eine Telefonnummer.
 */
function findPhone(line: string, minDigits: number, requirePrefix: boolean): PhoneHit | null {
  const re = new RegExp(PHONE_CANDIDATE.source, 'g')
  let m: RegExpExecArray | null

  while ((m = re.exec(line)) !== null) {
    const raw = trimEdges(m[0])
    if (!raw) continue

    const digits = (raw.match(/\d/g) ?? []).length
    if (digits < minDigits || digits > 15) continue
    if (DATE_LIKE.some((r) => r.test(raw))) continue
    if (requirePrefix && !/^(\+|00|0|\()/.test(raw)) continue

    return { value: raw.replace(/\s+/g, ' '), index: m.index }
  }
  return null
}

/** Namenszusätze, die klein geschrieben bleiben. */
const NAME_PARTICLES = new Set(['von', 'van', 'de', 'der', 'den', 'del', 'di', 'da', 'zu', 'le', 'la'])

/**
 * Sieht der Text nach einem Namen aus – wenige Wörter, alle groß geschrieben?
 *
 * Nur für die unbeschriftete Suche gedacht: dort steht vor der Nummer genauso
 * gut ein halber Satz ("telefonisch erreichbar unter"), und der gehört nicht
 * ins Feld Ansprechpartner. Hinter einer Beschriftung zählt dagegen, was da
 * steht, auch klein geschrieben.
 */
function looksLikeName(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 5) return false
  return words.every((w) => {
    const bare = w.replace(/[.,;:()"'«»–-]/gu, '')
    if (!bare) return true
    if (NAME_PARTICLES.has(bare.toLowerCase())) return true
    return /^\p{Lu}/u.test(bare)
  })
}

/** Wörter, die eine Zeile als Anschrift ausweisen. */
const ADDRESS_HINT = /(stra(?:ß|ss)e|str\.|[a-zäöüß]weg\b|allee|platz\b|ring\b|gasse|damm\b|ufer\b|chaussee|postfach)/i

/** Für den Vergleich mit dem Ort des Termins: klein, ohne Satzzeichen. */
function plain(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * Steht in dieser Zeile eher eine Anschrift als ein Name?
 *
 * Ziffern sind das stärkste Merkmal – Hausnummer, Postleitzahl –, ein Name hat
 * keine. Dazu die üblichen Straßenwörter und der Ort des Termins selbst: was
 * dort schon steht ("Harksheide, Norderstedt"), ist kein Ansprechpartner.
 */
function isAddressish(line: string, exclude: string): boolean {
  if (/\d/.test(line)) return true
  if (ADDRESS_HINT.test(line)) return true
  const needle = plain(line)
  return needle.length > 2 && exclude.includes(needle)
}

/**
 * Aus einem Textstück einen Namen machen – oder nichts.
 *
 * Abgeschnitten wird an einer Telefonbeschriftung und an der Nummer selbst,
 * damit aus "Herr Schulz, Tel. 0171 1234567" nur "Herr Schulz" wird.
 */
function cleanName(raw: string, strict = false): string | null {
  let text = raw

  const label = text.match(PHONE_LABEL)
  if (label && label.index !== undefined) text = text.slice(0, label.index)

  const phone = findPhone(text, 5, false)
  if (phone) text = text.slice(0, phone.index)

  text = text.replace(/^[\s,;:·|/()"'«»\-–]+/, '').replace(/[\s,;:·|/()"'«»\-–]+$/, '')

  if (text.length < 2 || text.length > 60) return null
  if (!/\p{L}/u.test(text)) return null
  if (strict && !looksLikeName(text)) return null
  return text
}

export interface ExtractOptions {
  /**
   * Der Ort des Termins. Zeilen, die darin vorkommen, scheiden als Name aus –
   * über der Telefonnummer steht sonst gern die Anschrift.
   */
  exclude?: string | null
}

export function extractContact(
  text: string | null | undefined,
  options: ExtractOptions = {}
): CalendarContact {
  const lines = (text ?? '')
    .split(LINE_SPLIT)
    .map((l) => l.trim())
    .filter((l) => l && !SKIP_LINE.test(l))

  let phone: string | null = null
  let phoneLine = -1
  let phoneIndex = -1

  // 1. Beschriftete Nummer – die ist gemeint, auch wenn weiter oben eine
  //    andere Zahlenfolge steht.
  for (const [i, line] of lines.entries()) {
    const label = line.match(PHONE_LABEL)
    if (!label || label.index === undefined) continue
    const start = label.index + label[0].length
    const hit = findPhone(line.slice(start), 6, false)
    if (hit) {
      phone = hit.value
      phoneLine = i
      phoneIndex = start + hit.index
      break
    }
  }

  // 2. Sonst die erste Zeichenfolge, die von sich aus wie eine Rufnummer aussieht.
  if (!phone) {
    for (const [i, line] of lines.entries()) {
      const hit = findPhone(line, 7, true)
      if (hit) {
        phone = hit.value
        phoneLine = i
        phoneIndex = hit.index
        break
      }
    }
  }

  // 3. Beschrifteter Name.
  let name: string | null = null
  for (const line of lines) {
    const m = line.match(NAME_LABEL) ?? line.match(NAME_LABEL_SHORT)
    if (!m) continue
    const candidate = cleanName(m[1])
    if (candidate) {
      name = candidate
      break
    }
  }

  // 4. Sonst der Text vor der Nummer – "Frau Weber 0151 2345678".
  if (!name && phoneLine >= 0) {
    name = cleanName(lines[phoneLine].slice(0, phoneIndex), true)
  }

  // 5. Sonst die Zeile über der Nummer: dort steht der Ansprechpartner am
  //    häufigsten, ohne Beschriftung und mit Vor- und Nachnamen. Anschriften
  //    werden dabei aussortiert, sonst stünde die Straße im Namensfeld.
  if (!name && phoneLine > 0) {
    const exclude = plain(options.exclude ?? '')
    for (let i = phoneLine - 1; i >= 0; i--) {
      const line = lines[i]
      if (isAddressish(line, exclude)) continue
      const candidate = cleanName(line, true)
      if (candidate) {
        name = candidate
        break
      }
    }
  }

  return { name, phone }
}
