import { expect, test } from 'bun:test'
import { type BrandSource, Imposition } from '@segnavia/format'
import { expandFrameBook } from './motif-expansion.ts'
import { printableDeck, printablePages } from './print-document.ts'

const deck = {
  type: 'document' as const,
  kind: 'deck' as const,
  title: 'Deck',
  brand: 'house',
  children: [{ type: 'slide' as const, id: 'one', content: { kind: 'html' as const, html: '<p>One</p>' } }],
}

test('an async Document edge resolves its named brand before lowering', async () => {
  const source: BrandSource = { brand: async () => ({ css: '.house{color:red}' }) }
  const book = {
    type: 'document' as const,
    kind: 'book' as const,
    title: 'Book',
    mode: 'continuous' as const,
    brand: 'house',
    children: [{ type: 'section' as const, title: 'Chapter', children: [{ type: 'flow' as const, html: '<p>Body</p>' }] }],
  }

  const expanded = await expandFrameBook(book, undefined, new AbortController().signal, undefined, 'screen', undefined, { source })

  expect(expanded.book.brand).toEqual({ css: '.house{color:red}' })
})

test('a synchronous Document edge refuses a brand name with the value-entry remedy', () => {
  expect(() => printableDeck(deck)).toThrow(
    'Document names brand "house"; resolve it with resolveBrand, lower with that brand, and pass the lowered value to printableDeckValue to clear this refusal.',
  )
})

test('printablePages names its own value counterpart in the brand refusal', () => {
  const page = {
    type: 'document' as const,
    kind: 'page' as const,
    brand: 'house',
    children: [{ type: 'page' as const, body: { html: '<p>Page</p>' } }],
  }
  const imposition = Imposition.parse({
    paper: { width: 210, height: 297, unit: 'mm' },
    columns: 1,
    rows: 1,
    cell: { width: 100, height: 100 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { column: 0, row: 0 },
    bleed: 0,
    safe: 0,
  })
  expect(() => printablePages([page], imposition)).toThrow(
    'Document names brand "house"; resolve it with resolveBrand, lower with that brand, and pass the lowered value to printablePageValues to clear this refusal.',
  )
})
