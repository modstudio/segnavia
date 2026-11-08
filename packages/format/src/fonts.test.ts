import { describe, expect, test } from 'bun:test'
import { identifiedBookInput } from './book-test-helper.ts'
import { FontManifest, FontReference, FontReferenceInput, HEBREW_UNICODE_RANGE, LocalFaceTransport, matchFaces, rangeSample } from './fonts.ts'
import { Book, jsonSchemas, Page } from './index.ts'

describe('FontReference', () => {
  test('reads stored references tolerantly and writes them strictly', () => {
    expect(FontReference.parse({ app: 'body', future: true })).toEqual({ app: 'body' })
    expect(FontReference.parse({ local: 'Arial', fallback: 'body', future: true })).toEqual({ local: 'Arial', fallback: 'body' })
    expect(() => FontReferenceInput.parse({ app: 'body', future: true })).toThrow()
  })

  test('restricts app names to lowercase letters, digits and hyphens', () => {
    expect(FontReference.safeParse({ app: 'Body' }).success).toBe(false)
    expect(FontReference.safeParse({ local: 'Arial', fallback: 'Serif' }).success).toBe(false)
    expect(FontReference.parse({ app: 'body-serif' })).toEqual({ app: 'body-serif' })
  })
})

describe('Page and Book fonts', () => {
  test('carry optional font manifests', () => {
    expect(Page.parse({ html: '' }).style?.fonts).toBeUndefined()
    expect(Page.parse({ html: '', style: { fonts: { serif: { faces: [{}] } } } }).style?.fonts).toEqual({ serif: { faces: [{}] } })
    expect(
      Book.parse(
        identifiedBookInput({
          title: 'Book',
          mode: 'continuous',
          chapters: [{ title: 'One', html: '<p>Text</p>' }],
          style: { fonts: { serif: { faces: [{}] } } },
        }),
      ).style?.fonts,
    ).toEqual({ serif: { faces: [{}] } })
  })
})

describe('FontManifest', () => {
  test('defaults Hebrew faces to both Hebrew blocks', () => {
    expect(FontManifest.parse({ body: { faces: [{ script: 'hebrew' }] } })).toEqual({
      body: { faces: [{ script: 'hebrew', unicodeRange: HEBREW_UNICODE_RANGE }] },
    })
  })

  test('refuses unknown face fields, malformed ranges, invalid weights and duplicate faces', () => {
    for (const face of [{ future: true }, { unicodeRange: 'Hebrew' }, { weight: 1001 }]) {
      const result = FontManifest.safeParse({ body: { faces: [face] } })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.toString()).toContain('body')
    }
    const duplicate = FontManifest.safeParse({ body: { faces: [{ weight: 400 }, { weight: 400, style: 'normal' }] } })
    expect(duplicate.success).toBe(false)
    if (!duplicate.success) expect(duplicate.error.toString()).toContain('duplicates face 0')
  })

  test('matches declared faces while retaining undeclared supplied faces', () => {
    const regular = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const }
    const bold = { ...regular, weight: 700 }
    expect(matchFaces([{ weight: 400 }, { weight: 300 }], [regular, bold])).toEqual({ faces: [regular, bold], unsupplied: [{ weight: 300 }] })
  })

  test('matches a ranged Hebrew declaration to a supplied face with no range', () => {
    const supplied = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const }
    const declaration = FontManifest.parse({ body: { faces: [{ script: 'hebrew' }] } }).body
    if (!('faces' in declaration)) throw new Error('expected app font declaration')
    expect(matchFaces(declaration.faces, [supplied])).toEqual({ faces: [supplied], unsupplied: [] })
  })

  test('samples Hebrew ranges with letters, nikud and taamim', () => {
    const sample = rangeSample(HEBREW_UNICODE_RANGE)
    expect(sample).toMatch(/[\u05d0-\u05ea]/)
    expect(sample).toMatch(/[\u05b0-\u05bc]/)
    expect(sample).toMatch(/[\u0591-\u05af]/)
  })

  test('expands wildcard ranges before sampling them', () => {
    expect(FontManifest.safeParse({ body: { faces: [{ unicodeRange: 'U+05??' }] } }).success).toBe(true)
    expect(rangeSample('U+05??')).toMatch(/[\u0590-\u05ff]/)
  })
})

describe('LocalFaceTransport', () => {
  test('refuses extra keys and unknown formats', () => {
    expect(LocalFaceTransport.safeParse({ family: 'Face', format: 'ttf', data: '', extra: true }).success).toBe(false)
    expect(LocalFaceTransport.safeParse({ family: 'Face', format: 'truetype', data: '', extra: true }).success).toBe(false)
  })

  test('publishes item and array JSON Schemas', () => {
    expect(jsonSchemas().localFaceTransport).toMatchObject({ type: 'object', required: ['family', 'format', 'data'] })
    expect(jsonSchemas().localFacesTransport).toMatchObject({ type: 'array', items: { type: 'object' } })
  })

  test('publishes the font declaration and manifest JSON Schemas', () => {
    expect(jsonSchemas().fontDeclaration).toMatchObject({ type: 'object' })
    expect(jsonSchemas().fontManifest).toMatchObject({ type: 'object' })
  })
})
