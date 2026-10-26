import { describe, expect, it } from 'vitest'
import { expectedVehicles, findPlate, unknownPlate } from './calendarPlate'

describe('findPlate', () => {
  it.each([
    ['Lynk 08 WI-L 8957E in München', 'WI-L 8957E'],
    ['Abholung M AB 1234 in Köln', 'M AB 1234'],
    ['Abholung M-AB1234 in Köln', 'M-AB1234'],
    ['Abholung M-AB 1234 in Köln', 'M-AB 1234'],
    ['K PS 5300E abholen', 'K PS 5300E'],
    ['Oldtimer B-CD 12H', 'B-CD 12H'],
    ['LYNK 02 DPG98A Emmering', 'DPG98A'],
    ['Audi E-tron INMP454E in Ingolstadt', 'INMP454E'],
  ])('findet in "%s" das Kennzeichen %s', (summary, plate) => {
    expect(findPlate(summary)).toBe(plate)
  })

  it.each([
    'LYNK 02 MY27 in Seevetal',
    'BMW M3 in München',
    'VW T6 Abholung',
    'Abholung 2x BMW M3',
    'Überführung nach Hamburg',
    '',
  ])('findet in "%s" keines', (summary) => {
    expect(findPlate(summary)).toBeNull()
  })

  it.each([null, undefined])('gibt null für %j', (summary) => {
    expect(findPlate(summary)).toBeNull()
  })

  it('überspringt ein Modelljahr und nimmt das echte Kennzeichen danach', () => {
    expect(findPlate('LYNK 02 MY2027 DPG98A')).toBe('DPG98A')
  })

  it('hält ein Modelljahr allein nicht für ein Kennzeichen', () => {
    expect(findPlate('LYNK 02 MY2027')).toBeNull()
  })

  it('bevorzugt das deutsche Kennzeichen vor dem zusammengeschriebenen', () => {
    expect(findPlate('DPG98A statt WI-L 8957E')).toBe('WI-L 8957E')
  })

  it('braucht mindestens fünf Zeichen für ein zusammengeschriebenes', () => {
    expect(findPlate('Lynk AB12')).toBeNull()
    expect(findPlate('Lynk AB123')).toBe('AB123')
  })

  it('braucht Buchstaben und Ziffern', () => {
    expect(findPlate('Lynk ABCDEFG')).toBeNull()
    expect(findPlate('Lynk 1234567')).toBeNull()
  })
})

describe('unknownPlate', () => {
  const fleet = [{ license_plate: 'WI-L 8957E' }, { license_plate: 'M-AB 1234' }]

  it('liefert Kennzeichen und Modell für ein neues Fahrzeug', () => {
    expect(unknownPlate('LYNK 02 DPG98A Emmering', fleet)).toEqual({
      license_plate: 'DPG98A',
      brand_model: 'LYNK 02',
    })
  })

  it('lässt ein führendes Schlagwort aus dem Modell', () => {
    expect(unknownPlate('Abholung LYNK 02 DPG98A in Emmering', fleet)?.brand_model).toBe('LYNK 02')
    expect(unknownPlate('Überführung: LYNK 02 DPG98A', fleet)?.brand_model).toBe('LYNK 02')
  })

  it('lässt das Modell leer, wenn das Kennzeichen am Anfang steht', () => {
    expect(unknownPlate('DPG98A in Emmering', fleet)?.brand_model).toBe('')
  })

  it('nimmt als Modell höchstens drei Wörter', () => {
    expect(unknownPlate('Tesla Model Y Long Range DPG98A', fleet)?.brand_model).toBe('Tesla Model Y')
  })

  it('gibt null, wenn das Fahrzeug schon in der Flotte steht', () => {
    expect(unknownPlate('Lynk 08 WI-L 8957E in München', fleet)).toBeNull()
  })

  it('erkennt ein bekanntes Kennzeichen trotz anderer Schreibweise', () => {
    expect(unknownPlate('Abholung M-AB1234', fleet)).toBeNull()
    expect(unknownPlate('Abholung WIL8957E', [{ license_plate: 'wi-l 8957e' }])).toBeNull()
  })

  it('gibt null ohne Kennzeichen im Titel', () => {
    expect(unknownPlate('Abholung 2x BMW M3 in München', fleet)).toBeNull()
    expect(unknownPlate(null, fleet)).toBeNull()
  })

  it('kommt mit einer leeren Flotte zurecht', () => {
    expect(unknownPlate('LYNK 02 DPG98A', [])).toEqual({ license_plate: 'DPG98A', brand_model: 'LYNK 02' })
  })

  it('kommt mit einem Fahrzeug ohne Kennzeichen zurecht', () => {
    const broken = [{ license_plate: undefined as unknown as string }]
    expect(unknownPlate('LYNK 02 DPG98A', broken)?.license_plate).toBe('DPG98A')
  })
})

describe('expectedVehicles', () => {
  it('liest Anzahl und Modell aus "2x BMW M3"', () => {
    expect(expectedVehicles('Abholung 2x BMW M3 in München')).toEqual({
      count: 2,
      model: 'BMW M3',
      explicit: true,
    })
  })

  it.each([
    ['Abholung 2x BMW M3 in München', 2],
    ['Abholung 2 × BMW M3 in München', 2],
    ['Abholung 3 Fahrzeuge in Hamburg', 3],
    ['Abholung zwei Audi E-tron in Ingolstadt', 2],
    ['Abholung 2 Stk. Tesla Model Y in Köln', 2],
    ['Abholung 4 Autos in Köln', 4],
  ])('liest die Anzahl aus "%s"', (summary, count) => {
    const result = expectedVehicles(summary)
    expect(result.count).toBe(count)
    expect(result.explicit).toBe(true)
  })

  it('lässt das Modell leer, wenn nur die Anzahl dasteht', () => {
    expect(expectedVehicles('Abholung 3 Fahrzeuge in Hamburg').model).toBe('')
  })

  it('liest das Modell hinter einem Zahlwort', () => {
    expect(expectedVehicles('Abholung zwei Audi E-tron in Ingolstadt').model).toBe('Audi E-tron')
  })

  it('hält die Ziffer in "LYNK 02" nicht für eine Anzahl', () => {
    expect(expectedVehicles('Abholung LYNK 02 in Seevetal')).toEqual({
      count: 1,
      model: 'LYNK 02',
      explicit: false,
    })
  })

  it('hält "ein BMW" nicht für eine Anzahl', () => {
    expect(expectedVehicles('Abholung ein BMW M3 in München')).toEqual({
      count: 1,
      model: 'BMW M3',
      explicit: false,
    })
  })

  it('zählt "1x" als ausdrückliche Anzahl', () => {
    expect(expectedVehicles('Abholung 1x BMW M3')).toEqual({ count: 1, model: 'BMW M3', explicit: true })
  })

  it('schneidet das Modell vor dem Ort ab', () => {
    expect(expectedVehicles('Abholung 2x BMW M3 nach Hamburg').model).toBe('BMW M3')
    expect(expectedVehicles('Abholung 2x BMW M3 am 21.10.').model).toBe('BMW M3')
    expect(expectedVehicles('Abholung 2x BMW M3, Halle 2').model).toBe('BMW M3')
  })

  it('lässt Füllwörter aus dem Modell', () => {
    expect(expectedVehicles('Abholung neue Fahrzeuge BMW M3 in München').model).toBe('BMW M3')
  })

  it('lässt das Modell leer, wenn nach der Anzahl gleich der Ort kommt', () => {
    for (const place of ['in Hamburg', 'nach Köln', 'am Flughafen', 'bei Müller']) {
      expect(expectedVehicles(`Abholung 3 Fahrzeuge ${place}`).model).toBe('')
    }
  })

  it('nimmt höchstens vier Wörter als Modell', () => {
    expect(expectedVehicles('Abholung 2x Tesla Model Y Long Range AWD').model).toBe('Tesla Model Y Long')
  })

  it.each([null, undefined, ''])('gibt für %j ein Fahrzeug ohne Angabe', (summary) => {
    expect(expectedVehicles(summary)).toEqual({ count: 1, model: '', explicit: false })
  })

  it('lässt "0" nicht als Anzahl gelten', () => {
    expect(expectedVehicles('Abholung 0x BMW M3').explicit).toBe(false)
  })
})
