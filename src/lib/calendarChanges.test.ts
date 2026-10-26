import { describe, expect, it } from 'vitest'
import { changedFields, sameText } from './calendarChanges'
import { event, link } from './calendarTestUtils'

/** Der Termin, wie er zur Zeit der Übernahme aussah – passend zu link(). */
function unchanged(overrides = {}) {
  return event({
    uid: 'uid-1',
    summary: 'Lynk 08 WI-L 8957E in München',
    date_from: '2026-11-02',
    date_to: '2026-11-09',
    location: 'München',
    description: 'Notiz',
    ...overrides,
  })
}

describe('sameText', () => {
  it('ignoriert Leerraum und Groß-/Kleinschreibung', () => {
    expect(sameText('  München ', 'münchen')).toBe(true)
    expect(sameText('München', 'Hamburg')).toBe(false)
  })

  it('setzt fehlende Werte mit leerem Text gleich', () => {
    expect(sameText(null, '')).toBe(true)
    expect(sameText(undefined, null)).toBe(true)
    expect(sameText(null, 'x')).toBe(false)
  })
})

describe('changedFields', () => {
  it('meldet nichts, wenn alles gleich ist', () => {
    expect(changedFields(link(), unchanged())).toEqual([])
  })

  it('meldet nichts für Zeilen ohne Schnappschuss', () => {
    const old = link({ date_from: null, summary: null, location: null, description: null })
    expect(changedFields(old, unchanged({ summary: 'ganz anders', date_from: '2027-01-01' }))).toEqual([])
  })

  describe('Titel', () => {
    it('meldet einen neuen Titel', () => {
      expect(changedFields(link(), unchanged({ summary: 'Lynk 08 WI-L 8957E in Hamburg' }))).toEqual(['title'])
    })

    it('meldet keine Änderung bei Leerraum oder Schreibweise', () => {
      expect(changedFields(link(), unchanged({ summary: '  LYNK 08 wi-l 8957e IN MÜNCHEN ' }))).toEqual([])
    })

    it('meldet ein später angehängtes Fragezeichen', () => {
      expect(changedFields(link(), unchanged({ summary: 'Lynk 08 WI-L 8957E in München ?' }))).toEqual(['title'])
    })
  })

  describe('Datum', () => {
    it('meldet ein neues Ende', () => {
      expect(changedFields(link(), unchanged({ date_to: '2026-11-16' }))).toEqual(['date'])
    })

    it('meldet einen neuen Beginn', () => {
      expect(changedFields(link(), unchanged({ date_from: '2026-11-03' }))).toEqual(['date'])
    })

    it('meldet ein weggefallenes Ende', () => {
      expect(changedFields(link(), unchanged({ date_to: null }))).toEqual(['date'])
    })

    it('meldet ein neu hinzugekommenes Ende', () => {
      expect(changedFields(link({ date_to: null }), unchanged({ date_to: '2026-11-09' }))).toEqual(['date'])
    })
  })

  describe('Uhrzeit', () => {
    it('hält "12:00:00" aus der Datenbank und "12:00" aus dem Feed für gleich', () => {
      const old = link({ time_from: '12:00:00', time_to: '13:00:00' })
      expect(changedFields(old, unchanged({ time_from: '12:00', time_to: '13:00' }))).toEqual([])
    })

    it('meldet eine neue Uhrzeit', () => {
      const old = link({ time_from: '12:00:00' })
      expect(changedFields(old, unchanged({ time_from: '14:30' }))).toEqual(['time'])
    })

    it('meldet eine neu hinzugekommene Uhrzeit', () => {
      expect(changedFields(link(), unchanged({ time_from: '12:00' }))).toEqual(['time'])
    })

    it('meldet ein neues Ende der Uhrzeit', () => {
      const old = link({ time_from: '12:00:00', time_to: '13:00:00' })
      expect(changedFields(old, unchanged({ time_from: '12:00', time_to: '14:00' }))).toEqual(['time'])
    })
  })

  describe('Ort', () => {
    it('meldet einen neuen Ort', () => {
      expect(changedFields(link(), unchanged({ location: 'Hamburg' }))).toEqual(['location'])
    })

    it('meldet einen weggefallenen Ort', () => {
      expect(changedFields(link(), unchanged({ location: null }))).toEqual(['location'])
    })

    it('meldet keine Änderung bei Leerraum oder Schreibweise', () => {
      expect(changedFields(link(), unchanged({ location: ' MÜNCHEN' }))).toEqual([])
    })
  })

  describe('Notizen', () => {
    it('meldet geänderte Notizen', () => {
      expect(changedFields(link(), unchanged({ description: 'Neue Notiz' }))).toEqual(['notes'])
    })

    it('meldet gelöschte Notizen', () => {
      expect(changedFields(link(), unchanged({ description: null }))).toEqual(['notes'])
    })

    it('meldet nichts, wenn die alten Notizen unbekannt sind', () => {
      const old = link({ description: null })
      expect(changedFields(old, unchanged({ description: 'Irgendwas' }))).toEqual([])
    })

    it('hält leere und fehlende Notizen für gleich', () => {
      expect(changedFields(link({ description: '' }), unchanged({ description: null }))).toEqual([])
    })
  })

  it('meldet mehrere Änderungen in fester Reihenfolge', () => {
    const changed = unchanged({
      summary: 'Neu',
      date_to: '2026-11-16',
      time_from: '10:00',
      location: 'Köln',
      description: 'Neu',
    })
    expect(changedFields(link(), changed)).toEqual(['title', 'date', 'time', 'location', 'notes'])
  })
})
