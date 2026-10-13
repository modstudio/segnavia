import { describe, expect, test } from 'bun:test'
import { fitPage, Imposition, impose, Page } from '@segnavia/format'
import { printablePages } from './print-document.ts'

const grid = Imposition.parse({
  paper: { width: 26, height: 26, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 10, height: 10 },
  margin: { top: 2, right: 2, bottom: 2, left: 2 },
  gap: { column: 2, row: 2 },
  bleed: 1,
  safe: 0.5,
})
const fluid = Page.parse({ html: '<p>page</p>' })

describe('printablePages', () => {
  test('builds papers with every placement clipped to its bleed box', () => {
    const html = printablePages([fluid, fluid, fluid, fluid, fluid], grid, { nonce: 'test' })
    expect(html).toContain('@page{size:26mm 26mm;margin:0}')
    expect(html.match(/<section class="paper">/g)).toHaveLength(2)
    for (const box of [
      { x: 1, y: 1 },
      { x: 13, y: 1 },
      { x: 1, y: 13 },
      { x: 13, y: 13 },
    ]) {
      expect(html).toContain(`left:${box.x}mm;top:${box.y}mm;width:12mm;height:12mm;overflow:hidden`)
    }
  })

  test('insets a fluid page by its physical, uneven bleed', () => {
    const imposition = Imposition.parse({
      paper: { width: 12, height: 13, unit: 'mm' },
      columns: 1,
      rows: 1,
      cell: { width: 10, height: 10 },
      margin: { top: 2, right: 0, bottom: 1, left: 2 },
      bleed: 3,
      safe: 1,
    })
    const html = printablePages([fluid], imposition, { css: ':root{color:red}', nonce: 'test' })
    expect(html).toContain(':where(html){padding:2mm 0mm 1mm 2mm}')
    expect(html.indexOf('--segnavia-safe:1mm')).toBeLessThan(html.indexOf(':where(html){padding:'))
    expect(html.indexOf(':where(html){padding:')).toBeLessThan(html.indexOf(':root{color:red}'))
  })

  test.each(['contain', 'cover'] as const)('places and scales a fixed page with %s', (mode) => {
    const imposition = Imposition.parse({
      paper: { width: 120, height: 90, unit: 'mm' },
      orientation: 'landscape',
      columns: 1,
      rows: 1,
      cell: { width: 100, height: 70 },
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      bleed: 3,
      fit: mode,
    })
    const page = Page.parse({ html: '<p>fixed</p>', size: { width: 600, height: 400 } })
    const placement = impose(imposition, 1).placements[0]
    if (!placement) throw new Error('Expected one placement.')
    const fit = fitPage(page, placement, mode)
    const html = printablePages([page], imposition, { nonce: 'test' })
    expect(html).toContain(
      `width:600px;height:400px;left:${fit.x - placement.bleedBox.x}mm;top:${fit.y - placement.bleedBox.y}mm;transform:scale(${fit.scale})`,
    )
  })

  test('scales a fixed-width growing page to the trim height', () => {
    const page = Page.parse({ html: '<p>growing</p>', size: { width: 600, height: 'auto' } })
    const placement = impose(grid, 1).placements[0]
    if (!placement) throw new Error('Expected one placement.')
    const fit = fitPage(page, placement, grid.fit)
    const html = printablePages([page], grid, { nonce: 'test' })
    expect(html).toContain(`width:600px;height:${(placement.trim.height * (96 / 25.4)) / fit.scale}px`)
    expect(html).toContain(`left:${placement.trim.x - placement.bleedBox.x}mm;top:${placement.trim.y - placement.bleedBox.y}mm`)
  })

  test('sandboxes every frame and applies nonce policy only to refused scripts', () => {
    const refused = printablePages([fluid], grid, { nonce: 'known' })
    const sandboxed = printablePages([Page.parse({ html: '<script>1</script>', scripts: 'sandboxed' })], grid, { nonce: 'known' })
    expect(refused).toContain('sandbox="allow-scripts"')
    expect(refused).not.toContain('allow-same-origin')
    expect(refused).toContain("script-src 'nonce-known'")
    expect(sandboxed).not.toContain('script-src')
  })

  test('refuses an empty collection', () => {
    expect(() => printablePages([], grid)).toThrow(new RangeError('There is nothing to print. Pass at least one page to clear this refusal.'))
  })
})
