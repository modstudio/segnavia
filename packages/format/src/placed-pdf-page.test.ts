import { describe, expect, test } from 'bun:test'
import type { Media } from './media.ts'
import { displayedPdfPage, placedPdfPage } from './placed-pdf-page.ts'

const media: Media = {
  format: 'pdf',
  size: { width: 600, height: 800 },
  pages: [
    { name: 'Cover', boxes: { media: { x: 0, y: 0, width: 600, height: 800 }, crop: { x: 10, y: 20, width: 580, height: 760 } } },
    { boxes: { media: { x: 0, y: 0, width: 400, height: 300 } } },
  ],
}

describe('placedPdfPage', () => {
  test('selects by one-based number and name and rejects an unknown name', () => {
    expect(placedPdfPage(media, 2)).toMatchObject({ page: 2, bounds: { width: 400, height: 300 } })
    expect(placedPdfPage(media, 'Cover')).toMatchObject({ page: 1, name: 'Cover' })
    expect(placedPdfPage(media, 'Missing')).toBe('no-page')
  })

  test.each([
    ['crop', 'media'],
    ['trim', 'media'],
    ['bleed', 'media'],
    ['art', 'media'],
  ] as const)('falls an absent %s box back to %s', (requested, expected) => {
    expect(placedPdfPage(media, 2, requested)).toMatchObject({ box: expected })
  })

  test('applies rotation and UserUnit to displayed geometry', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 200 }
    expect([0, 90, 180, 270].map((rotate) => displayedPdfPage(bounds, rotate, 2))).toEqual([
      { width: 200, height: 400, matrix: [2, 0, 0, 2, -20, -40] },
      { width: 400, height: 200, matrix: [0, -2, 2, 0, -40, 220] },
      { width: 200, height: 400, matrix: [-2, 0, 0, -2, 220, 440] },
      { width: 400, height: 200, matrix: [0, 2, -2, 0, 440, -20] },
    ])
  })
})
