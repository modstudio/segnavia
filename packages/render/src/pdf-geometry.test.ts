import { expect, test } from 'bun:test'
import { pdfPixelBox } from './pdf-geometry.ts'

test('converts a top-left CSS pixel box to a bottom-left PDF point box', () => {
  expect(pdfPixelBox({ x: 48, y: 48, width: 720, height: 405 }, 1056)).toEqual({ x: 36, y: 452.25, width: 540, height: 303.75 })
})
