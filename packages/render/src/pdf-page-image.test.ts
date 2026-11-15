import { describe, expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { pdfPageImageSize } from './pdf-page-image.ts'
import { parsePdfPageImageOptions } from './pdf-page-image-options.ts'

describe('pdfPageImage options', () => {
  test.each([
    [{ width: 0 }, 'width needs to be a positive integer'],
    [{ width: 1.5 }, 'width needs to be a positive integer'],
    [{ page: 0, width: 100 }, 'page needs to be a positive integer'],
    [{ page: 1.5, width: 100 }, 'page needs to be a positive integer'],
    [{ box: 'bounds', width: 100 }, 'box needs to be media, crop, bleed, trim or art'],
    [{ unknown: true, width: 100 }, 'unknown option "unknown"'],
  ] as const)('refuses %o', (options, message) => {
    expect(() => parsePdfPageImageOptions(options as never)).toThrow(message)
  })

  test('defaults to the first crop page', () => {
    expect(parsePdfPageImageOptions({ width: 100 })).toMatchObject({ page: 1, width: 100 })
  })
})

describe('pdfPageImage size', () => {
  test('uses the displayed aspect after rotation', () => {
    expect(pdfPageImageSize({ x: 10, y: 20, width: 300, height: 200 }, 90, 1, 400)).toEqual({ width: 400, height: 600 })
  })

  test('keeps the aspect when UserUnit scales both axes', () => {
    expect(pdfPageImageSize({ x: 10, y: 20, width: 300, height: 200 }, 0, 2.5, 450)).toEqual({ width: 450, height: 300 })
  })

  test('refuses the shared image pixel ceiling', () => {
    expect(() => pdfPageImageSize({ x: 0, y: 0, width: 1, height: 1 }, 0, 1, 10_000)).toThrow(RenderRefusedError)
    expect(() => pdfPageImageSize({ x: 0, y: 0, width: 1, height: 1 }, 0, 1, 10_000)).toThrow('ceiling is 50000000 pixels')
  })
})
