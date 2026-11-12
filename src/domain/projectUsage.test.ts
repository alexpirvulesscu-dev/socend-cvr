// Teste pentru fereastra de ștergere a unui proiect (brief 59): ce are proiectul
// în P&L și în HR, și când se propune „Închide proiectul" în loc de ștergere.
import { describe, expect, it } from 'vitest'
import { countRo, hasUsage, parseUsage, usageLines } from './projectUsage'

const EMPTY = parseUsage({})

describe('parseUsage', () => {
  it('un răspuns gol sau ciudat dă zero peste tot', () => {
    expect(hasUsage(parseUsage(null))).toBe(false)
    expect(hasUsage(parseUsage('x'))).toBe(false)
    expect(parseUsage({ plati: '3', incasari: -2, pontaj_zile: 'abc' })).toMatchObject({
      plati: 3,
      incasari: 0,
      pontaj_zile: 0,
    })
  })
})

describe('hasUsage', () => {
  it('un proiect fără nimic se poate șterge', () => {
    expect(hasUsage(EMPTY)).toBe(false)
    expect(usageLines(EMPTY)).toEqual([])
  })
  it('o singură parte dintr-o plată împărțită ajunge ca să nu se șteargă', () => {
    expect(hasUsage({ ...EMPTY, plati_impartite: 1 })).toBe(true)
  })
  it('zilele pontate șterse în HR tot opresc ștergerea (baza de date le refuză)', () => {
    expect(hasUsage({ ...EMPTY, pontaj_zile_sterse: 4 })).toBe(true)
  })
  it('alocările de vehicule din HR opresc ștergerea', () => {
    expect(hasUsage({ ...EMPTY, pontaj_vehicule: 1 })).toBe(true)
  })
})

describe('usageLines', () => {
  it('grupează pe P&L și HR, în ordine, cu singular / plural corect', () => {
    const u = { ...EMPTY, plati: 23, plati_impartite: 1, incasari: 1, pontaj_zile: 2218, pontaj_alocari: 2 }
    expect(usageLines(u)).toEqual([
      { where: 'P&L', items: ['23 de plăți', '1 plată împărțită pe proiecte care îl include', '1 încasare'] },
      { where: 'HR', items: ['2.218 zile pontate', '2 alocări de oameni'] },
    ])
  })
  it('doar HR: fără grupul P&L', () => {
    expect(usageLines({ ...EMPTY, pontaj_vehicule: 3 })).toEqual([
      { where: 'HR', items: ['3 alocări de vehicule'] },
    ])
  })
})

describe('countRo', () => {
  it('pune „de" de la 20 în sus, dar nu la 101–119', () => {
    expect(countRo(2, 'plată', 'plăți')).toBe('2 plăți')
    expect(countRo(19, 'plată', 'plăți')).toBe('19 plăți')
    expect(countRo(20, 'plată', 'plăți')).toBe('20 de plăți')
    expect(countRo(101, 'plată', 'plăți')).toBe('101 plăți')
    expect(countRo(120, 'plată', 'plăți')).toBe('120 de plăți')
    expect(countRo(200, 'plată', 'plăți')).toBe('200 de plăți')
  })
})
