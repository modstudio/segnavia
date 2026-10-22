import { describe, expect, test } from 'bun:test'
import { Print } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { assertPrintOptions, pressContentPlacement, printCss, printViewport } from './page-paper.ts'

describe('printed page setup', () => {
  test('safe area alone adds only the print custom properties', () => {
    const print = Print.parse({ paper: 'a4', safe: 5 })
    expect(printCss(print)).toBe(':root{--segnavia-bleed:0mm;--segnavia-safe:5mm}')
    expect(printViewport(print)).toEqual({ width: 794, height: 1123 })
  })

  test('bleed grows the viewport and becomes physical root padding with the margins', () => {
    const print = Print.parse({
      paper: { width: 148, height: 105, unit: 'mm' },
      orientation: 'landscape',
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      bleed: 3,
    })
    expect(printCss(print)).toBe(
      ':root{--segnavia-bleed:3mm;--segnavia-safe:0mm}:where(html){box-sizing:border-box!important;position:relative!important;width:154mm!important;height:111mm!important;overflow:clip!important;padding:4mm 5mm 6mm 7mm}:where(body){position:absolute!important;inset:4mm 5mm 6mm 7mm!important;width:auto!important;height:auto!important}',
    )
    expect(printViewport(print)).toEqual({ width: 583, height: 420 })
  })

  test('a CSS page size is refused for bleed or marks', () => {
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow(RenderRefusedError)
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4', marks: true }), true)).toThrow('Remove preferCssPageSize, or remove the bleed and marks')
    expect(() => assertPrintOptions(Print.parse({ paper: 'a4' }), true)).not.toThrow()
  })

  test('the Chromium page keeps its top edge when its rounded height differs from the bleed box', () => {
    const bleedBox = { x: 17, y: 17, width: 612, height: 858.9 }
    const placement = pressContentPlacement({ width: 612, height: 859.9 }, bleedBox)
    expect(placement).toEqual({ x: 17, y: 16, width: 612, height: 859.9 })
    expect(placement.y + placement.height).toBe(bleedBox.y + bleedBox.height)
  })
})
