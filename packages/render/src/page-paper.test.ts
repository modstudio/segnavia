import { describe, expect, test } from 'bun:test'
import { Print } from '@segnavia/format'
import { assertPrintOptions, PrintRefusedError, printCss, printViewport } from './page-paper.ts'

describe('printed page setup', () => {
  test('safe area alone adds only the print custom properties', () => {
    const print = Print.parse({ paper: 'a4', safe: 5 })
    expect(printCss(print)).toBe(':root{--segnavia-bleed:0mm;--segnavia-safe:5mm}')
    expect(printViewport(print, true)).toEqual({ width: 794, height: 1123 })
  })

  test('bleed grows the viewport and becomes physical root padding with the margins', () => {
    const print = Print.parse({
      paper: { width: 148, height: 105, unit: 'mm' },
      orientation: 'landscape',
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      bleed: 3,
    })
    expect(printCss(print)).toBe(':root{--segnavia-bleed:3mm;--segnavia-safe:0mm}:where(html){padding:4mm 5mm 6mm 7mm}')
    expect(printViewport(print, true)).toEqual({ width: 582, height: 420 })
    expect(printViewport(print, false)).toEqual({ width: 559, height: 397 })
  })

  test('a CSS page size is refused for bleed or marks', () => {
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow(PrintRefusedError)
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow('Remove preferCssPageSize, or remove the bleed and marks')
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4' }), true)).not.toThrow()
  })
})
