import { describe, expect, test } from 'bun:test'
import { DocumentMetadata } from './document-metadata.ts'

describe('DocumentMetadata', () => {
  test('accepts defined fields and host extras', () => {
    expect(
      DocumentMetadata.parse({
        title: 'הגדה של פסח',
        authors: ['אחת', 'Two'],
        subject: 'ליל הסדר',
        lang: 'he',
        extra: { edition: 'Second', 'print-year': '5787' },
      }),
    ).toEqual({
      title: 'הגדה של פסח',
      authors: ['אחת', 'Two'],
      subject: 'ליל הסדר',
      lang: 'he',
      extra: { edition: 'Second', 'print-year': '5787' },
    })
  })

  test('refuses a title without visible text', () => {
    expect(() => DocumentMetadata.parse({ title: ' \n\t' })).toThrow('title must contain visible text')
  })

  test('refuses an extra key that is not an XML local name', () => {
    const result = DocumentMetadata.safeParse({ title: 'Seder', extra: { ת: 'value' } })
    expect(result.error?.issues[0]?.message).toContain('extra key "ת" is not an ASCII XML local name')
  })

  test('refuses an extra key that collides with a defined field', () => {
    const result = DocumentMetadata.safeParse({ title: 'Seder', extra: { lang: 'other' } })
    expect(result.error?.issues[0]?.message).toContain('extra key "lang" collides')
  })

  test('refuses a standard PDF Info key and names the remedy', () => {
    const result = DocumentMetadata.safeParse({ title: 'Seder', extra: { Title: 'Other' } })
    expect(result.error?.issues[0]?.message).toBe('extra key "Title" is a standard PDF Info key; choose another name')
  })
})
