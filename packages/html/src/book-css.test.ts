import { describe, expect, test } from 'bun:test'
import { sanitizeBookCss } from './book-css.ts'

describe('book CSS', () => {
  test('removes fetching rules, reports them, and keeps ordinary rules', () => {
    const result = sanitizeBookCss(
      '@import "https://example.test/book.css";.lead{color:purple;background:url(https://example.test/ink.png)}.plain{font-size:21px}',
    )
    expect(result.css).toBe('.lead{color:purple;}.plain{font-size:21px}')
    expect(result.removed).toEqual(['@import', 'url()'])
  })

  test('keeps a data font only when the existing option allows it', () => {
    const css = '@font-face{font-family:Book;src:url(data:font/woff2;base64,AA==)}.plain{font-family:Book}'
    expect(sanitizeBookCss(css).removed).toEqual(['data font'])
    expect(sanitizeBookCss(css, true)).toEqual({ css, removed: [] })
  })
})
