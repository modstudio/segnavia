import { describe, expect, test } from 'bun:test'
import { formatNumber, NoteMarker, type NoteMarker as NoteMarkerValue, type NumberSystem, noteMarker, numberSystemMaximum } from './numbering.ts'

describe('number formatting', () => {
  test('arabic numbers use decimal digits at their boundary', () => {
    expect(formatNumber(1, 'arabic')).toBe('1')
    expect(formatNumber(Number.MAX_SAFE_INTEGER, 'arabic')).toBe(String(Number.MAX_SAFE_INTEGER))
  })

  test('numbering systems expose their finite maximum', () => {
    expect(numberSystemMaximum('arabic')).toBeUndefined()
    expect(numberSystemMaximum('hebrew')).toBe(9999)
    expect(numberSystemMaximum('roman-lower')).toBe(3999)
    expect(numberSystemMaximum('roman-upper')).toBe(3999)
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
    expect(Array.from({ length: 9 }, (_, index) => noteMarker(index + 1, 'symbols'))).toEqual(['*', '§', '‖', '¶', '**', '§§', '‖‖', '¶¶', '***'])
  })

  test('supplied symbol sequences wrap and repeat while fixed marks stay unnumbered', () => {
    expect(Array.from({ length: 7 }, (_, index) => noteMarker(index + 1, { symbols: ['†', '‡', '§'] }))).toEqual(['†', '‡', '§', '††', '‡‡', '§§', '†††'])
    expect([1, 2, 9].map((index) => noteMarker(index, { mark: '⁂' }))).toEqual(['⁂', '⁂', '⁂'])
  })

  test('note marker schemas refuse invalid and colliding sequence entries', () => {
    for (const marker of [{ symbols: [] }, { symbols: [''] }, { symbols: ['* *'] }, { symbols: ['*', '*'] }, { symbols: ['*', '**'] }]) {
      expect(NoteMarker.safeParse(marker).success).toBe(false)
    }
    const collision = NoteMarker.safeParse({ symbols: ['*', '**'] })
    expect(JSON.stringify(collision.error?.issues)).toContain('note symbols * and ** print the same repeated mark')
    expect(NoteMarker.safeParse({ mark: '' }).success).toBe(false)
    expect(NoteMarker.safeParse({ mark: 'with space' }).success).toBe(false)
  })

  test('note marker objects name exactly one kind', () => {
    for (const marker of [
      { symbols: ['*'], mark: '⁂' },
      { mark: '⁂', symbols: ['*'] },
      { symbols: ['*'], other: true },
      { mark: '⁂', other: true },
    ]) {
      const result = NoteMarker.safeParse(marker)
      expect(result.success).toBe(false)
      expect(JSON.stringify(result.error?.issues)).toContain('supply one of symbols or mark')
    }
  })

  test('every numbering system refuses non-positive and non-integer values', () => {
    const systems: NumberSystem[] = ['arabic', 'roman-lower', 'roman-upper', 'hebrew']
    for (const system of systems) {
      for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => formatNumber(value, system)).toThrow(RangeError)
        expect(() => formatNumber(value, system)).toThrow(`value ${value}`)
      }
    }
    const markers: NoteMarkerValue[] = [...systems, 'symbols', { symbols: ['*'] }, { mark: '⁂' }]
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
