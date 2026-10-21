import { describe, expect, test } from 'bun:test'
import { Page, Print } from './index.ts'
import {
  CUSTOM_PAPER_MAX_MM,
  CUSTOM_PAPER_MIN_MM,
  MM_PER_PT,
  NAMED_PAPERS,
  PAPER_GROUPS,
  PAPER_METADATA,
  PAPER_MM,
  Paper,
  PrintSetting,
  PrintSettingInput,
  printBoxes,
  printProperties,
  sheetMm,
  toMillimeters,
} from './paper.ts'

const printerPapers = [
  ['letter', 215.9, 279.4],
  ['legal', 215.9, 355.6],
  ['tabloid', 279.4, 431.8],
  ['a3', 297, 420],
  ['a4', 210, 297],
  ['a5', 148, 210],
  ['business-card-us', 50.8, 88.9],
  ['business-card-eu', 55, 85],
  ['business-card-square-us', 63.5, 63.5],
  ['business-card-slim-us', 44.45, 88.9],
  ['postcard-4x6', 101.6, 152.4],
  ['postcard-5x7', 127, 177.8],
  ['postcard-6x9', 152.4, 228.6],
  ['postcard-6x11', 152.4, 279.4],
  ['card-square-4in', 101.6, 101.6],
  ['half-letter', 139.7, 215.9],
  ['a6', 105, 148],
  ['dl', 99, 210],
  ['rack-card-4x9', 101.6, 228.6],
  ['rack-card-3.5x8.5', 88.9, 215.9],
  ['poster-12x18', 304.8, 457.2],
  ['poster-16x20', 406.4, 508],
  ['poster-18x24', 457.2, 609.6],
  ['poster-24x36', 609.6, 914.4],
  ['a2', 420, 594],
  ['a1', 594, 841],
  ['a0', 841, 1189],
] as const

describe('paper', () => {
  test('metadata covers every named paper and uses the stable group order', () => {
    expect(Object.keys(PAPER_METADATA)).toEqual([...NAMED_PAPERS])
    expect(PAPER_GROUPS).toEqual(['Office', 'Cards', 'Leaflets', 'Posters'])
    expect(PAPER_METADATA['business-card-us']).toEqual({ name: 'Business card (US)', group: 'Cards', size: '3.5 × 2 in' })
    expect(PAPER_METADATA.a4).toEqual({ name: 'A4', group: 'Office', size: '210 × 297 mm' })
  })

  test.each([
    ['mm', 1],
    ['in', 25.4],
    ['pt', MM_PER_PT],
  ] as const)('custom paper boundaries are normalized from %s', (unit, millimetersPerUnit) => {
    const minimum = CUSTOM_PAPER_MIN_MM / millimetersPerUnit
    const maximum = CUSTOM_PAPER_MAX_MM / millimetersPerUnit
    expect(Paper.safeParse({ width: minimum, height: maximum, unit }).success).toBe(true)
    expect(Paper.safeParse({ width: minimum - 0.001, height: maximum, unit }).success).toBe(false)
    expect(Paper.safeParse({ width: minimum, height: maximum + 0.001, unit }).success).toBe(false)
  })

  test('custom paper refuses non-finite and extreme dimensions', () => {
    expect(Paper.safeParse({ width: 10_000_000, height: 10_000_000, unit: 'in' }).success).toBe(false)
    expect(Paper.safeParse({ width: 1e300, height: 1e300, unit: 'mm' }).success).toBe(false)
    expect(Paper.safeParse({ width: Number.POSITIVE_INFINITY, height: 10, unit: 'mm' }).success).toBe(false)
  })

  test('stored print settings validate writes strictly and read history tolerantly', () => {
    const stored = { paper: 'a4', orientation: 'portrait', future: true }
    expect(PrintSetting.parse(stored)).toEqual({ paper: 'a4', orientation: 'portrait' })
    expect(PrintSettingInput.safeParse(stored).success).toBe(false)
  })

  test('converts supported length units to millimeters', () => {
    expect(toMillimeters(12, 'mm')).toBe(12)
    expect(toMillimeters(1, 'in')).toBe(25.4)
    expect(toMillimeters(72, 'pt')).toBe(25.4)
  })

  test('orientation swaps the sides of a named and a custom paper', () => {
    expect(sheetMm(Print.parse({ paper: 'a4', orientation: 'landscape' }))).toEqual({ width: 297, height: 210 })
    expect(sheetMm(Print.parse({ paper: { width: 6, height: 4, unit: 'in' }, orientation: 'portrait' }))).toEqual({ width: 101.6, height: 152.4 })
  })

  test.each(printerPapers)('%s has its trim size in both orientations', (paper, width, height) => {
    expect(PAPER_MM[paper]).toEqual({ width, height })
    expect(sheetMm(Print.parse({ paper, orientation: 'portrait' }))).toEqual({ width, height })
    expect(sheetMm(Print.parse({ paper, orientation: 'landscape' }))).toEqual({ width: height, height: width })
  })

  test('no bleed and no marks makes the media equal the trim', () => {
    expect(printBoxes(Print.parse({ paper: { width: 148, height: 105, unit: 'mm' } }))).toEqual({
      media: { width: 105, height: 148 },
      bleedBox: { x: 0, y: 0, width: 105, height: 148 },
      trim: { x: 0, y: 0, width: 105, height: 148 },
      safeBox: { x: 0, y: 0, width: 105, height: 148 },
      marks: [],
    })
  })

  test('bleed grows the media around the trim', () => {
    expect(printBoxes(Print.parse({ paper: { width: 100, height: 150, unit: 'mm' }, bleed: 3 }))).toMatchObject({
      media: { width: 106, height: 156 },
      bleedBox: { x: 0, y: 0, width: 106, height: 156 },
      trim: { x: 3, y: 3, width: 100, height: 150 },
    })
  })

  test('marks surround a trim without bleed', () => {
    const boxes = printBoxes(Print.parse({ paper: { width: 100, height: 150, unit: 'mm' }, marks: true }))
    expect(boxes.media).toEqual({ width: 112, height: 162 })
    expect(boxes.bleedBox).toEqual({ x: 6, y: 6, width: 100, height: 150 })
    expect(boxes.trim).toEqual(boxes.bleedBox)
    expect(boxes.marks).toHaveLength(8)
    expect(boxes.marks[0]).toEqual({ x1: 0, y1: 6, x2: 5, y2: 6 })
  })

  test('bleed, safe area and marks use the same media origin', () => {
    const boxes = printBoxes(Print.parse({ paper: { width: 148, height: 105, unit: 'mm' }, orientation: 'landscape', bleed: 3, safe: 5, marks: true }))
    expect(boxes).toMatchObject({
      media: { width: 166, height: 123 },
      bleedBox: { x: 6, y: 6, width: 154, height: 111 },
      trim: { x: 9, y: 9, width: 148, height: 105 },
      safeBox: { x: 14, y: 14, width: 138, height: 95 },
    })
    expect(boxes.marks).toHaveLength(8)
  })

  test('landscape applies before boxes are placed', () => {
    expect(printBoxes(Print.parse({ paper: 'a4', orientation: 'landscape', bleed: 2 })).trim).toEqual({ x: 2, y: 2, width: 297, height: 210 })
  })

  test('a custom paper accepts points', () => {
    expect(sheetMm(Print.parse({ paper: { width: 288, height: 432, unit: 'pt' } }))).toEqual({ width: 101.6, height: 152.4 })
  })

  test('print properties expose bleed and safe area to author CSS', () => {
    expect(printProperties(Print.parse({ paper: 'a4', bleed: 3, safe: 5 }))).toBe(':root{--segnavia-bleed:3mm;--segnavia-safe:5mm}')
  })

  test('safe must leave area inside both trim dimensions', () => {
    const result = Page.safeParse({ html: '', print: { paper: { width: 148, height: 105, unit: 'mm' }, safe: 52.5 } })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('52.5mm on the left and right')
    expect(result.error?.issues[0]?.message).toContain('105mm wide')
  })
})
