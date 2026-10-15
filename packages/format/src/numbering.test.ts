import { describe, expect, test } from 'bun:test'
import { formatNumber, type NoteMarker, type NumberSystem, noteMarker } from './numbering.ts'

describe('number formatting', () => {
  test('arabic numbers use decimal digits at their boundary', () => {
    expect(formatNumber(1, 'arabic')).toBe('1')
    expect(formatNumber(Number.MAX_SAFE_INTEGER, 'arabic')).toBe(String(Number.MAX_SAFE_INTEGER))
  })

  test('Roman numbers use standard subtractive notation at their boundaries', () => {
    const cases = [
      [1, 'I'],
      [4, 'IV'],
      [9, 'IX'],
      [14, 'XIV'],
      [40, 'XL'],
      [90, 'XC'],
      [400, 'CD'],
      [900, 'CM'],
      [1994, 'MCMXCIV'],
      [3999, 'MMMCMXCIX'],
    ] as const
    for (const [value, expected] of cases) {
      expect(formatNumber(value, 'roman-upper')).toBe(expected)
      expect(formatNumber(value, 'roman-lower')).toBe(expected.toLowerCase())
    }
  })

  test('Hebrew numbers preserve fifteen and sixteen within larger numbers', () => {
    const cases = [
      [1, 'א'],
      [15, 'טו'],
      [16, 'טז'],
      [115, 'קטו'],
      [116, 'קטז'],
      [215, 'רטו'],
      [216, 'רטז'],
      [999, 'תתקצט'],
      [1000, 'א׳'],
      [1001, 'א׳א'],
      [9999, 'ט׳תתקצט'],
    ] as const
    for (const [value, expected] of cases) expect(formatNumber(value, 'hebrew')).toBe(expected)
  })

  test('symbol note markers cycle before repeating', () => {
    expect([1, 4, 5, 8, 9].map((index) => noteMarker(index, 'symbols'))).toEqual(['*', '§', '**', '§§', '***'])
  })

  test('every numbering system refuses non-positive and non-integer values', () => {
    const systems: NumberSystem[] = ['arabic', 'roman-lower', 'roman-upper', 'hebrew']
    for (const system of systems) {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => formatNumber(value, system)).toThrow(RangeError)
        expect(() => formatNumber(value, system)).toThrow(`value ${value}`)
      }
    }
    const markers: NoteMarker[] = [...systems, 'symbols']
    for (const marker of markers) expect(() => noteMarker(0, marker)).toThrow('value 0')
  })

  test('Roman and Hebrew numbers refuse values above their ranges', () => {
    for (const system of ['roman-lower', 'roman-upper'] as const) {
      expect(() => formatNumber(4000, system)).toThrow('4000')
      expect(() => formatNumber(4000, system)).toThrow('1 to 3999')
      expect(() => noteMarker(4000, system)).toThrow('1 to 3999')
    }
    expect(() => formatNumber(10_000, 'hebrew')).toThrow('10000')
    expect(() => formatNumber(10_000, 'hebrew')).toThrow('1 to 9999')
    expect(() => noteMarker(10_000, 'hebrew')).toThrow('1 to 9999')
  })
})
