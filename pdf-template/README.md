# PDF-Vorlage: Fahrzeug-Protokolle

Eigenständige Kopie des PDF-Generators aus `src/lib/generatePdf.ts`. Eine neue
App, die diesen Ordner übernimmt, erzeugt **dieselben PDFs** wie
fahrzeug-protokolle-v2 – Annahme- und Überführungsprotokoll, Deutsch und
Englisch, mit Fotos, Schäden, Unterschriften und Entwurfs-Wasserzeichen.

Beispiele: `beispiele/beispiel-ueberfuehrung.pdf`,
`beispiele/beispiel-annahme-entwurf.pdf`, `beispiele/example-transfer-en.pdf`
(mit Testfotos erzeugt).

## Inhalt

| Datei | Zweck |
|-------|-------|
| `src/generatePdf.ts` | Der Generator. Einzige Abhängigkeit: `pdf-lib` |
| `src/downloadPdf.ts` | Erzeugen + Teilen/Herunterladen (Web Share, iOS, Download) |
| `src/example.ts` | Beispieldaten für beide Protokollarten |
| `public/carhandling.png` | Logo oben rechts auf jeder Seite |

## In eine neue App übernehmen

```bash
npm install pdf-lib@^1.17.1
cp pdf-template/src/*.ts        <neue-app>/src/lib/pdf/
cp pdf-template/public/carhandling.png <neue-app>/public/
```

```ts
import { downloadPdf } from './lib/pdf/downloadPdf'
import type { PdfData } from './lib/pdf/generatePdf'

await downloadPdf(data, 'de')          // oder 'en'
```

Nur die Bytes (z.B. zum Hochladen):

```ts
import { generatePdf } from './lib/pdf/generatePdf'
const bytes: Uint8Array = await generatePdf(data, 'de', { logoUrl: '/carhandling.png' })
```

Läuft im Browser: Fotos werden per `fetch` geladen und über ein `<canvas>` auf
höchstens 700 px (weitere Fotos 900 px) verkleinert und als JPEG eingebettet.
Für Node bräuchte `fetchJpeg` einen Ersatz für Canvas (z.B. `sharp`).

## Daten (`PdfData`)

| Feld | Bedeutung |
|------|-----------|
| `protocol_type` | `'annahme'` oder `'transfer'` – bestimmt Titel, Basisdaten-Raster und Unterschriften |
| `status` | `'draft'` legt "VORLAEUFIGER ENTWURF" schräg über jede Seite |
| `inspector_name` | Ersteller |
| `location` | Annahme: Standort. Überführung: `"Von → Nach"` (mit ` → ` getrennt) |
| `odometer`, `fuel_level`, `battery` | KM-Stand, Kraftstoff %, Batterie % |
| `remarks` | Bemerkungen; leer → Abschnitt 4 entfällt |
| `inspection_date` | ISO-Datum; unter der Unterschrift und im Dateinamen |
| `license_plate`, `brand_model`, `vin` | Fahrzeug |
| `receiver_name`, `transfer_type` | nur Überführung: Empfänger, "Art der Überführung" |
| `conditions` | Bedingungen, kommagetrennt ausgegeben |
| `checkliste` | 6× Zustand (sauber/schmutzig), 6× Zubehör (ja/nein) |
| `damage_records` | `{ pos, type, int }` – deutsche Werte, für EN übersetzt |
| `photos` | URLs je Schlüssel, siehe unten |

### Schlüssel in `photos`

| Schlüssel | Wo im PDF |
|-----------|-----------|
| `vorne`, `hinten` | Seite 2, oben (hochkant, bis 95 mm) |
| `links`, `rechts`, `schein` | Seite 2, darunter (quer, bis 58 mm) |
| `signature` | Unterschrift Ersteller (PNG) |
| `signature_receiver` | Überführung: Unterschrift Empfänger (PNG) |
| `signature_carrier` | Annahme: Übergabe durch Spediteur (PNG) |
| `schaden_0`, `schaden_1`, … | Foto zum Schaden mit demselben Index (auch alt: `schaden_d_0`) |
| `zusatz_0`, `zusatz_1`, … | "7. Weitere Fotos", sechs je Seite |

Fehlt ein Fahrzeugfoto, steht dort ein Rahmen "Kein Foto"; nicht ladbare
Bilder werden übersprungen, das PDF entsteht trotzdem.

## Aufbau des PDFs

1. **Seite 1:** Titel, 1. Basisdaten, 2. Technik & Betriebsstoffe,
   3. Checkliste, 4. Bemerkungen, Unterschriften unten
2. **Seite 2:** 5. Fotodokumentation
3. **Seite 3+:** 6. Erfasste Schäden (Tabelle + Fotos), nur wenn vorhanden
4. danach 7. Weitere Fotos – auf der letzten Schadensseite, wenn noch eine
   Reihe passt, sonst auf neuer Seite

Jede Seite: A4, Logo oben rechts, roter Balken links unten, grauer Balken
rechts oben mit "perfection in motion".

## Anpassen

- **Firmenlogo / Branding:** `public/carhandling.png` ersetzen oder
  `logoUrl` übergeben; Farben stehen oben als `C_RED`, `C_DKGRAY`, …;
  der Slogan in `drawPageHeader`.
- **Texte:** `PDF_LABELS` (DE/EN). Die Standardschrift Helvetica kann nur
  Latin-1 – Umlaute in den Labels sind deshalb als `ae`/`ue` geschrieben,
  Zeichen außerhalb von Latin-1 ersetzt `safe()` durch `?`. Für volle
  Unicode-Unterstützung eine TTF mit `@pdf-lib/fontkit` einbetten.
- **Maße:** alles in mm, `mm()` rechnet in Punkte um, `top()` misst von oben.
