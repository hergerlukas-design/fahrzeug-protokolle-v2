import { PDFDocument, rgb, StandardFonts, degrees, type PDFPage, type PDFFont, type PDFImage } from 'pdf-lib'
import type { Checkliste, DamageItem } from './protocols'

// ─────────────────────────────────────────────────────────────────────────────
// Units & coordinate helpers
// ─────────────────────────────────────────────────────────────────────────────
//  pdf-lib: origin bottom-left, y increases upward
//  Old app (FPDF): origin top-left, y increases downward
//  All input measurements are in mm; converted to pt at 72dpi.

const PT = 72 / 25.4           // points per mm  (~2.8346)
const A4H = 297                // A4 height in mm

function mm(v: number): number { return v * PT }
/** Convert a position "y mm from the top" + element height to pdf-lib y (bottom edge). */
function top(y_mm: number, h_mm = 0): number { return (A4H - y_mm - h_mm) * PT }

// ─────────────────────────────────────────────────────────────────────────────
// Colours (FPDF RGB → pdf-lib rgb)
// ─────────────────────────────────────────────────────────────────────────────
const C_RED    = rgb(219 / 255, 50 / 255, 62 / 255)
const C_DKGRAY = rgb(63 / 255, 63 / 255, 63 / 255)
const C_BLACK  = rgb(0, 0, 0)
const C_LBLUE  = rgb(0.15, 0.35, 0.8)
const C_LGREEN = rgb(0.08, 0.55, 0.28)
const C_LABEL  = rgb(0.38, 0.38, 0.38)
const C_CELL_BG = rgb(0.93, 0.93, 0.93)
const C_WMARK  = rgb(200 / 255, 200 / 255, 200 / 255)

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────
const ML = mm(10)          // left margin
const CW = mm(190)         // total content width
const C2 = mm(95)          // 2-column cell width
const C3A = mm(63)
const C3B = mm(63)
const C3C = mm(64)
const ROW8 = mm(8)         // standard cell height
const ROW7 = mm(7)         // checklist row height
const CONTENT_TOP = 45     // mm from top where page content starts

// ─────────────────────────────────────────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfData {
  protocol_type: 'annahme' | 'transfer'
  status: 'draft' | 'final'
  inspector_name: string
  /** For annahme: Standort. For transfer: "Von → Nach". */
  location: string
  odometer: number
  fuel_level: number
  battery: number
  remarks: string
  inspection_date: string
  license_plate: string
  brand_model: string
  vin: string
  /** Supabase Storage public URLs keyed by photo role. */
  photos: Record<string, string>
  conditions: string[]
  damage_records: DamageItem[]
  checkliste: Checkliste
}

// ─────────────────────────────────────────────────────────────────────────────
// Image utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch image URL, scale to ≤maxPx, re-encode as JPEG. Returns null on failure. */
async function fetchJpeg(url: string, maxPx = 700, quality = 0.72): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    const bmp = await createImageBitmap(blob)
    const scale = bmp.width > maxPx ? maxPx / bmp.width : 1
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    return new Promise<Uint8Array | null>((resolve) => {
      canvas.toBlob(
        (b) => (b ? b.arrayBuffer().then((ab) => resolve(new Uint8Array(ab))) : resolve(null)),
        'image/jpeg',
        quality
      )
    })
  } catch {
    return null
  }
}

/** Fetch PNG bytes verbatim (used for signature). */
async function fetchPng(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return new Uint8Array(await r.arrayBuffer())
  } catch {
    return null
  }
}

/** Aspect-correct image dims: given a target width in mm, returns height in mm. */
function scaledH(img: PDFImage, widthMm: number): number {
  return (img.height / img.width) * widthMm
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing primitives
// ─────────────────────────────────────────────────────────────────────────────

interface Fonts { regular: PDFFont; bold: PDFFont; oblique: PDFFont }

/** Draws a labelled data cell with optional header-shading.
 *  cursorY is the TOP of the cell row (in pdf-lib pts). */
function drawCell(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  cursorY: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts: { shade?: boolean; valueSize?: number } = {}
) {
  const yBottom = cursorY - h

  if (opts.shade) {
    page.drawRectangle({ x, y: yBottom, width: w, height: h, color: C_CELL_BG, borderWidth: 0 })
  }
  page.drawRectangle({ x, y: yBottom, width: w, height: h, borderColor: C_BLACK, borderWidth: 0.5 })

  if (label) {
    page.drawText(safe(label), {
      x: x + mm(1),
      y: cursorY - mm(3.2),
      size: 6.5,
      font: fonts.regular,
      color: C_LABEL,
    })
  }
  if (value) {
    page.drawText(safe(value), {
      x: x + mm(1),
      y: yBottom + mm(1.8),
      size: opts.valueSize ?? 9,
      font: fonts.regular,
      color: C_BLACK,
    })
  }
}

/** Draws a section heading and returns the new cursorY. */
function drawHeading(page: PDFPage, bold: PDFFont, cursorY: number, text: string): number {
  page.drawText(safe(text), { x: ML, y: cursorY - mm(5.5), size: 12, font: bold, color: C_BLACK })
  return cursorY - mm(8.5)
}

/** Guard against chars outside Latin-1 (pdf-lib WinAnsiEncoding). */
function safe(s: string | number | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/[\u0100-\uFFFF]/g, '?')
}

// ─────────────────────────────────────────────────────────────────────────────
// Header (repeats on every page)
// ─────────────────────────────────────────────────────────────────────────────

async function drawPageHeader(
  page: PDFPage,
  _pdfDoc: PDFDocument,
  fonts: Fonts,
  logoImg: PDFImage | null,
  data: PdfData,
  isFirstPage: boolean
) {
  // ── Logo ──────────────────────────────────────────────────────────────────
  if (logoImg) {
    const logoW = mm(22)
    const logoH = mm(scaledH(logoImg, 22))
    page.drawImage(logoImg, {
      x: mm(175),
      y: top(5, scaledH(logoImg, 22)),
      width: logoW,
      height: logoH,
    })
  }

  // ── Red bar left: x=0, y=150 from top, w=3mm, h=147mm ─────────────────────
  page.drawRectangle({
    x: 0,
    y: top(150, 147),   // = (297-150-147)*PT = 0
    width: mm(3),
    height: mm(147),
    color: C_RED,
    borderWidth: 0,
  })

  // ── Grey bar right: x=207, y=0 from top, w=3mm, h=100mm ──────────────────
  page.drawRectangle({
    x: mm(207),
    y: top(0, 100),     // = (297-100)*PT
    width: mm(3),
    height: mm(100),
    color: C_DKGRAY,
    borderWidth: 0,
  })

  // ── "perfection in motion" rotated 90° CCW, x=208, y=88 ──────────────────
  page.drawText('perfection in motion', {
    x: mm(210),
    y: top(88),
    size: 8.5,
    font: fonts.regular,
    color: C_DKGRAY,
    rotate: degrees(90),
  })

  // ── Page title (first page only) ─────────────────────────────────────────
  if (isFirstPage) {
    const title =
      data.protocol_type === 'annahme'
        ? 'Fahrzeug-Annahmeprotokoll'
        : 'Fahrzeug-Überführungsprotokoll'
    page.drawText(safe(title), {
      x: mm(35),
      y: top(12, 6),    // 6mm ≈ 17pt font height
      size: 16,
      font: fonts.bold,
      color: C_BLACK,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark
// ─────────────────────────────────────────────────────────────────────────────

function drawWatermark(page: PDFPage, bold: PDFFont) {
  const text = 'VORLAEUFIGER ENTWURF'   // no umlaut to avoid encoding edge cases
  const size = 52
  const textWidth = bold.widthOfTextAtSize(text, size)
  const angle = Math.PI / 4
  const cx = mm(105)
  const cy = mm(148)
  page.drawText(text, {
    x: cx - (textWidth / 2) * Math.cos(angle),
    y: cy - (textWidth / 2) * Math.sin(angle),
    size,
    font: bold,
    color: C_WMARK,
    rotate: degrees(45),
    opacity: 0.55,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 1 — content sections
// ─────────────────────────────────────────────────────────────────────────────

function drawSection1Basisdaten(
  page: PDFPage,
  fonts: Fonts,
  cursorY: number,
  data: PdfData
): number {
  cursorY = drawHeading(page, fonts.bold, cursorY, '1. Basisdaten')

  const [von, nach] = data.location.includes(' → ')
    ? data.location.split(' → ')
    : [data.location, '']

  if (data.protocol_type === 'annahme') {
    // 2×3 grid
    const rows: [string, string, string, string][] = [
      ['Kennzeichen', data.license_plate,  'Marke / Modell', data.brand_model],
      ['VIN',         data.vin,            'Ersteller',      data.inspector_name],
      ['KM-Stand',    `${data.odometer} km`, 'Standort',     data.location],
    ]
    for (const [l1, v1, l2, v2] of rows) {
      drawCell(page, fonts, ML,        cursorY, C2, ROW8, l1, v1)
      drawCell(page, fonts, ML + C2,   cursorY, C2, ROW8, l2, v2)
      cursorY -= ROW8
    }
  } else {
    // 2×2 + extra rows
    const rows: [string, string, string, string][] = [
      ['Kennzeichen',  data.license_plate,    'VIN',       data.vin],
      ['Marke / Modell', data.brand_model,    'KM-Stand',  `${data.odometer} km`],
      ['Ersteller',    data.inspector_name,   'Empfänger', ''],
      ['Von',          von,                   'Nach',      nach],
    ]
    for (const [l1, v1, l2, v2] of rows) {
      drawCell(page, fonts, ML,        cursorY, C2, ROW8, l1, v1)
      drawCell(page, fonts, ML + C2,   cursorY, C2, ROW8, l2, v2)
      cursorY -= ROW8
    }
    // Full-width Bedingungen
    drawCell(page, fonts, ML, cursorY, CW, ROW8, 'Bedingungen', data.conditions.join(', '))
    cursorY -= ROW8
  }

  return cursorY
}

function drawSection2Technik(
  page: PDFPage,
  fonts: Fonts,
  cursorY: number,
  data: PdfData
): number {
  cursorY -= mm(4)  // ln(4) gap
  cursorY = drawHeading(page, fonts.bold, cursorY, '2. Technik & Betriebsstoffe')

  if (data.protocol_type === 'annahme') {
    drawCell(page, fonts, ML,        cursorY, C2, ROW8, 'Kraftstoff', `${data.fuel_level} %`)
    drawCell(page, fonts, ML + C2,   cursorY, C2, ROW8, 'Batterie',   `${data.battery} %`)
    cursorY -= ROW8
  } else {
    drawCell(page, fonts, ML,              cursorY, C3A, ROW8, 'Kraftstoff', `${data.fuel_level} %`)
    drawCell(page, fonts, ML + C3A,        cursorY, C3B, ROW8, 'Batterie',   `${data.battery} %`)
    drawCell(page, fonts, ML + C3A + C3B,  cursorY, C3C, ROW8, 'Bedingungen', data.conditions.join(', '))
    cursorY -= ROW8
  }

  return cursorY
}

function drawSection3Checkliste(
  page: PDFPage,
  fonts: Fonts,
  cursorY: number,
  data: PdfData
): number {
  cursorY -= mm(4)
  cursorY = drawHeading(page, fonts.bold, cursorY, '3. Checkliste')

  const cl = data.checkliste
  const accentColor = data.protocol_type === 'annahme' ? C_LBLUE : C_LGREEN

  // Column headers
  const headerH = mm(5.5)
  page.drawRectangle({ x: ML, y: cursorY - headerH, width: C2, height: headerH, color: C_CELL_BG, borderWidth: 0 })
  page.drawRectangle({ x: ML, y: cursorY - headerH, width: C2, height: headerH, borderColor: C_BLACK, borderWidth: 0.5 })
  page.drawText('Zustand', { x: ML + mm(1), y: cursorY - mm(4), size: 8, font: fonts.bold, color: C_BLACK })

  page.drawRectangle({ x: ML + C2, y: cursorY - headerH, width: C2, height: headerH, color: C_CELL_BG, borderWidth: 0 })
  page.drawRectangle({ x: ML + C2, y: cursorY - headerH, width: C2, height: headerH, borderColor: C_BLACK, borderWidth: 0.5 })
  page.drawText('Zubehör', { x: ML + C2 + mm(1), y: cursorY - mm(4), size: 8, font: fonts.bold, color: C_BLACK })
  cursorY -= headerH

  // 6 rows
  type CheckRow = [string, boolean, string, boolean]
  const rows: CheckRow[] = [
    ['Boden',        cl.floor,        'Verbandskasten', cl.aid_kit],
    ['Sitze',        cl.seats,        'Warndreieck',    cl.triangle],
    ['Einstiege',    cl.entry,        'Warnweste',      cl.vest],
    ['Armaturen',    cl.instruments,  'Ladekabel',      cl.cable],
    ['Kofferraum',   cl.trunk,        'Fahrzeugschein', cl.registration],
    ['Motorraum',    cl.engine,       'Ladekarte',      cl.card],
  ]

  for (const [leftLabel, leftVal, rightLabel, rightVal] of rows) {
    // Left cell (Sauber/Schmutzig)
    drawCell(page, fonts, ML, cursorY, C2, ROW7, leftLabel, '')
    const leftText = leftVal ? 'Sauber' : 'Schmutzig'
    const leftBadgeW = mm(18)
    page.drawRectangle({
      x: ML + C2 - leftBadgeW - mm(1),
      y: cursorY - ROW7 + mm(1),
      width: leftBadgeW,
      height: ROW7 - mm(2),
      color: leftVal ? rgb(0.85, 0.96, 0.88) : rgb(0.98, 0.92, 0.88),
      borderWidth: 0,
    })
    page.drawText(leftText, {
      x: ML + C2 - leftBadgeW - mm(1) + mm(1),
      y: cursorY - ROW7 + mm(2),
      size: 7.5,
      font: fonts.bold,
      color: leftVal ? rgb(0.1, 0.5, 0.2) : rgb(0.7, 0.25, 0.1),
    })

    // Right cell (Ja/Nein)
    drawCell(page, fonts, ML + C2, cursorY, C2, ROW7, rightLabel, '')
    const rightText = rightVal ? 'Ja' : 'Nein'
    const rightBadgeW = mm(12)
    page.drawRectangle({
      x: ML + C2 + C2 - rightBadgeW - mm(1),
      y: cursorY - ROW7 + mm(1),
      width: rightBadgeW,
      height: ROW7 - mm(2),
      color: rightVal ? rgb(0.85, 0.96, 0.88) : rgb(0.94, 0.94, 0.94),
      borderWidth: 0,
    })
    page.drawText(rightText, {
      x: ML + C2 + C2 - rightBadgeW - mm(1) + mm(1.5),
      y: cursorY - ROW7 + mm(2),
      size: 7.5,
      font: fonts.bold,
      color: rightVal ? rgb(0.1, 0.5, 0.2) : C_LABEL,
    })

    void accentColor  // reference to avoid unused-var lint
    cursorY -= ROW7
  }

  return cursorY
}

function drawSection4Bemerkungen(
  page: PDFPage,
  fonts: Fonts,
  cursorY: number,
  data: PdfData
): number {
  if (!data.remarks.trim()) return cursorY

  cursorY -= mm(4)
  cursorY = drawHeading(page, fonts.bold, cursorY, '4. Bemerkungen')

  // multi_cell equivalent: wrap text manually
  const cellH = mm(8)
  const maxCharsPerLine = 90
  const text = data.remarks.trim()
  const lines: string[] = []
  for (let i = 0; i < text.length; i += maxCharsPerLine) {
    lines.push(text.slice(i, i + maxCharsPerLine))
  }
  const totalH = Math.max(cellH, lines.length * mm(4.5))
  page.drawRectangle({ x: ML, y: cursorY - totalH, width: CW, height: totalH, borderColor: C_BLACK, borderWidth: 0.5 })
  lines.forEach((line, i) => {
    page.drawText(safe(line), {
      x: ML + mm(1),
      y: cursorY - mm(5) - i * mm(4.5),
      size: 9,
      font: fonts.regular,
      color: C_BLACK,
    })
  })
  cursorY -= totalH

  return cursorY
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature block
// ─────────────────────────────────────────────────────────────────────────────

async function drawSignatures(
  page: PDFPage,
  pdfDoc: PDFDocument,
  fonts: Fonts,
  data: PdfData,
  sigImg: PDFImage | null
) {
  const dateStr = data.inspection_date
    ? new Date(data.inspection_date).toLocaleDateString('de-DE')
    : ''

  if (data.protocol_type === 'annahme') {
    // Annahme: absolute bottom-right, x=145, y=250 from top, w=55mm, h=30mm
    const x = mm(145)
    const y = top(250, 30)   // = (297-250-30)*PT = 17*PT
    const w = mm(55)
    const h = mm(30)

    page.drawRectangle({ x, y, width: w, height: h, borderColor: C_BLACK, borderWidth: 0.5 })
    page.drawText('Annahme durch (Ersteller)', {
      x: x + mm(1), y: y + h - mm(4), size: 7, font: fonts.bold, color: C_BLACK,
    })
    page.drawText(safe(data.inspector_name), {
      x: x + mm(1), y: y + mm(5.5), size: 8, font: fonts.regular, color: C_BLACK,
    })
    page.drawText(dateStr, {
      x: x + mm(1), y: y + mm(2), size: 7, font: fonts.regular, color: C_LABEL,
    })

    if (sigImg) {
      const sigMaxW = mm(45)
      const sigMaxH = mm(18)
      const aspect = sigImg.width / sigImg.height
      const sigW = Math.min(sigMaxW, sigMaxH * aspect)
      const sigH = sigW / aspect
      page.drawImage(sigImg, {
        x: x + (w - sigW) / 2,
        y: y + (h - sigH) / 2 - mm(1),
        width: sigW,
        height: sigH,
        opacity: 0.9,
      })
    }
  } else {
    // Überführung: 2 columns, absolute y=250 from top, each 87mm wide
    const sigYTop = 245   // mm from top
    const sigH = mm(30)
    const sigY = top(sigYTop, 30)

    const cols = [
      { x: mm(10),  label: 'Ersteller', name: data.inspector_name, img: sigImg },
      { x: mm(108), label: 'Empfänger', name: '',                   img: null   },
    ]

    for (const col of cols) {
      const w = mm(87)
      const boxW = mm(75)
      const boxH = mm(25)
      const boxX = col.x + (w - boxW) / 2

      page.drawRectangle({ x: col.x, y: sigY, width: w, height: sigH, borderColor: C_BLACK, borderWidth: 0.5 })
      page.drawText(col.label, {
        x: col.x + mm(1), y: sigY + sigH - mm(4.5), size: 7, font: fonts.bold, color: C_BLACK,
      })

      // Signature box
      page.drawRectangle({ x: boxX, y: sigY + mm(4), width: boxW, height: boxH, borderColor: C_BLACK, borderWidth: 0.4 })

      if (col.name) {
        page.drawText(safe(col.name), {
          x: col.x + mm(1), y: sigY + mm(2), size: 8, font: fonts.regular, color: C_BLACK,
        })
      }
      if (col.img) {
        const aspect = col.img.width / col.img.height
        const imgW = Math.min(boxW - mm(4), (boxH - mm(4)) * aspect)
        const imgH = imgW / aspect
        page.drawImage(col.img, {
          x: boxX + (boxW - imgW) / 2,
          y: sigY + mm(4) + (boxH - imgH) / 2,
          width: imgW,
          height: imgH,
          opacity: 0.9,
        })
      }
    }
    void pdfDoc  // suppress unused-var
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 2 — Photo documentation
// ─────────────────────────────────────────────────────────────────────────────

async function buildPhotoPage(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  logoImg: PDFImage | null,
  data: PdfData,
  vehiclePhotoImgs: Partial<Record<string, PDFImage>>
) {
  const page = pdfDoc.addPage([mm(210), mm(297)])
  await drawPageHeader(page, pdfDoc, fonts, logoImg, data, false)

  let cursorY = top(CONTENT_TOP)
  cursorY = drawHeading(page, fonts.bold, cursorY, '5. Fotodokumentation')

  // 5 photos: 2-column layout
  // col x positions: 10mm and 108mm; each 87mm wide
  // Portrait: max h=95mm; Landscape: max h=58mm
  type PhotoSlot = { key: string; col: 0 | 1; maxHMm: number; label: string }
  const slots: PhotoSlot[] = [
    { key: 'vorne',  col: 0, maxHMm: 95, label: 'Vorne' },
    { key: 'hinten', col: 1, maxHMm: 95, label: 'Hinten' },
    { key: 'links',  col: 0, maxHMm: 58, label: 'Links' },
    { key: 'rechts', col: 1, maxHMm: 58, label: 'Rechts' },
    { key: 'schein', col: 1, maxHMm: 58, label: 'Schein' },
  ]

  const colX = [mm(10), mm(108)]
  const colW = mm(87)
  const labelH = mm(6)

  // Track row bottoms per column so we know where to place next image
  let rowBot = [cursorY, cursorY]   // top of current row for each column

  // Row boundaries: row 0 = portrait (95mm), row 1 = landscape (58mm), row 2 = landscape (58mm)
  const rowMaxH = [mm(95), mm(58), mm(58)]
  const rowAssignment = [0, 0, 1, 1, 2] // slot index → row index

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    const img = vehiclePhotoImgs[slot.key]
    const row = rowAssignment[i]
    const colIdx = slot.col
    const x = colX[colIdx]
    const maxH = rowMaxH[row] - labelH
    const y = rowBot[colIdx] - rowMaxH[row]

    if (img) {
      // Scale to fit colW × maxH
      const aspect = img.width / img.height
      let imgW = colW
      let imgH = imgW / aspect
      if (imgH > maxH) { imgH = maxH; imgW = imgH * aspect }
      if (imgW > colW) { imgW = colW; imgH = imgW / aspect }

      page.drawImage(img, {
        x: x + (colW - imgW) / 2,
        y: y + labelH + (maxH - imgH) / 2,
        width: imgW,
        height: imgH,
      })
    } else {
      // Placeholder box
      page.drawRectangle({ x, y: y + labelH, width: colW, height: maxH, borderColor: C_CELL_BG, borderWidth: 0.5 })
      page.drawText('Kein Foto', {
        x: x + colW / 2 - mm(8), y: y + labelH + maxH / 2 - mm(2),
        size: 8, font: fonts.regular, color: C_CELL_BG,
      })
    }

    // Label below image
    page.drawText(slot.label, {
      x: x + mm(1), y: y + mm(1.5),
      size: 7.5, font: fonts.oblique, color: C_LABEL,
    })

    // Advance column cursor after last slot in each row per column
    rowBot[colIdx] = y
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page 3+ — Damage records
// ─────────────────────────────────────────────────────────────────────────────

async function buildDamagePages(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  logoImg: PDFImage | null,
  data: PdfData,
  damagePhotoImgs: Record<string, PDFImage>
) {
  if (data.damage_records.length === 0 && Object.keys(damagePhotoImgs).length === 0) return

  const page = pdfDoc.addPage([mm(210), mm(297)])
  await drawPageHeader(page, pdfDoc, fonts, logoImg, data, false)

  let cursorY = top(CONTENT_TOP)
  cursorY = drawHeading(page, fonts.bold, cursorY, '6. Erfasste Schäden')

  // Table header
  const cols = [mm(12), mm(58), mm(55), mm(65)]
  const headers = ['#', 'Position', 'Art', 'Intensität']
  let xOff = ML
  for (let i = 0; i < cols.length; i++) {
    page.drawRectangle({ x: xOff, y: cursorY - ROW7, width: cols[i], height: ROW7, color: C_CELL_BG, borderWidth: 0 })
    page.drawRectangle({ x: xOff, y: cursorY - ROW7, width: cols[i], height: ROW7, borderColor: C_BLACK, borderWidth: 0.5 })
    page.drawText(headers[i], { x: xOff + mm(1), y: cursorY - mm(5), size: 8, font: fonts.bold, color: C_BLACK })
    xOff += cols[i]
  }
  cursorY -= ROW7

  // Table rows
  for (let idx = 0; idx < data.damage_records.length; idx++) {
    const d = data.damage_records[idx]
    const values = [`${idx + 1}`, d.pos, d.type, d.int]
    xOff = ML
    for (let i = 0; i < cols.length; i++) {
      page.drawRectangle({ x: xOff, y: cursorY - ROW7, width: cols[i], height: ROW7, borderColor: C_BLACK, borderWidth: 0.5 })
      page.drawText(safe(values[i]), { x: xOff + mm(1), y: cursorY - mm(5), size: 8, font: fonts.regular, color: C_BLACK })
      xOff += cols[i]
    }
    cursorY -= ROW7
  }

  // Damage photos: 2-column layout
  if (Object.keys(damagePhotoImgs).length > 0) {
    cursorY -= mm(4)
    const colX = [mm(10), mm(108)]
    const colW = mm(87)
    const maxH = mm(60)
    const labelH = mm(6)
    let col = 0
    let rowY = cursorY

    // Start new page if not enough space
    const minSpace = maxH + labelH + mm(10)
    let currentPage = page
    if (cursorY - minSpace < mm(20)) {
      currentPage = pdfDoc.addPage([mm(210), mm(297)])
      await drawPageHeader(currentPage, pdfDoc, fonts, logoImg, data, false)
      rowY = top(CONTENT_TOP)
    }

    const damageKeys = data.damage_records
      .map((_, i) => `schaden_d_${i}`)
      .filter((k) => damagePhotoImgs[k])

    // Also include any schaden_ keys not matched by index
    const allDamageKeys = [
      ...damageKeys,
      ...Object.keys(damagePhotoImgs).filter((k) => !damageKeys.includes(k)),
    ]

    for (let di = 0; di < allDamageKeys.length; di++) {
      const key = allDamageKeys[di]
      const img = damagePhotoImgs[key]
      if (!img) continue

      if (col === 0 && di > 0) {
        // Check if we need a new page (after filling both columns)
        if (rowY - maxH - labelH < mm(20)) {
          currentPage = pdfDoc.addPage([mm(210), mm(297)])
          await drawPageHeader(currentPage, pdfDoc, fonts, logoImg, data, false)
          rowY = top(CONTENT_TOP)
          col = 0
        }
      }

      const x = colX[col]
      const y = rowY - maxH - labelH
      const aspect = img.width / img.height
      let imgW = colW
      let imgH = imgW / aspect
      if (imgH > maxH) { imgH = maxH; imgW = imgH * aspect }

      currentPage.drawImage(img, {
        x: x + (colW - imgW) / 2,
        y: y + labelH + (maxH - imgH) / 2,
        width: imgW,
        height: imgH,
      })

      // Label: "Schaden #N" or damage position
      const dmgIdx = data.damage_records[di]
      const labelText = dmgIdx
        ? `Schaden ${di + 1}: ${safe(dmgIdx.pos)}`
        : `Schaden ${di + 1}`
      currentPage.drawText(labelText, {
        x: x + mm(1), y: y + mm(1.5),
        size: 7.5, font: fonts.oblique, color: C_LABEL,
      })

      col++
      if (col === 2) {
        col = 0
        rowY -= maxH + labelH + mm(2)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export async function generatePdf(data: PdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
  const fonts: Fonts = { regular, bold, oblique }

  // ── Load logo ───────────────────────────────────────────────────────────────
  let logoImg: PDFImage | null = null
  try {
    const logoResp = await fetch('/logo.png')
    if (logoResp.ok) {
      const logoBytes = new Uint8Array(await logoResp.arrayBuffer())
      logoImg = await pdfDoc.embedPng(logoBytes)
    }
  } catch { /* logo is optional */ }

  // ── Load & embed vehicle photos ─────────────────────────────────────────────
  const photoKeys = ['vorne', 'hinten', 'links', 'rechts', 'schein']
  const vehiclePhotoImgs: Partial<Record<string, PDFImage>> = {}
  await Promise.all(
    photoKeys.map(async (k) => {
      const url = data.photos[k]
      if (!url) return
      const bytes = await fetchJpeg(url)
      if (bytes) vehiclePhotoImgs[k] = await pdfDoc.embedJpg(bytes)
    })
  )

  // ── Load signature ──────────────────────────────────────────────────────────
  let sigImg: PDFImage | null = null
  const sigUrl = data.photos['signature']
  if (sigUrl) {
    const sigBytes = await fetchPng(sigUrl)
    if (sigBytes) sigImg = await pdfDoc.embedPng(sigBytes)
  }

  // ── Load damage photos ──────────────────────────────────────────────────────
  const damagePhotoImgs: Record<string, PDFImage> = {}
  const damagePhotoEntries = Object.entries(data.photos).filter(([k]) => k.startsWith('schaden_'))
  await Promise.all(
    damagePhotoEntries.map(async ([k, url]) => {
      const bytes = await fetchJpeg(url)
      if (bytes) damagePhotoImgs[k] = await pdfDoc.embedJpg(bytes)
    })
  )

  // ── Page 1 ──────────────────────────────────────────────────────────────────
  const page1 = pdfDoc.addPage([mm(210), mm(297)])
  await drawPageHeader(page1, pdfDoc, fonts, logoImg, data, true)

  let cursorY = top(CONTENT_TOP)
  cursorY = drawSection1Basisdaten(page1, fonts, cursorY, data)
  cursorY = drawSection2Technik(page1, fonts, cursorY, data)
  cursorY = drawSection3Checkliste(page1, fonts, cursorY, data)
  cursorY = drawSection4Bemerkungen(page1, fonts, cursorY, data)
  void cursorY

  await drawSignatures(page1, pdfDoc, fonts, data, sigImg)

  // ── Page 2: Photos ──────────────────────────────────────────────────────────
  await buildPhotoPage(pdfDoc, fonts, logoImg, data, vehiclePhotoImgs)

  // ── Page 3+: Damages ────────────────────────────────────────────────────────
  await buildDamagePages(pdfDoc, fonts, logoImg, data, damagePhotoImgs)

  // ── Draft watermark on all pages ────────────────────────────────────────────
  if (data.status === 'draft') {
    for (const page of pdfDoc.getPages()) {
      drawWatermark(page, bold)
    }
  }

  return pdfDoc.save()
}
