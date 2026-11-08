import { describe, expect, test } from 'bun:test'
import { Document } from '@segnavia/format'
import { brandSpecimen } from './brand-specimen.ts'

const brand = {
  tokens: {
    colors: { ink: '#112233' },
    fontFamilies: { body: ['Noto Sans'] },
  },
  textStyles: { heading: { kind: 'paragraph' as const, color: { token: 'ink' as const }, fontFamily: { token: 'body' as const } } },
}

describe('brandSpecimen', () => {
  test.each(['en', 'he'] as const)('returns a parseable continuous %s book without a brand name', (lang) => {
    const specimen = brandSpecimen(brand, { lang })
    expect(Document.parse(specimen)).toEqual(specimen)
    expect(specimen.kind).toBe('book')
    expect(specimen.mode).toBe('continuous')
    expect(specimen.brand).toBeUndefined()
    expect(specimen.settings?.dir).toBe(lang === 'he' ? 'rtl' : 'ltr')
    const flow = specimen.children[0]
    expect(flow?.type).toBe('flow')
    const html = flow?.type === 'flow' ? flow.html : ''
    expect(html).toContain('var(--segnavia-color-ink)')
    expect(html).toContain('var(--segnavia-family-body)')
    expect(html).toContain('segnavia-style-heading')
    expect(html).toContain('dir="ltr"')
    expect(html).toContain(`dir="rtl">${HEBREW}`)
  })
})

const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃'
