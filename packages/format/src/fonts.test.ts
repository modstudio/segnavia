import { describe, expect, test } from 'bun:test'
import { identifiedBookInput } from './book-test-helper.ts'
import {
  FontManifest,
  FontReference,
  FontReferenceInput,
  fontManifestReferences,
  fontManifestWithReferences,
  HEBREW_UNICODE_RANGE,
  LocalFaceTransport,
  localFontReferences,
  matchFaces,
  persistedFontManifestWithReferences,
  rangeSample,
} from './fonts.ts'
import { Book, jsonSchemas, Page } from './index.ts'

describe('FontReference', () => {
  test('refuses unknown reference keys at every edge', () => {
    expect(FontReference.safeParse({ app: 'body', future: true }).success).toBe(false)
    expect(FontReference.safeParse({ local: 'Arial', fallback: 'body', future: true }).success).toBe(false)
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
  test('accepts a declared weight range and refuses inverted and out-of-bounds ranges', () => {
    expect(FontManifest.parse({ body: { faces: [{ weight: [100, 900] }] } })).toEqual({ body: { faces: [{ weight: [100, 900] }] } })
    for (const [weight, message] of [
      [[900, 100], 'put the lower weight first'],
      [[0, 900], 'use integers in that range'],
    ] as const) {
      const result = FontManifest.safeParse({ body: { faces: [{ weight }] } })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.toString()).toContain('body')
        expect(result.error.toString()).toContain(message)
      }
    }
  })

  test('converts a manifest to references without browser globals', () => {
    expect(
      fontManifestReferences(
        {
          body: { faces: [{}] },
          heading: { local: 'Heading Sans', fallback: 'body' },
        },
        ['caption', 'body'],
      ),
    ).toEqual([{ app: 'body' }, { local: 'Heading Sans', fallback: 'body' }, { app: 'caption' }])
  })

  test('selects local references from references, a manifest or no fonts', () => {
    const local = { local: 'Heading Sans', fallback: 'body' }
    expect(localFontReferences([{ app: 'body' }, local])).toEqual([local])
    expect(localFontReferences({ body: { faces: [{}] }, heading: local })).toEqual([local])
    expect(localFontReferences(undefined)).toEqual([])
  })

  test('converts references without overwriting declarations or colliding local keys', () => {
    const fonts = { body: { faces: [{ weight: 700 }] }, 'local-0': { faces: [{}] } }
    const references = [{ app: 'body' as const }, { app: 'heading' as const }, { local: 'Arial', fallback: 'body' as const }]
    expect(fontManifestWithReferences(fonts, references)).toEqual({
      manifest: { ...fonts, 'local-1': { local: 'Arial', fallback: 'body' } },
      undeclared: ['heading'],
    })
    expect(persistedFontManifestWithReferences(fonts, references)).toEqual({
      ...fonts,
      'local-1': { local: 'Arial', fallback: 'body' },
      heading: { faces: [{}] },
    })
  })

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

  test('refuses declarations whose weight ranges overlap for the same face', () => {
    const duplicate = FontManifest.safeParse({ body: { faces: [{ weight: [100, 500] }, { weight: [500, 900] }] } })
    expect(duplicate.success).toBe(false)
    if (!duplicate.success) expect(duplicate.error.toString()).toContain('duplicates face 0 by overlapping weight')
    expect(FontManifest.safeParse({ body: { faces: [{ weight: [100, 499] }, { weight: [500, 900] }] } }).success).toBe(true)
  })

  test('matches declared faces while retaining undeclared supplied faces', () => {
    const regular = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const }
    const bold = { ...regular, weight: 700 }
    expect(matchFaces([{ weight: 400 }, { weight: 300 }], [regular, bold])).toEqual({ faces: [regular, bold], unsupplied: [{ weight: 300 }] })
  })

  test('matches declarations only when a supplied weight range covers them', () => {
    const variable = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const, weight: '100 900' }
    const regular = { ...variable, weight: 400 }
    for (const declaration of [{ weight: 400 }, { weight: [100, 900] as [number, number] }, { weight: [300, 700] as [number, number] }]) {
      expect(matchFaces([declaration], [variable])).toEqual({ faces: [variable], unsupplied: [] })
    }
    expect(matchFaces([{ weight: [100, 900] }], [regular])).toEqual({ faces: [regular], unsupplied: [{ weight: [100, 900] }] })
  })

  test('lets one supplied variable face satisfy multiple declarations', () => {
    const variable = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const, weight: '100 900' }
    expect(matchFaces([{ weight: 400 }, { weight: 700 }], [variable])).toEqual({ faces: [variable], unsupplied: [] })
  })

  test('matches a ranged Hebrew declaration by weight and unicode range', () => {
    const declaration = FontManifest.parse({ body: { faces: [{ script: 'hebrew', weight: [300, 700] }] } }).body
    if (!declaration || !('faces' in declaration)) throw new Error('expected app font declaration')
    const supplied = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const, weight: '100 900' }
    expect(matchFaces(declaration.faces, [supplied])).toEqual({ faces: [supplied], unsupplied: [] })
  })

  test('matches a ranged Hebrew declaration to a supplied face with no range', () => {
    const supplied = { family: 'Body', data: new Uint8Array(), format: 'truetype' as const }
    const declaration = FontManifest.parse({ body: { faces: [{ script: 'hebrew' }] } }).body
    if (!declaration || !('faces' in declaration)) throw new Error('expected app font declaration')
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
    expect(jsonSchemas().fontDeclaration).toMatchObject({
      type: 'object',
      properties: {
        weight: {
          oneOf: [
            { type: 'integer', minimum: 1, maximum: 1000 },
            { type: 'array', minItems: 2, maxItems: 2 },
          ],
        },
        style: { enum: ['normal', 'italic'] },
        unicodeRange: { type: 'string' },
        script: { enum: ['hebrew'] },
      },
      additionalProperties: false,
    })
    expect(jsonSchemas().fontManifest).toMatchObject({
      type: 'object',
      propertyNames: { pattern: '^[a-z0-9-]+$' },
      additionalProperties: {
        anyOf: [
          { required: ['faces'], properties: { faces: { minItems: 1, type: 'array' } } },
          { required: ['local', 'fallback'], properties: { local: { type: 'string' }, fallback: { pattern: '^[a-z0-9-]+$' } } },
        ],
      },
    })
  })
})
