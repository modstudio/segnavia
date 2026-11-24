import { describe, expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { expandFramePage } from './motif-expansion.ts'
import { htmlSlideDocument } from './slide-print-document.ts'

const logo = { src: 'data:image/svg+xml,%3Csvg/%3E', alt: 'House' }
const signal = new AbortController().signal

describe('logo motif surfaces', () => {
  test('expands in a page without a host motif source', async () => {
    const page = resolvePageHtml(Page.parse({ brand: { logo }, html: '<main data-motif="segnavia:logo"></main>' }))
    expect((await expandFramePage(page, undefined, signal)).page.html).toContain(
      '<main data-motif="segnavia:logo"><img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr"></main>',
    )
  })

  test('expands in running furniture', async () => {
    const page = resolvePageHtml(
      Page.parse({
        brand: { logo },
        html: '<p>Body</p>',
        print: { paper: 'a4' },
        printedPages: {
          parents: [{ name: 'body', regions: { head: { edge: 'blockStart', html: '<header data-motif="segnavia:logo"></header>' } } }],
          parentRules: [{ parent: 'body' }],
        },
      }),
    )
    const expanded = await expandFramePage(page, undefined, signal)
    expect(expanded.page.printedPages?.parents[0]?.regions.head?.html).toContain('<img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr">')
  })

  test('expands in a slide frame', () => {
    const deck = Deck.parse({ title: 'Deck', brand: { logo }, slides: [{ id: 'one', content: { kind: 'html', html: '' } }] })
    expect(htmlSlideDocument(deck, '<div data-motif="segnavia:logo"></div>', { nonce: 'known' })).toContain(
      '<div data-motif="segnavia:logo"><img src="data:image/svg+xml,%3Csvg/%3E" alt="House" dir="ltr"></div>',
    )
  })
})
