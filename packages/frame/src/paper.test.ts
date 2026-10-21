import { describe, expect, test } from 'bun:test'
import { Page, Print } from '@segnavia/format'
import { clampPaper, paperBoxSize, paperScale, projectPageOnPaper } from './paper-geometry.ts'

describe('paper geometry', () => {
  test('clamps a paper index to an available paper', () => {
    expect(clampPaper(-2, 2)).toBe(0)
    expect(clampPaper(1, 2)).toBe(1)
    expect(clampPaper(20, 2)).toBe(1)
    expect(clampPaper(2.8, 4)).toBe(2)
    expect(clampPaper(Number.NaN, 2)).toBe(0)
  })

  test('scales a paper down and up to its container width', () => {
    expect(paperScale(200, 400)).toBe(0.5)
    expect(paperScale(800, 400)).toBe(2)
  })

  test('converts a physical paper box to CSS pixels', () => {
    expect(paperBoxSize({ width: 25.4, height: 50.8 })).toEqual({ width: 96, height: 192 })
  })

  test.each([
    ['named portrait', { paper: 'a4' }, 210, 297],
    ['custom portrait', { paper: { width: 4, height: 6, unit: 'in' } }, 101.6, 152.4],
    ['named landscape', { paper: 'letter', orientation: 'landscape' }, 279.4, 215.9],
  ] as const)('projects a %s sheet through the shared paper box', (_, input, widthMm, heightMm) => {
    const projection = projectPageOnPaper(Page.parse({ html: 'page' }), Print.parse(input))
    expect(projection.box).toEqual(paperBoxSize({ width: widthMm, height: heightMm }))
    expect(projection.aspect).toBeCloseTo(widthMm / heightMm)
  })

  test.each([
    ['fluid', 'fluid'],
    ['fixed-width auto-height', { width: 400, height: 'auto' }],
  ] as const)('fits a %s page to its paper', (_, size) => {
    const projection = projectPageOnPaper(Page.parse({ html: 'page', size }), Print.parse({ paper: 'a4' }))
    expect(projection.page.size).toEqual({ width: Math.round(projection.box.width), height: Math.round(projection.box.height) })
  })

  test('keeps a fixed page design size on its paper', () => {
    const page = Page.parse({ html: 'page', size: { width: 640, height: 480 } })
    expect(projectPageOnPaper(page, Print.parse({ paper: 'a4' })).page).toBe(page)
  })
})
