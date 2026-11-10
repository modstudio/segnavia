import { describe, expect, test } from 'bun:test'
import { HeadTemplate } from '@segnavia/format'
import { resolveHeadTemplate } from './head-template.ts'

describe('resolveHeadTemplate', () => {
  test('drops empty parts and collapses equal neighbors', () => {
    const template = HeadTemplate.parse({ name: 'trail', parts: [{ variable: 'category' }, { variable: 'article' }], separator: ' › ' })
    expect(resolveHeadTemplate(template, { category: 'Category', article: 'Article' }, {}, 'ltr', 'en')).toContain(
      'Category</bdi><span dir="ltr"> › </span><bdi dir="ltr">Article',
    )
    expect(resolveHeadTemplate(template, { category: 'Category', article: '' }, {}, 'ltr', 'en')).not.toContain('›')
    expect(resolveHeadTemplate(template, { category: 'Same', article: 'Same' }, {}, 'ltr', 'en').match(/Same/g)).toHaveLength(1)
  })

  test('isolates values in their own direction and the separator in the template direction', () => {
    const template = HeadTemplate.parse({ name: 'mixed', parts: [{ variable: 'he' }, { variable: 'en' }], separator: ' / ', dir: 'rtl' })
    expect(resolveHeadTemplate(template, { he: 'בראשית', en: 'Genesis' }, {}, undefined, undefined)).toBe(
      '<bdi dir="rtl">בראשית</bdi><span dir="rtl"> / </span><bdi dir="ltr">Genesis</bdi>',
    )
  })

  test('escapes values and separators before writing head markup', () => {
    const template = HeadTemplate.parse({ name: 'escaped', parts: [{ variable: 'value' }, { variable: 'other' }], separator: ' < ' })
    const resolved = resolveHeadTemplate(template, { value: 'A & <b>B</b>', other: 'C' }, {}, 'ltr', 'en')
    expect(resolved).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;')
    expect(resolved).toContain('<span dir="ltr"> &lt; </span>')
    expect(resolved).not.toContain('<b>B</b>')
  })

  test('ignores inherited record-slot properties', () => {
    const template = HeadTemplate.parse({ name: 'safe', parts: [{ record: 'constructor' }] })
    expect(resolveHeadTemplate(template, {}, {}, 'ltr', 'en')).toBe('')
  })
})
