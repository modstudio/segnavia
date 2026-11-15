import { describe, expect, test } from 'bun:test'
import { FontCatalog } from './font-catalog.ts'
import { HEBREW_UNICODE_RANGE } from './fonts.ts'

describe('FontCatalog', () => {
  test('parses a catalog and resolves the Hebrew script shorthand', () => {
    const catalog = FontCatalog.parse({
      body: { family: 'Body', faces: [{ src: 'body.woff2', format: 'woff2', script: 'hebrew' }] },
    })
    expect(catalog.body?.faces[0]?.unicodeRange).toBe(HEBREW_UNICODE_RANGE)
    expect(catalog.body?.faces[0]).not.toHaveProperty('script')
  })

  test('refuses invalid face fields at the family and face path', () => {
    const result = FontCatalog.safeParse({ body: { family: 'Body', faces: [{ src: '', format: 'zip' }] } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join('.'))).toEqual(['body.faces.0.src', 'body.faces.0.format'])
  })
})
