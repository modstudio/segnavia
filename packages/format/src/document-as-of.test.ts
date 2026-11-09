import { describe, expect, test } from 'bun:test'
import { Document } from './document.ts'

describe('Document as-of', () => {
  test.each([
    ['page', { type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Page</p>' } }] }],
    [
      'printed',
      {
        type: 'document',
        kind: 'printed',
        parentRules: [{ parent: 'body' }],
        parentPages: [{ type: 'parentPage', name: 'body' }],
        children: [{ type: 'page', body: { html: '<p>Printed</p>' } }],
      },
    ],
    ['book', { type: 'document', kind: 'book', title: 'Book', mode: 'continuous', children: [] }],
    ['deck', { type: 'document', kind: 'deck', title: 'Deck', children: [{ type: 'slide', content: { kind: 'html', html: '<p>Slide</p>' } }] }],
  ] as const)('keeps and JSON round-trips asOf on a %s document', (_kind, input) => {
    const asOf = { kind: 'fixed' as const, date: '2026-11-14' as const, zone: 'America/New_York' as const }
    const document = Document.parse({ ...input, asOf })
    expect(document.asOf).toEqual(asOf)
    expect(Document.parse(JSON.parse(JSON.stringify(document))).asOf).toEqual(asOf)
  })

  test('refuses asOf on a board document as an unsupported root field', () => {
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'board',
        title: 'Board',
        settings: { dir: 'ltr' },
        asOf: { kind: 'current' },
        children: [],
      }),
    ).toThrow(/root field asOf is not allowed in a board document/)
  })
})
