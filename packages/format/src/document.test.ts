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

  test('generates the document JSON Schema from the exported manifest', () => {
    expect(jsonSchemas()).toHaveProperty('document')
  })
})
