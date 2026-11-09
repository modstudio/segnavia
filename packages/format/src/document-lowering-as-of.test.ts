import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { bookFromDocument, deckFromDocument, pageFromDocument, printedFromDocument } from './document-lowering.ts'

test('document lowering carries asOf into every lowered shape', () => {
  const asOf = { kind: 'fixed' as const, date: '2026-11-14' as const, zone: 'America/New_York' as const }
  const page = Document.parse({
    type: 'document',
    kind: 'page',
    asOf,
    children: [{ type: 'page', body: { html: '<p>Page</p>' } }],
  })
  const printed = Document.parse({
    type: 'document',
    kind: 'printed',
    asOf,
    print: { paper: 'letter' },
    parentRules: [{ parent: 'body' }],
    parentPages: [{ type: 'parentPage', name: 'body' }],
    children: [{ type: 'page', body: { html: '<p>Printed</p>' } }],
  })
  const book = Document.parse({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    asOf,
    children: [{ type: 'section', title: 'Chapter', children: [{ type: 'flow', html: '<p>Chapter</p>' }] }],
  })
  const deck = Document.parse({
    type: 'document',
    kind: 'deck',
    title: 'Deck',
    asOf,
    children: [{ type: 'slide', content: { kind: 'html', html: '<p>Slide</p>' } }],
  })

  expect(pageFromDocument(page).asOf).toEqual(asOf)
  expect(printedFromDocument(printed).asOf).toEqual(asOf)
  expect(bookFromDocument(book).asOf).toEqual(asOf)
  expect(deckFromDocument(deck).asOf).toEqual(asOf)
})
