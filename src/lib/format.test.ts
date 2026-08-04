// toNum: parserul UNIC de numere românești. Cazul „2.500" → 2500 este exact
// bug-ul găsit în vechiul parser din Configurare (citea 2,5).
import { describe, expect, it } from 'vitest'
import { toNum } from './format'

describe('toNum', () => {
  it('mii cu punct: „2.500" → 2500 (bug-ul reparat)', () => {
    expect(toNum('2.500')).toBe(2500)
  })
  it('mii multiple: „1.234.567" → 1234567', () => {
    expect(toNum('1.234.567')).toBe(1_234_567)
  })
  it('zecimală cu virgulă: „35,4" → 35.4', () => {
    expect(toNum('35,4')).toBeCloseTo(35.4)
  })
  it('format complet: „2.500,75" → 2500.75', () => {
    expect(toNum('2.500,75')).toBeCloseTo(2500.75)
  })
  it('zecimală în stil englezesc: „2.5" → 2.5 (punct ne-urmat de 3 cifre)', () => {
    expect(toNum('2.5')).toBeCloseTo(2.5)
  })
  it('„12.34" → 12.34 (tot zecimală englezească)', () => {
    expect(toNum('12.34')).toBeCloseTo(12.34)
  })
  it('întreg simplu: „2500" → 2500', () => {
    expect(toNum('2500')).toBe(2500)
  })
  it('spații ignorate: „ 2 500 " → 2500', () => {
    expect(toNum(' 2 500 ')).toBe(2500)
  })
  it('gol sau invalid → 0', () => {
    expect(toNum('')).toBe(0)
    expect(toNum('abc')).toBe(0)
  })
})
