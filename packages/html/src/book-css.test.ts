import { describe, expect, test } from 'bun:test'
import { bookStylesheet, sanitizeBookCss } from './book-css.ts'

describe('book CSS', () => {
  test('sanitizes the book layer and places it between font and host CSS', () => {
    const book = '@import "https://example.test/book.css";.lead{color:purple;background:url(https://example.test/ink.png)}.plain{font-size:21px}'
    expect(bookStylesheet('.lead{color:blue}', book, '.lead{color:green}')).toBe(
      '.lead{color:blue}.lead{color:purple;}.plain{font-size:21px}.lead{color:green}',
    )
    expect(sanitizeBookCss(book).removed).toEqual(['@import', 'url()'])
  })

  test('escapes markup while preserving its CSS text value', () => {
    const result = sanitizeBookCss('.before{content:"<"}</style><img src="https://evil.test/x.png"><style>')
    expect(result.css).toBe('.before{content:"\\3c "}\\3c /style>\\3c img src="https://evil.test/x.png">\\3c style>')
    expect(result.removed).toEqual([])
    expect(bookStylesheet(undefined, '</style><img src="https://evil.test/x.png">', undefined)).not.toContain('<')
  })
})
