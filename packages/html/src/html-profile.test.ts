import { describe, expect, test } from 'bun:test'
import { HTML_PROFILE_MAPPING, HtmlProfile } from './html-profile.ts'
import { REFUSED_ELEMENTS, sanitize } from './sanitize.ts'

const validProfile = {
  blocks: { p: true, h: [1, 2, 3, 4, 5, 6], ul: true, ol: { start: true }, hr: true },
  marks: ['bold', 'italic', 'underline', 'link'],
  links: { schemes: ['https', 'http', 'mailto', 'tel'] },
  align: ['start', 'center', 'end'],
  direction: true,
  atoms: { pattern: 'double-brace' },
} satisfies HtmlProfile

describe('HTML profile', () => {
  test('parses the semantic profile value', () => {
    expect(HtmlProfile.parse(validProfile)).toEqual(validProfile)
  })

  test('refuses unknown fields, marks, and link schemes by name', () => {
    expect(() => HtmlProfile.parse({ ...validProfile, scripts: true })).toThrow('scripts')
    expect(() => HtmlProfile.parse({ ...validProfile, marks: ['strikethrough'] })).toThrow('strikethrough')
    expect(() => HtmlProfile.parse({ ...validProfile, links: { schemes: ['javascript'] } })).toThrow('javascript')
  })

  test('maps every block and mark entry to fixed HTML data', () => {
    expect(Object.keys(HTML_PROFILE_MAPPING.blocks)).toEqual(['p', 'h', 'ul', 'ol', 'hr'])
    expect(Object.keys(HTML_PROFILE_MAPPING.marks)).toEqual(['bold', 'italic', 'underline', 'link'])
    expect(HTML_PROFILE_MAPPING.marks.bold).toEqual({ tags: ['strong'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.marks.italic).toEqual({ tags: ['em'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.marks.underline).toEqual({ tags: ['u'], attributes: [] })
    expect(HTML_PROFILE_MAPPING.marks.link).toEqual({ tags: ['a'], attributes: ['href'] })
    expect(HTML_PROFILE_MAPPING.blocks.ol).toEqual({ tags: ['ol', 'li'], attributes: ['start'] })
    expect(HTML_PROFILE_MAPPING.blocks.hr).toEqual({ tags: ['hr'], attributes: [] })
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
