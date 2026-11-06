import { describe, expect, test } from 'bun:test'
import type { GoldenPdf } from './model.ts'
import { assertGoldenRecordable } from './record-policy.ts'

const golden = (text: string, fonts: string[]): GoldenPdf => ({
  pages: [{ size: [100, 200], text }],
  outline: [],
  fonts,
  info: {},
  xmp: '',
})

describe('golden recording policy', () => {
  test('refuses text-bearing PDFs without an embedded font', () => {
    expect(() => assertGoldenRecordable('english-book', golden('Chapter one', []))).toThrow(
      'english-book: text-bearing pages reported no embedded fonts; record from the Ubuntu CI demo artifact after pdffonts reports embedded fonts.',
    )
  })

  test('allows a text-free PDF without an embedded font', () => {
    expect(() => assertGoldenRecordable('printed-pages-bleed', golden('', []))).not.toThrow()
  })
})
