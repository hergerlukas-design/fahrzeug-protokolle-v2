import { describe, expect, it } from 'vitest'
import {
  classifyEvent,
  groupCalendarEvents,
  isUnconfirmed,
  mergeEvents,
  splitSwap,
  swapTitles,
} from './calendarPairs'
import { event } from './calendarTestUtils'

describe('classifyEvent', () => {
  it.each([
    ['Abholung LYNK 02 DPG98A in Emmering', 'abholung'],
    ['Rückholung LYNK 02', 'abholung'],
    ['Ruckholung LYNK 02', 'abholung'],
    ['Pickup Lynk 02', 'abholung'],
    ['Überführung LYNK 02 DPG98A', 'ueberfuehrung'],
    ['Ueberfuehrung LYNK 02', 'ueberfuehrung'],
    ['UEBERFÜHRUNG LYNK 02', 'ueberfuehrung'],
    ['Lieferung Tesla nach Köln', 'ueberfuehrung'],
    ['Tausch Lynk 08 WI-L 8957E gegen DPG98A', 'tausch'],
    ['Fahrzeugwechsel WI-L 8957E', 'tausch'],
  ])('"%s" ist %s', (summary, kind) => {
    expect(classifyEvent(summary)).toBe(kind)
  })

  it('lässt einen Titel ohne Schlagwort unbestimmt', () => {
    expect(classifyEvent('LYNK 02 DPG98A Emmering 21.09. - 09.10.')).toBe('unbekannt')
  })

  it('lässt einen Titel mit beiden Arten unbestimmt', () => {
    expect(classifyEvent('Abholung zur Überführung')).toBe('unbekannt')
  })

  it('lässt den Tausch vor allem anderen gelten', () => {
    expect(classifyEvent('Abholung und Tausch WI-L 8957E gegen DPG98A')).toBe('tausch')
  })

  it.each([null, undefined, ''])('behandelt %j als unbestimmt', (summary) => {
    expect(classifyEvent(summary)).toBe('unbekannt')
  })
})

describe('isUnconfirmed', () => {
  it('erkennt das Fragezeichen', () => {
    expect(isUnconfirmed('Lynk 08 WI-L 8957E in München ?')).toBe(true)
    expect(isUnconfirmed('Lynk 08 WI-L 8957E in München')).toBe(false)
    expect(isUnconfirmed(null)).toBe(false)
  })
})

describe('splitSwap', () => {
  it('teilt am Trennwort und lässt "Tausch" weg', () => {
    expect(splitSwap('Tausch Lynk 08 WI-L 8957E gegen 02 DPG98A')).toEqual({
      pick: 'Lynk 08 WI-L 8957E',
      bring: '02 DPG98A',
    })
  })

  it.each([
    ['Tausch A 111 vs. B 222', 'A 111', 'B 222'],
    ['Tausch A 111 vs B 222', 'A 111', 'B 222'],
    ['Wechsel A 111 statt B 222', 'A 111', 'B 222'],
    ['Fahrzeugtausch: A 111 gegen B 222', 'A 111', 'B 222'],
    ['Swap A 111 → B 222', 'A 111', 'B 222'],
    ['A 111 -> B 222', 'A 111', 'B 222'],
  ])('teilt "%s"', (summary, pick, bring) => {
    expect(splitSwap(summary)).toEqual({ pick, bring })
  })

  it('gibt null ohne Trennwort', () => {
    expect(splitSwap('Tausch Lynk 08 WI-L 8957E')).toBeNull()
  })

  it('gibt null, wenn eine Hälfte fehlt', () => {
    expect(splitSwap('Tausch WI-L 8957E gegen ')).toBeNull()
    expect(splitSwap('Tausch gegen WI-L 8957E')).toBeNull()
  })

  it('teilt am ersten Trennwort', () => {
    expect(splitSwap('Tausch A gegen B statt C')).toEqual({ pick: 'A', bring: 'B statt C' })
  })

  it('hält "gegen" mitten in einem Wort nicht für ein Trennwort', () => {
    expect(splitSwap('Tausch Entgegenkommen 111')).toBeNull()
  })

  it.each([null, undefined, ''])('gibt null für %j', (summary) => {
    expect(splitSwap(summary)).toBeNull()
  })
})

describe('swapTitles', () => {
  it('findet den Tauschtermin auch, wenn er nicht der erste ist', () => {
    const events = [
      event({ uid: 'a', summary: 'LYNK 08 WI-L 8957E in Hamburg', date_from: '2026-10-21', date_to: '2026-11-05' }),
      event({ uid: 'b', summary: 'Tausch WI-L 8957E gegen DPG98A', date_from: '2026-11-05' }),
    ]
    expect(swapTitles(events)).toEqual({ pick: 'WI-L 8957E', bring: 'DPG98A' })
  })

  it('gibt null ohne Tauschtermin', () => {
    expect(swapTitles([event({ uid: 'a', summary: 'Abholung WI-L 8957E', date_from: '2026-11-05' })])).toBeNull()
  })

  it('gibt null, wenn der Tauschtermin kein Trennwort hat', () => {
    expect(swapTitles([event({ uid: 'a', summary: 'Tausch WI-L 8957E', date_from: '2026-11-05' })])).toBeNull()
  })

  it('überspringt einen Tauschtermin ohne Trennwort und nimmt den nächsten', () => {
    const events = [
      event({ uid: 'a', summary: 'Tausch WI-L 8957E', date_from: '2026-11-05' }),
      event({ uid: 'b', summary: 'Tausch A 111 gegen B 222', date_from: '2026-11-06' }),
    ]
    expect(swapTitles(events)).toEqual({ pick: 'A 111', bring: 'B 222' })
  })
})

describe('groupCalendarEvents', () => {
  const car = { id: 'car-1' }
  const other = { id: 'car-2' }
  const sameCar = () => car

  const span = event({ uid: 'span', summary: 'LYNK 02 MY27 in Seevetal', date_from: '2026-11-02', date_to: '2026-11-09' })
  const pickup = event({
    uid: 'pick',
    summary: 'Abholung LYNK 02 MY27 in Seevetal',
    date_from: '2026-11-09',
    time_from: '12:00',
  })

  it('bündelt Überführung und Abholung darin zu einer Fahrt', () => {
    const groups = groupCalendarEvents([pickup, span], sameCar)
    expect(groups).toHaveLength(1)
    expect(groups[0].events.map((e) => e.uid)).toEqual(['span', 'pick'])
    expect(groups[0].key).toBe('span+pick')
    expect(groups[0].vehicle).toBe(car)
  })

  it('bündelt unabhängig von der Reihenfolge der Eingabe', () => {
    const a = groupCalendarEvents([span, pickup], sameCar)
    const b = groupCalendarEvents([pickup, span], sameCar)
    expect(a).toEqual(b)
  })

  it('bündelt, wenn die Abholung mitten im Zeitraum liegt', () => {
    const mid = { ...pickup, uid: 'mid', date_from: '2026-11-05' }
    expect(groupCalendarEvents([span, mid], sameCar)[0].events).toHaveLength(2)
  })

  it('bündelt, wenn die Abholung am ersten Tag liegt', () => {
    const first = { ...pickup, uid: 'first', date_from: '2026-11-02' }
    expect(groupCalendarEvents([span, first], sameCar)[0].events).toHaveLength(2)
  })

  it('lässt zwei Fahrten desselben Fahrzeugs in derselben Woche getrennt', () => {
    const later = { ...pickup, uid: 'later', date_from: '2026-11-12' }
    const groups = groupCalendarEvents([span, later], sameCar)
    expect(groups.map((g) => g.events.length)).toEqual([1, 1])
  })

  it('lässt Termine verschiedener Fahrzeuge getrennt', () => {
    const groups = groupCalendarEvents([span, pickup], (e) => (e.uid === 'span' ? car : other))
    expect(groups.map((g) => g.events.length)).toEqual([1, 1])
  })

  it('lässt Termine ohne Fahrzeug für sich', () => {
    const groups = groupCalendarEvents([span, pickup], () => null)
    expect(groups.map((g) => g.events.length)).toEqual([1, 1])
    expect(groups.every((g) => g.vehicle === null)).toBe(true)
  })

  it('macht aus zwei Abholungen nicht eine Fahrt', () => {
    const second = { ...pickup, uid: 'pick2' }
    const groups = groupCalendarEvents([pickup, second], sameCar)
    expect(groups.map((g) => g.events.length)).toEqual([1, 1])
  })

  it('macht aus zwei unbestimmten Terminen nicht eine Fahrt', () => {
    const a = event({ uid: 'a', summary: 'LYNK 02 in Seevetal', date_from: '2026-11-02', date_to: '2026-11-09' })
    const b = event({ uid: 'b', summary: 'LYNK 02 in Hamburg', date_from: '2026-11-09' })
    expect(groupCalendarEvents([a, b], sameCar)).toHaveLength(2)
  })

  it('bündelt eine Abholung mit einem unbestimmten Termin', () => {
    expect(groupCalendarEvents([span, pickup], sameCar)).toHaveLength(1)
  })

  it('bündelt eine ausdrückliche Überführung mit der Abholung', () => {
    const named = { ...span, uid: 'named', summary: 'Überführung LYNK 02 MY27' }
    expect(groupCalendarEvents([named, pickup], sameCar)).toHaveLength(1)
  })

  it('nimmt als Partner den nächstgelegenen Termin', () => {
    const early = { ...pickup, uid: 'early', date_from: '2026-11-04' }
    const groups = groupCalendarEvents([span, early, pickup], sameCar)
    expect(groups[0].events.map((e) => e.uid)).toEqual(['span', 'early'])
    expect(groups[1].events.map((e) => e.uid)).toEqual(['pick'])
  })

  it('erlaubt mit maxGapDays einen Abstand', () => {
    const away = event({ uid: 'away', summary: 'Abholung LYNK 02', date_from: '2026-11-11' })
    expect(groupCalendarEvents([span, away], sameCar)).toHaveLength(2)
    expect(groupCalendarEvents([span, away], sameCar, 2)).toHaveLength(1)
    expect(groupCalendarEvents([span, away], sameCar, 1)).toHaveLength(2)
  })

  it('lässt Termine mit ungültigem Datum für sich', () => {
    const broken = { ...pickup, uid: 'broken', date_from: 'kein-datum' }
    expect(groupCalendarEvents([span, broken], sameCar)).toHaveLength(2)
  })

  it('ordnet die Gruppen chronologisch, bei gleichem Tag nach Uhrzeit', () => {
    const late = event({ uid: 'late', summary: 'Abholung A', date_from: '2026-11-02', time_from: '15:00' })
    const early = event({ uid: 'early', summary: 'Abholung B', date_from: '2026-11-02', time_from: '09:00' })
    const noTime = event({ uid: 'none', summary: 'Abholung C', date_from: '2026-11-02' })
    const keys = groupCalendarEvents([late, early, noTime], () => null).map((g) => g.key)
    expect(keys).toEqual(['none', 'early', 'late'])
  })

  it('verändert die Eingabe nicht', () => {
    const input = [pickup, span]
    groupCalendarEvents(input, sameCar)
    expect(input.map((e) => e.uid)).toEqual(['pick', 'span'])
  })

  it('gibt für eine leere Liste nichts zurück', () => {
    expect(groupCalendarEvents([], sameCar)).toEqual([])
  })
})

describe('mergeEvents', () => {
  const span = event({
    uid: 'span',
    summary: 'LYNK 02 MY27 in Seevetal',
    description: 'Ansprechpartner: Herr Schulz',
    location: 'Seevetal',
    date_from: '2026-11-02',
    date_to: '2026-11-09',
  })
  const pickup = event({
    uid: 'pick',
    summary: 'Abholung LYNK 02 MY27 in Seevetal',
    description: 'Tel: 0171 1234567',
    location: 'Seevetal',
    date_from: '2026-11-09',
    time_from: '12:00',
    time_to: '13:00',
  })

  describe('ein Termin', () => {
    it('macht den Ort zum Ziel, nicht zum Start', () => {
      const merged = mergeEvents([
        event({
          uid: 'x',
          summary: 'Abholung WI-L 8957E in München',
          description: 'Notiz',
          location: 'München',
          date_from: '2026-11-09',
          date_to: '2026-11-10',
          time_from: '12:00',
          time_to: '13:00',
        }),
      ])
      expect(merged).toEqual({
        title: 'Abholung WI-L 8957E in München',
        date_from: '2026-11-09',
        time_from: '12:00',
        date_to: '2026-11-10',
        time_to: '13:00',
        location_from: null,
        location_to: 'München',
        notes: 'Notiz',
        uids: ['x'],
      })
    })

    it('setzt für fehlende Notizen einen leeren Text', () => {
      expect(mergeEvents([event({ uid: 'x', summary: 'A', date_from: '2026-11-09' })]).notes).toBe('')
    })
  })

  describe('zwei Termine', () => {
    it('nimmt den Start vom früheren und das Ende vom spätesten Tag', () => {
      const merged = mergeEvents([span, pickup])
      expect(merged.date_from).toBe('2026-11-02')
      expect(merged.date_to).toBe('2026-11-09')
    })

    it('nimmt die Uhrzeit des Termins, der am letzten Tag liegt', () => {
      const merged = mergeEvents([span, pickup])
      expect(merged.time_to).toBe('13:00')
    })

    it('fällt ohne Ende auf den Beginn der Abholung zurück', () => {
      const merged = mergeEvents([span, { ...pickup, time_to: null }])
      expect(merged.time_to).toBe('12:00')
    })

    it('behält das Ende des Zeitraums, wenn die Abholung mitten darin liegt', () => {
      const mid = { ...pickup, date_from: '2026-11-05' }
      const merged = mergeEvents([span, mid])
      expect(merged.date_to).toBe('2026-11-09')
      expect(merged.time_to).toBeNull()
    })

    it('gibt gleiches Ergebnis in jeder Reihenfolge', () => {
      expect(mergeEvents([pickup, span])).toEqual(mergeEvents([span, pickup]))
    })

    it('macht denselben Ort zum Start und lässt das Ziel leer', () => {
      const merged = mergeEvents([span, pickup])
      expect(merged.location_from).toBe('Seevetal')
      expect(merged.location_to).toBeNull()
    })

    it('vergleicht Orte ohne Rücksicht auf Groß-/Kleinschreibung', () => {
      const merged = mergeEvents([span, { ...pickup, location: ' SEEVETAL ' }])
      expect(merged.location_to).toBeNull()
    })

    it('übernimmt verschiedene Orte als Start und Ziel', () => {
      const merged = mergeEvents([span, { ...pickup, location: 'Hamburg' }])
      expect(merged.location_from).toBe('Seevetal')
      expect(merged.location_to).toBe('Hamburg')
    })

    it('nimmt als Titel den Termin, der nach Überführung klingt', () => {
      const named = { ...span, summary: 'Überführung LYNK 02 MY27' }
      expect(mergeEvents([named, pickup]).title).toBe('Überführung LYNK 02 MY27')
      expect(mergeEvents([pickup, named]).title).toBe('Überführung LYNK 02 MY27')
    })

    it('nimmt ohne ausdrückliche Überführung den früheren Titel', () => {
      expect(mergeEvents([span, pickup]).title).toBe('LYNK 02 MY27 in Seevetal')
    })

    it('führt die Notizen beider Termine zusammen', () => {
      const merged = mergeEvents([span, pickup])
      expect(merged.notes).toBe(
        'LYNK 02 MY27 in Seevetal\nAnsprechpartner: Herr Schulz\n\n' +
          'Abholung LYNK 02 MY27 in Seevetal\nTel: 0171 1234567'
      )
    })

    it('listet die UIDs chronologisch', () => {
      expect(mergeEvents([pickup, span]).uids).toEqual(['span', 'pick'])
    })

    it('verändert die Eingabe nicht', () => {
      const input = [pickup, span]
      mergeEvents(input)
      expect(input.map((e) => e.uid)).toEqual(['pick', 'span'])
    })
  })
})
