import { describe, expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { pdfPageImagePlan } from './pdf-page-image.ts'
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

describe('pdfPageImage plan', () => {
  const box = { x: 10, y: 20, width: 300, height: 200 }

  test('uses the displayed aspect after rotation', () => {
    expect(pdfPageImagePlan([{ boxes: { media: box }, rotate: 90 }], { page: 1, width: 400 })).toEqual({ page: 1, box, width: 400, height: 600 })
  })

  test('keeps the aspect when UserUnit scales both axes', () => {
    expect(pdfPageImagePlan([{ boxes: { media: box }, userUnit: 2.5 }], { page: 1, width: 450 })).toMatchObject({ width: 450, height: 300 })
  })

  test('renders the crop box by default and falls back to it for an absent trim box', () => {
    const crop = { x: 20, y: 30, width: 100, height: 100 }
    const pages = [{ boxes: { media: box, crop } }]
    expect(pdfPageImagePlan(pages, { page: 1, width: 50 })).toMatchObject({ box: crop, height: 50 })
    expect(pdfPageImagePlan(pages, { page: 1, box: 'trim', width: 50 })).toMatchObject({ box: crop })
  })

  test('refuses a page beyond the count, naming the count', () => {
    expect(() => pdfPageImagePlan([{ boxes: { media: box } }], { page: 2, width: 50 })).toThrow("beyond the received PDF's 1 pages")
  })

  test('refuses the shared image pixel ceiling', () => {
    const square = [{ boxes: { media: { x: 0, y: 0, width: 1, height: 1 } } }]
    expect(() => pdfPageImagePlan(square, { page: 1, width: 10_000 })).toThrow(RenderRefusedError)
    expect(() => pdfPageImagePlan(square, { page: 1, width: 10_000 })).toThrow('ceiling is 50000000 pixels')
  })
})
