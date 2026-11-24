import { describe, expect, test } from 'bun:test'
import { ZodError } from 'zod'
import { HTML_PROFILE_DIRECTIONS, HTML_PROFILE_MAPPING, HTML_PROFILE_MARKS, HtmlProfile, profileElements, profileLinkPolicy } from './html-profile.ts'
import { REFUSED_ELEMENTS, sanitize } from './sanitize.ts'

const validProfile = {
  blocks: { p: true, h: [1, 2, 3, 4, 5, 6], ul: true, ol: { start: true }, hr: true },
  marks: ['bold', 'italic', 'underline', 'link'],
  links: { schemes: ['https', 'http', 'mailto', 'tel'] },
  align: ['start', 'center', 'end'],
  direction: true,
  atoms: { pattern: 'double-brace' },
} satisfies HtmlProfile

function profileRefusal(input: unknown): ZodError {
  try {
    HtmlProfile.parse(input)
  } catch (error) {
    if (error instanceof ZodError) return error
    throw error
  }
  throw new Error('expected the profile to refuse the value')
}

describe('HTML profile', () => {
  test('parses the semantic profile value', () => {
    expect(HtmlProfile.parse(validProfile)).toEqual(validProfile)
  })

  test('refuses unknown fields, marks, and link schemes by name', () => {
    expect(profileRefusal({ ...validProfile, scripts: true }).issues[0]?.message).toContain('scripts: unknown key "scripts"')
    expect(profileRefusal({ ...validProfile, links: { ...validProfile.links, protocols: ['https:'] } }).issues[0]?.message).toContain(
      'use links.schemes instead',
    )
    expect(() => HtmlProfile.parse({ ...validProfile, marks: ['strikethrough'] })).toThrow('strikethrough')
    expect(() => HtmlProfile.parse({ ...validProfile, links: { schemes: ['javascript'] } })).toThrow('javascript')
  })

  test('keeps unusual refused values inside the Zod refusal', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic

    for (const [input, name] of [
      [{ ...validProfile, marks: [1n] }, '1'],
      [{ ...validProfile, links: { schemes: [cyclic] } }, '[object Object]'],
    ] as const) {
      expect(profileRefusal(input).message).toContain(name)
    }
  })

  test('maps every block and mark entry to fixed HTML data', () => {
    expect(Object.keys(HTML_PROFILE_MAPPING.blocks)).toEqual(['p', 'h', 'ul', 'ol', 'hr'])
    expect(Object.keys(HTML_PROFILE_MAPPING.marks)).toEqual([...HTML_PROFILE_MARKS])
    expect(HTML_PROFILE_MAPPING.marks.bold).toEqual({ tags: ['strong'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.marks.italic).toEqual({ tags: ['em'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.marks.underline).toEqual({ tags: ['u'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.marks.link).toEqual({ tags: ['a'], attributes: ['href'] })
    expect(HTML_PROFILE_MAPPING.blocks.ol).toEqual({ tags: ['ol', 'li'], attributes: ['start'] })
    expect(HTML_PROFILE_MAPPING.blocks.hr).toEqual({ tags: ['hr'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.direction).toEqual({ attribute: 'dir', values: HTML_PROFILE_DIRECTIONS })
  })

  test('resolves the profile link schemes through the link policy', () => {
    expect(profileLinkPolicy(validProfile)).toEqual({
      protocols: new Set(['https:', 'http:', 'mailto:', 'tel:']),
      origins: undefined,
      fragments: true,
    })
    expect(profileLinkPolicy({ blocks: { p: true }, marks: [] })).toBeUndefined()
  })

  test('folds selected headings and ordered-list attributes into admitted elements', () => {
    expect(profileElements({ blocks: { h: [2, 3], ol: {} }, marks: [] })).toEqual({
      h2: [],
      h3: [],
      ol: [],
      li: [],
    })
    expect(profileElements({ blocks: { ol: { start: true } }, marks: [] })).toEqual({ ol: ['start'], li: [] })
  })

  test('every mapped tag is admitted by the sanitizer', () => {
    const tags = new Set([
      ...Object.values(HTML_PROFILE_MAPPING.blocks).flatMap(({ tags }) => tags),
      ...Object.values(HTML_PROFILE_MAPPING.marks).flatMap(({ tags }) => tags),
    ])
    const htmlFor = (tag: string) => {
      if (tag === 'hr') return '<hr>'
      if (tag === 'a') return '<a href="https://example.com">text</a>'
      if (tag === 'ol') return '<ol start="2">text</ol>'
      return `<${tag}>text</${tag}>`
    }
    const links = { protocols: validProfile.links.schemes.map((scheme) => `${scheme}:`) }

    for (const tag of tags) {
      expect(REFUSED_ELEMENTS.has(tag)).toBe(false)
      const html = htmlFor(tag)
      expect(sanitize(html, { links })).toBe(html)
    }
  })
})
