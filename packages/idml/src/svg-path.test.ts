import { expect, test } from 'bun:test'
import { artSvg } from './svg-path.ts'
import type { IdmlArtPlacement, IdmlPathPoint } from './types.ts'

const point = (anchor: [number, number], left = anchor, right = anchor): IdmlPathPoint => ({ anchor, left, right })
const art = (open: boolean, points: IdmlPathPoint[], fill = 'Swatch/None'): IdmlArtPlacement => ({
  bounds: { left: 10, top: 20, right: 50, bottom: 60 },
  location: 'spread#group',
  polygons: [{ paths: [{ open, points }], fill, location: 'spread#polygon' }],
})

test('writes transformed two-point and four-point cubic paths, rounded in their own box', () => {
  const two = artSvg(art(false, [point([10, 20], [10, 20], [15, 20]), point([30, 40], [25, 40], [30, 40])]), [])
  expect(two.markup).toContain('d="M0 0C5 0 15 20 20 20C20 20 0 0 0 0Z"')
  const four = artSvg(art(false, [point([10, 20]), point([50, 20]), point([50, 60]), point([10, 60])]), [])
  expect(four.markup).toContain('M0 0C0 0 40 0 40 0C40 0 40 40 40 40C40 40 0 40 0 40C0 40 0 0 0 0Z')
  expect(four.markup).toContain('viewBox="0 0 40 40" width="40pt" height="40pt"')
})

test('leaves an open path open and maps None and color fills', () => {
  expect(artSvg(art(true, [point([10, 20]), point([50, 60])]), []).markup).not.toContain('Z')
  expect(artSvg(art(true, [point([10, 20]), point([50, 60])]), []).markup).toContain('fill="none"')
  expect(
    artSvg(art(true, [point([10, 20]), point([50, 60])], 'Color/Red'), [{ id: 'Color/Red', name: 'Red', model: 'rgb', values: [255, 0, 0] }]).markup,
  ).toContain('fill="rgb(255 0 0)"')
})

test('returns strokes as unsupported findings instead of drawing them', () => {
  const value = art(false, [point([10, 20]), point([50, 60])])
  const polygon = value.polygons[0]
  if (polygon) polygon.stroke = { color: 'Color/Red', weight: 1 }
  const result = artSvg(value, [])
  expect(result.markup).not.toContain('stroke=')
  expect(result.unsupportedStrokes).toEqual([{ name: 'StrokeColor:Color/Red', location: 'spread#polygon' }])
})
