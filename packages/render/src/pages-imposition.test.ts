import { describe, expect, test } from 'bun:test'
import { fitPage, Imposition, impose, Page } from '@segnavia/format'
import { groupPieces, placementPdfGeometry } from './pages-imposition.ts'

const repeat = Imposition.parse({
  paper: { width: 34, height: 34, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 10, height: 10 },
  margin: { top: 5, right: 5, bottom: 5, left: 5 },
  gap: { column: 4, row: 4 },
  bleed: 2,
  fill: 'repeat',
})

describe('imposed PDF pieces', () => {
  test('groups repeated fluid placements with the same rendered geometry', () => {
    const pages = [Page.parse({ html: '<p>one</p>' })]
    const groups = groupPieces(pages, impose(repeat, pages.length), repeat.fit)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.placements).toHaveLength(4)
  })

  test('keeps fluid pieces apart when their physical bleed differs', () => {
    const clipped = Imposition.parse({ ...repeat, margin: { top: 1, right: 5, bottom: 5, left: 5 } })
    const pages = [Page.parse({ html: '<p>one</p>' })]
    expect(groupPieces(pages, impose(clipped, 1), clipped.fit)).toHaveLength(2)
  })

  test('converts a covering fit and uneven bleed from top-left millimeters to PDF points', () => {
    const imposition = Imposition.parse({
      paper: { width: 112, height: 87, unit: 'mm' },
      orientation: 'landscape',
      columns: 1,
      rows: 1,
      cell: { width: 100, height: 70 },
      margin: { top: 2, right: 2, bottom: 15, left: 10 },
      bleed: 5,
      fit: 'cover',
    })
    const page = Page.parse({ html: '', size: { width: 600, height: 400 } })
    const imposed = impose(imposition, 1)
    const placement = imposed.placements[0]
    if (!placement) throw new Error('Expected a placement.')
    const fit = fitPage(page, placement, imposition.fit)
    const geometry = placementPdfGeometry(placement, fit, imposed.paper.height)
    expect(geometry.clip).toEqual({ x: 5 / (25.4 / 72), y: 10 / (25.4 / 72), width: 107 / (25.4 / 72), height: 77 / (25.4 / 72) })
    expect(geometry.draw.x).toBeCloseTo(fit.x / (25.4 / 72))
    expect(geometry.draw.y).toBeCloseTo((imposed.paper.height - fit.y - (400 * fit.scale) / (96 / 25.4)) / (25.4 / 72))
    expect(geometry.draw.width).toBeCloseTo(((600 * fit.scale) / (96 / 25.4)) / (25.4 / 72))
  })
})
