import { describe, expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'
import {
  DEFAULT_LIMITS,
  fillLimitRefusal,
  isLimitExceeded,
  LimitExceededError,
  limitRefusal,
  limitRefusalTemplate,
  localFontLimitExceeded,
  localFontLimitRefusal,
  parseLimits,
  resolveLimits,
} from './limits.ts'
import { Page } from './page.ts'

describe('resolveLimits', () => {
  test.each([
    [undefined, undefined, 500, 'default'],
    [{ pages: 600 }, undefined, 600, 'document'],
    [{ pages: 500 }, undefined, 500, 'document'],
    [undefined, { pages: 300 }, 300, 'host'],
    [{ pages: 600 }, { pages: 300 }, 300, 'host'],
    [{ pages: 200 }, { pages: 300 }, 200, 'document'],
    [{ pages: 300 }, { pages: 300 }, 300, 'document'],
  ] as const)('resolves document %p and host %p pages to %p', (document, host, pages, pagesSource) => {
    expect(resolveLimits(document, host)).toMatchObject({ pages, pagesSource })
  })

  test('uses and replaces local-font defaults by field', () => {
    expect(resolveLimits(undefined, undefined).localFonts).toEqual(DEFAULT_LIMITS.localFonts)
    expect(resolveLimits(undefined, { localFonts: { count: 2 } }).localFonts).toEqual({ count: 2, bytes: 32 * 1024 * 1024 })
    expect(resolveLimits(undefined, { localFonts: { bytes: 3 } }).localFonts).toEqual({ count: 64, bytes: 3 })
  })

  test('uses host-only asset defaults and replaces each field independently', () => {
    expect(resolveLimits(undefined, undefined).assets).toEqual(DEFAULT_LIMITS.assets)
    expect(resolveLimits(undefined, { assets: { bytes: 20 } }).assets).toEqual({ bytes: 20, each: DEFAULT_LIMITS.assets.each })
    expect(parseLimits({ assets: { each: 10 } }, 'host')).toEqual({ assets: { each: 10 } })
  })

  test('resolves the concise description text ceiling from document, host, and default values', () => {
    expect(resolveLimits(undefined, undefined).descriptionTextChars).toBe(DEFAULT_LIMITS.descriptionTextChars)
    expect(resolveLimits({ descriptionTextChars: 20 }, { descriptionTextChars: 10 }).descriptionTextChars).toBe(10)
    expect(resolveLimits({ descriptionTextChars: 5 }, { descriptionTextChars: 10 }).descriptionTextChars).toBe(5)
  })
})

describe('parseLimits', () => {
  test.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '1'])('refuses invalid value %p', (value) => {
    expect(() => parseLimits({ pages: value }, 'document')).toThrow('limits.pages limit must be a non-negative safe integer')
  })

  test.each([
    ['maxSheets', 'limits.sheets'],
    ['maxBytes', 'limits.bytes'],
    ['maxSlides', 'limits.slides'],
    ['maxSlideBytes', 'limits.slideBytes'],
    ['maxNotesBytes', 'limits.notesBytes'],
  ])('refuses removed %s and names %s', (removed, replacement) => {
    expect(() => parseLimits({ [removed]: 1 }, 'host')).toThrow(replacement)
  })

  test('refuses unknown top-level and local-font keys', () => {
    expect(() => parseLimits({ other: 1 }, 'host')).toThrow('unknown other')
    expect(() => parseLimits({ localFonts: { other: 1 } }, 'host')).toThrow('unknown localFonts.other')
    expect(() => parseLimits({ localFonts: { limits: 1 } }, 'host')).toThrow('limits.localFonts')
  })

  test('document schemas report invalid and host-only limits without throwing from safeParse', () => {
    expect(Page.safeParse({ html: '<p>Page</p>', limits: { pages: -1 } }).success).toBe(false)
    expect(Page.safeParse({ html: '<p>Page</p>', limits: { sheets: 1 } }).success).toBe(false)
    expect(Page.safeParse({ html: '<p>Page</p>', limits: { assets: { bytes: 1 } } }).success).toBe(false)
    expect(
      Book.safeParse(identifiedBookInput({ title: 'Book', mode: 'continuous', chapters: [{ title: 'Chapter', html: '<p>Text</p>' }], limits: { bytes: 1 } }))
        .success,
    ).toBe(false)
  })
})

describe('limitRefusal', () => {
  test.each([
    ['pages', 'papers', 'limits.pages'],
    ['sheets', 'sheets', 'limits.sheets'],
    ['bytes', 'bytes', 'limits.bytes'],
    ['slides', 'slides', 'limits.slides'],
    ['slideBytes', 'UTF-8 bytes', 'limits.slideBytes'],
    ['notesBytes', 'UTF-8 bytes', 'limits.notesBytes'],
    ['localFonts.count', 'faces', 'limits.localFonts.count'],
    ['localFonts.bytes', 'decoded bytes', 'limits.localFonts.bytes'],
  ] as const)('names %s, its unit and clearing setting', (measure, unit, setting) => {
    const options = measure === 'pages' ? { where: 'slide 3', pagesSource: 'document' as const } : { where: 'slide 3' }
    const refusal = limitRefusal(measure, 6, 5, options)
    expect(refusal).toContain(`6 ${unit}`)
    expect(refusal).toContain(`${measure} limit of 5`)
    expect(refusal).toContain(setting)
    expect(refusal).toContain('slide 3')
  })

  test('names a lower-bound actual as at least', () => {
    expect(limitRefusal('sheets', 3, 2, { atLeast: true })).toBe(
      "The PDF is at least 3 sheets, above the sheets limit of 2; raise the host's limits.sheets, or reduce the content to clear this refusal.",
    )
  })

  test.each([
    ['pages', { pagesSource: 'host' as const }],
    ['sheets', { atLeast: true }],
    ['bytes', { setting: 'output.maxBytes' }],
    ['slides', {}],
    ['slideBytes', { where: 'slide 2' }],
    ['notesBytes', { where: 'slide 3' }],
    ['localFonts.count', { where: '"Second"' }],
    ['localFonts.bytes', { where: '"Body"' }],
  ] as const)('carries structured %s refusal facts without changing its message', (measure, options) => {
    const error = new LimitExceededError(measure, 6, 5, options)
    expect(error.message).toBe(limitRefusal(measure, 6, 5, options))
    expect(error.exceeded).toEqual([
      {
        measure,
        limit: 5,
        actual: 6,
        ...('where' in options ? { where: options.where } : {}),
        message: limitRefusal(measure, 6, 5, options),
      },
    ])
    expect(error).toBeInstanceOf(RangeError)
    expect(isLimitExceeded(error)).toBe(true)
  })

  test('recognizes only errors with a non-empty structured refusal list', () => {
    expect(isLimitExceeded(new Error('plain'))).toBe(false)
    expect(isLimitExceeded(Object.assign(new Error('empty'), { exceeded: [] }))).toBe(false)
    expect(isLimitExceeded(Object.assign(new Error('incomplete'), { exceeded: [{ measure: 'bytes', limit: 5 }] }))).toBe(false)
    expect(isLimitExceeded(Object.assign(new Error('unknown'), { exceeded: [{ measure: 'other', limit: 5, actual: 6, message: 'unknown' }] }))).toBe(false)
  })

  test('fills the shared template to the direct refusal', () => {
    const options = { pagesSource: 'host' as const }
    expect(fillLimitRefusal(limitRefusalTemplate('pages', 5, options), 6)).toBe(limitRefusal('pages', 6, 5, options))
  })

  test('names the binding page source and a caller-owned setting', () => {
    expect(limitRefusal('pages', 6, 5, { pagesSource: 'host' })).toContain("raise the host's limits.pages")
    expect(limitRefusal('bytes', 6, 5, { setting: 'output.maxBytes' })).toContain("raise the host's output.maxBytes")
  })

  test('local font enforcement uses the shared text', () => {
    expect(
      localFontLimitRefusal(
        [
          { family: 'First', bytes: 4 },
          { family: 'Second', bytes: 4 },
        ],
        { count: 1, bytes: 7 },
      ),
    ).toBe(limitRefusal('localFonts.count', 2, 1, { where: '"Second"' }))
    expect(
      localFontLimitExceeded(
        [
          { family: 'First', bytes: 4 },
          { family: 'Second', bytes: 4 },
        ],
        { count: 3, bytes: 7 },
      ),
    ).toEqual({
      measure: 'localFonts.bytes',
      limit: 7,
      actual: 8,
      where: '"Second"',
      message: limitRefusal('localFonts.bytes', 8, 7, { where: '"Second"' }),
    })
  })
})
