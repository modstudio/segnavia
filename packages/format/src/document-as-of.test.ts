import { describe, expect, test } from 'bun:test'
import { BookShape } from './book.ts'
import { DeckShape } from './deck.ts'
import { Document } from './document.ts'
import { Page } from './page.ts'

describe('Document as-of', () => {
  test('round-trips a page as-of value through parsing and JSON', () => {
    const asOf = { kind: 'fixed' as const, date: '2026-11-14' as const, zone: 'America/New_York' as const }
    const page = Page.parse({ html: '<p>Day</p>', asOf })
    expect(page.asOf).toEqual(asOf)
    expect(Page.parse(JSON.parse(JSON.stringify(page))).asOf).toEqual(asOf)
  })

  test('stores as-of values on books and decks', () => {
    expect(BookShape.parse({ title: 'Book', mode: 'continuous', asOf: { kind: 'anchor', anchor: 'coming-shabbos' } }).asOf).toEqual({
      kind: 'anchor',
      anchor: 'coming-shabbos',
    })
    expect(
      DeckShape.parse({ title: 'Deck', asOf: { kind: 'current', zone: 'UTC' }, slides: [{ id: 'one', content: { kind: 'html', html: '' } }] }).asOf,
    ).toEqual({ kind: 'current', zone: 'UTC' })
  })

  test.each([
    ['page', { type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Page</p>' } }] }],
    [
      'printed',
      {
        type: 'document',
        kind: 'printed',
        print: { paper: 'a4' },
        parentRules: [{ parent: 'body' }],
        parentPages: [{ type: 'parentPage', name: 'body' }],
        children: [{ type: 'page', body: { html: '<p>Printed</p>' } }],
      },
    ],
    ['book', { type: 'document', kind: 'book', title: 'Book', mode: 'continuous', children: [{ type: 'flow', title: 'Body', html: '' }] }],
    ['deck', { type: 'document', kind: 'deck', title: 'Deck', children: [{ type: 'slide', content: { kind: 'html', html: '<p>Slide</p>' } }] }],
  ] as const)('keeps and JSON round-trips asOf on a %s document', (_kind, input) => {
    const asOf = { kind: 'fixed' as const, date: '2026-11-14' as const, zone: 'America/New_York' as const }
    const document = Document.parse({ ...input, asOf })
    expect(document.asOf).toEqual(asOf)
    expect(Document.parse(JSON.parse(JSON.stringify(document))).asOf).toEqual(asOf)
  })

  test('refuses an impossible as-of date at the document edge', () => {
    expect(() =>
      Document.parse({
        type: 'document',
        kind: 'page',
        asOf: { kind: 'fixed', date: '2026-02-30' },
        children: [{ type: 'page', body: { html: '<p>Page</p>' } }],
      }),
    ).toThrow()
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
