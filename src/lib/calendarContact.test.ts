import { describe, expect, it } from 'vitest'
import { extractContact } from './calendarContact'

describe('extractContact', () => {
  describe('ohne Inhalt', () => {
    it.each([null, undefined, '', '   \n  '])('liefert nichts für %j', (input) => {
      expect(extractContact(input)).toEqual({ name: null, phone: null })
    })
  })

  describe('beschriftete Angaben', () => {
    it('liest Ansprechpartner und Telefon', () => {
      expect(extractContact('Ansprechpartner: Herr Schulz\nTel: 0171 1234567')).toEqual({
        name: 'Herr Schulz',
        phone: '0171 1234567',
      })
    })

    it.each([
      ['Tel: 040 123456', '040 123456'],
      ['Telefon: 040 123456', '040 123456'],
      ['Mobil: +49 171 1234567', '+49 171 1234567'],
      ['Handy 0171/1234567', '0171/1234567'],
      ['Phone: 0171 1234567', '0171 1234567'],
    ])('erkennt die Beschriftung in "%s"', (line, phone) => {
      expect(extractContact(line).phone).toBe(phone)
    })

    it('nimmt die beschriftete Nummer, auch wenn weiter oben eine andere steht', () => {
      const result = extractContact('Auftrag 0211 998877\nTel: 0171 1234567')
      expect(result.phone).toBe('0171 1234567')
    })

    it('schneidet den Namen an der Telefonbeschriftung ab', () => {
      expect(extractContact('Kontakt: Herr Schulz, Tel. 0171 1234567')).toEqual({
        name: 'Herr Schulz',
        phone: '0171 1234567',
      })
    })

    it.each([
      ['Kontaktperson: Anna Berg', 'Anna Berg'],
      ['Ansprechpartnerin - Eva Roth', 'Eva Roth'],
      ['AP: Müller', 'Müller'],
      ['• Abholer: Jonas Klein', 'Jonas Klein'],
    ])('liest den Namen aus "%s"', (line, name) => {
      expect(extractContact(line).name).toBe(name)
    })

    it('nimmt hinter einer Beschriftung auch Kleingeschriebenes', () => {
      expect(extractContact('Ansprechpartner: schulz').name).toBe('schulz')
    })

    it('hält "AP" ohne Doppelpunkt nicht für eine Beschriftung', () => {
      expect(extractContact('Apfelkuchen mit Sahne').name).toBeNull()
    })

    it('kommt mit Windows-Zeilenenden zurecht', () => {
      expect(extractContact('Ansprechpartner: Herr Schulz\r\nTel: 0171 1234567')).toEqual({
        name: 'Herr Schulz',
        phone: '0171 1234567',
      })
    })
  })

  describe('unbeschriftete Nummer', () => {
    it('nimmt den Text davor als Namen', () => {
      expect(extractContact('Frau Weber 0151 2345678')).toEqual({
        name: 'Frau Weber',
        phone: '0151 2345678',
      })
    })

    it('akzeptiert +, 00 und Klammer als Anfang', () => {
      expect(extractContact('+49 171 1234567').phone).toBe('+49 171 1234567')
      expect(extractContact('0049 171 1234567').phone).toBe('0049 171 1234567')
      expect(extractContact('(040) 1234567').phone).toBe('(040) 1234567')
    })

    it('hält eine Auftragsnummer nicht für eine Rufnummer', () => {
      expect(extractContact('Auftrag 12345678').phone).toBeNull()
      expect(extractContact('Referenz: 98765432').phone).toBeNull()
    })

    it.each([
      'Abholung am 18.09.2026',
      'Zeitraum 08.09. – 10.09.',
      '18/09/2026',
      '2026-09-18',
    ])('hält das Datum in "%s" nicht für eine Rufnummer', (line) => {
      expect(extractContact(line).phone).toBeNull()
    })

    // Datumsangaben mit führender Null bestehen die Vorwahl-Prüfung und haben
    // genug Ziffern – nur die Datumserkennung hält sie davon ab.
    it.each([
      'Abholung 08.09.2026',
      'Zeitraum 02.11.2026 – 09.11.2026',
      'Zeitraum 08.09.-10.09.',
      'Ab 01.10.2026 um 12 Uhr',
    ])('hält das Datum in "%s" mit führender Null nicht für eine Rufnummer', (line) => {
      expect(extractContact(line).phone).toBeNull()
    })

    it('hält auch hinter einer Beschriftung ein Datum nicht für eine Rufnummer', () => {
      expect(extractContact('Tel: 18.09.2026').phone).toBeNull()
    })

    it('findet die Nummer, wenn neben einem Datum eine echte steht', () => {
      expect(extractContact('Abholung 08.09.2026, Tel 0171 1234567').phone).toBe('0171 1234567')
      expect(extractContact('Abholung 08.09.2026\n0171 1234567').phone).toBe('0171 1234567')
    })

    it('hält eine Uhrzeit nicht für eine Rufnummer', () => {
      expect(extractContact('Abholung 08:30 - 12:00').phone).toBeNull()
    })

    it('verlangt bei beschrifteten Nummern mindestens sechs Ziffern', () => {
      expect(extractContact('Tel: 12345').phone).toBeNull()
      expect(extractContact('Tel: 123456').phone).toBe('123456')
    })

    it('verlangt bei unbeschrifteten Nummern mindestens sieben Ziffern', () => {
      expect(extractContact('0171 12').phone).toBeNull()
      expect(extractContact('0171 123').phone).toBe('0171 123')
    })

    it('verwirft mehr als fünfzehn Ziffern', () => {
      expect(extractContact('Tel: 0171 1234567 890123').phone).toBeNull()
    })

    it('fasst Leerraum in der Nummer zusammen', () => {
      expect(extractContact('Tel: 0171   1234567').phone).toBe('0171 1234567')
    })
  })

  describe('Zeilen ohne Brauchbares', () => {
    it.each([
      'https://firma.de/0171 1234567',
      'www.firma.de 0171 1234567',
      'info@firma.de 0171 1234567',
    ])('überspringt "%s"', (line) => {
      expect(extractContact(line)).toEqual({ name: null, phone: null })
    })
  })

  describe('Name über der Nummer', () => {
    it('nimmt die Zeile darüber', () => {
      expect(extractContact('Max Mustermann\n0171 1234567')).toEqual({
        name: 'Max Mustermann',
        phone: '0171 1234567',
      })
    })

    it('überspringt eine Anschrift mit Hausnummer', () => {
      expect(extractContact('Max Mustermann\nHauptstraße 5\n0171 1234567').name).toBe('Max Mustermann')
    })

    it.each(['Am Hafenweg', 'Königsallee', 'Rathausplatz', 'Postfach'])(
      'überspringt die Straßenzeile "%s"',
      (street) => {
        expect(extractContact(`Max Mustermann\n${street}\n0171 1234567`).name).toBe('Max Mustermann')
      }
    )

    // Zeilen, die ein Name sein könnten (Großbuchstaben), aber eine Ziffer
    // enthalten, sind eine Anschrift: Hallennummer, Hausnummer, Postleitzahl.
    it.each(['Halle B2', 'Block A7', 'Tor 3 Nord', 'D-22850 Norderstedt'])(
      'überspringt die Zeile "%s" wegen der Ziffer',
      (line) => {
        expect(extractContact(`Max Mustermann\n${line}\n0171 1234567`).name).toBe('Max Mustermann')
      }
    )

    it('überspringt, was schon im Ort des Termins steht', () => {
      const text = 'Harksheide Norderstedt\n0171 1234567'
      expect(extractContact(text).name).toBe('Harksheide Norderstedt')
      expect(extractContact(text, { exclude: 'Harksheide, Norderstedt' }).name).toBeNull()
    })

    it('geht hinter einer Anschrift weiter nach oben', () => {
      const text = 'Max Mustermann\nHarksheide Norderstedt\n0171 1234567'
      expect(extractContact(text, { exclude: 'Harksheide, Norderstedt' }).name).toBe('Max Mustermann')
    })

    it('nimmt einen halben Satz nicht als Namen', () => {
      expect(extractContact('telefonisch erreichbar unter 0171 1234567').name).toBeNull()
    })

    it('lässt Namenszusätze klein', () => {
      expect(extractContact('Hans von der Heide\n0171 1234567').name).toBe('Hans von der Heide')
    })

    it('nimmt mehr als fünf Wörter nicht als Namen', () => {
      expect(extractContact('Dr Hans Peter Müller Schmidt Meier\n0171 1234567').name).toBeNull()
    })
  })

  describe('Rangfolge der Namen', () => {
    it('bevorzugt den beschrifteten vor dem Text vor der Nummer', () => {
      const text = 'Frau Weber 0151 2345678\nAnsprechpartner: Herr Schulz'
      expect(extractContact(text).name).toBe('Herr Schulz')
    })
  })
})
