// Beispieldaten für beide Protokollarten – zum Ausprobieren und als
// Referenz, welche Felder das PDF liest.

import type { PdfData } from './generatePdf'

const checkliste = {
  floor: true, seats: true, entry: true, instruments: true, trunk: false, engine: true,
  aid_kit: true, triangle: true, vest: true, cable: false, registration: true, card: false,
}

/** Überführungsprotokoll: zwei Unterschriften (Ersteller, Empfänger). */
export const exampleTransfer: PdfData = {
  protocol_type: 'transfer',
  status: 'final',                       // 'draft' → Wasserzeichen "VORLAEUFIGER ENTWURF"
  inspector_name: 'Max Mustermann',
  location: 'CarHandling Campus → Hamburg',   // " → " trennt Von / Nach
  odometer: 12345,
  fuel_level: 80,
  battery: 95,
  remarks: 'Fahrzeug ohne Auffälligkeiten übergeben.',
  inspection_date: '2026-10-06T10:00:00Z',
  license_plate: 'WI-L 8957E',
  brand_model: 'Lynk & Co 08',
  vin: 'LB1234567890ABCDE',
  receiver_name: 'Erika Musterfrau',
  transfer_type: 'Hinbringen',
  conditions: ['Trocken', 'Tageslicht'],
  checkliste,
  damage_records: [
    { pos: 'Tür vorne links', type: 'Kratzer', int: 'Oberflächlich' },
    { pos: 'Stoßfänger hinten', type: 'Delle', int: 'Mittel' },
  ],
  // Öffentliche URLs (z.B. Supabase Storage), Blob- oder Data-URLs.
  photos: {
    vorne: '', hinten: '', links: '', rechts: '', schein: '',
    // signature, signature_receiver   → PNG
    // schaden_0, schaden_1, …          → Foto je Schaden (Index = damage_records)
    // zusatz_0, zusatz_1, …            → "7. Weitere Fotos"
  },
}

/** Annahmeprotokoll: Unterschrift Ersteller, optional Spediteur (signature_carrier). */
export const exampleAnnahme: PdfData = {
  ...exampleTransfer,
  protocol_type: 'annahme',
  location: 'CarHandling Campus',
  receiver_name: undefined,
  transfer_type: undefined,
}
