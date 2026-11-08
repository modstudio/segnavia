import { describe, expect, test } from 'bun:test'
import { sanitizeBookCss } from './book-css.ts'

describe('book CSS', () => {
  test('sanitizes book CSS', () => {
    const book = '@import "https://example.test/book.css";.lead{color:purple;background:url(https://example.test/ink.png)}.plain{font-size:21px}'
    expect(sanitizeBookCss(book).css).toBe('.lead{color:purple;}.plain{font-size:21px}')
    expect(sanitizeBookCss(book).removed).toEqual(['@import', 'url()'])
  })

  test('escapes markup while preserving its CSS text value', () => {
    const result = sanitizeBookCss('.before{content:"<"}</style><img src="https://evil.test/x.png"><style>')
    expect(result.css).toBe('.before{content:"\\3c "}\\3c /style>\\3c img src="https://evil.test/x.png">\\3c style>')
    expect(result.removed).toEqual([])
    expect(sanitizeBookCss('</style><img src="https://evil.test/x.png">').css).not.toContain('<')
  })
})
