import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'
import { jsonSchemas } from './json-schemas.ts'

describe('Document', () => {
  test('keeps optional ids and refuses nodes outside the kind profile', () => {
    const parsed = Document.parse({ type: 'document', id: 'page-doc', kind: 'page', children: [{ type: 'page', id: 'body', body: { html: '<p>Body</p>' } }] })
    expect(parsed.id).toBe('page-doc')
    expect(parsed.children[0]?.id).toBe('body')
    expect(() => Document.parse({ type: 'document', kind: 'deck', children: [{ type: 'flow', html: '<p>Body</p>' }] })).toThrow(
      'node flow is not allowed in a deck document; use one of slide to clear this refusal',
    )
  })

  test('refuses reserved records and conditions with a remedy', () => {
    expect(() => Document.parse({ type: 'document', kind: 'book', children: [{ type: 'record', name: 'row' }] })).toThrow(
      'record row is not yet supported; remove it to clear this refusal',
    )
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'page',
        children: [{ type: 'page', body: { html: '' } }],
        conditions: [{ type: 'condition', name: 'edition' }],
      }),
    ).toThrow('condition edition is not yet supported; remove it to clear this refusal')
  })

  test('refuses root fields outside the kind profile', () => {
    expect(() => Document.parse({ type: 'document', kind: 'book', transition: { kind: 'fade' }, children: [] })).toThrow(
      /root field transition is not allowed in a book document; use one of .*mode.* to clear this refusal/,
    )
    expect(() =>
      Document.parse({ type: 'document', kind: 'deck', footnotes: { restart: 'chapter' }, children: [{ type: 'slide', content: { kind: 'html', html: '' } }] }),
    ).toThrow(/root field footnotes is not allowed in a deck document; use one of .*transition.* to clear this refusal/)
  })

  test('uses settings.dir for boards and refuses unsupported direction values', () => {
    expect(() => Document.parse({ type: 'document', kind: 'board', settings: { dir: 'auto' }, children: [] })).toThrow(
      'settings.dir value auto is not allowed in a board document; use one of ltr, rtl to clear this refusal',
    )
  })

  test.each(['scripts', 'lang'] as const)('refuses unused board settings.%s through its profile', (field) => {
    const value = field === 'scripts' ? 'refuse' : 'he'
    expect(() => Document.parse({ type: 'document', kind: 'board', settings: { dir: 'rtl', [field]: value }, children: [] })).toThrow(
      `settings field ${field} is not allowed in a board document; use one of dir to clear this refusal`,
    )
  })

  test('keeps direction policy in profiles and refuses limits where the current pipeline cannot carry them', () => {
    expect(Document.parse({ type: 'document', kind: 'book', settings: { dir: 'auto' }, limits: { pages: 12 }, children: [] }).limits).toEqual({ pages: 12 })
    expect(() => Document.parse({ type: 'document', kind: 'board', limits: { pages: 12 }, children: [] })).toThrow(
      'document field limits is not yet supported; remove it to clear this refusal',
    )
  })

  test('refuses declared fields that lowering does not yet support', () => {
    const values = [
      { type: 'document', kind: 'book', children: [{ type: 'section', opens: 'continue', children: [] }] },
      { type: 'document', kind: 'book', children: [{ type: 'section', headTemplate: 'running', children: [] }] },
      { type: 'document', kind: 'book', children: [{ type: 'section', pageGeometry: 'wide', children: [] }] },
      { type: 'document', kind: 'book', children: [], parentPages: [{ type: 'parentPage', name: 'body', regions: { side: '<aside></aside>' } }] },
      { type: 'document', kind: 'book', brand: 'publisher', children: [] },
      { type: 'document', kind: 'book', children: [], variables: [{ type: 'variable', name: 'folio', valueType: 'folio' }] },
    ]
    for (const value of values) expect(() => Document.parse(value)).toThrow('is not yet supported; remove it to clear this refusal')
  })

  test('generates the document JSON Schema from the exported manifest', () => {
    expect(jsonSchemas()).toHaveProperty('document')
  })
})
