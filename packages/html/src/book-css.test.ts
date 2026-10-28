import { describe, expect, test } from 'bun:test'
import { sanitizeBookCss } from './book-css.ts'

describe('book CSS', () => {
  test('sanitizes the book layer and places it between font and host CSS', () => {
    const result = sanitizeBookCss(
      '.lead{color:blue}',
      '@import "https://example.test/book.css";.lead{color:purple;background:url(https://example.test/ink.png)}.plain{font-size:21px}',
      '.lead{color:green}',
    )
    expect(result.css).toBe('.lead{color:blue}.lead{color:purple;}.plain{font-size:21px}.lead{color:green}')
    expect(result.removed).toEqual(['@import', 'url()'])
  })

  test('escapes markup while preserving its CSS text value', () => {
    const result = sanitizeBookCss(undefined, '.before{content:"<"}</style><img src="https://evil.test/x.png"><style>', undefined)
    expect(result.css).toBe('.before{content:"\\3c "}\\3c /style>\\3c img src="https://evil.test/x.png">\\3c style>')
    expect(result.css).not.toContain('<')
    expect(result.removed).toEqual([])
  })
})
