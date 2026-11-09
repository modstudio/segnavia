import { expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'

test('passes board motif and placement sources to a live book before its view', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
  const { liveBoardItem } = await import('./board-live.ts')
  const { expandFrameBookView } = await import('./motif-expansion.ts')
  const motifs = {
    source: {
      motif: async (key: string) => ({
        key,
        revision: 'one',
        label: key,
        fields: [],
        versions: [{ lang: 'en', html: '<strong data-board-book-motif>Expanded</strong><img data-segnavia-media="cover">' }],
        fonts: [],
      }),
    },
  }
  const src = 'data:image/png;base64,AA=='
  const placements = {
    resolve: async () => ({ kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }),
  }
  try {
    const live = liveBoardItem(
      {
        kind: 'book',
        size: { width: 100, height: 140 },
        view: {
          html: '<main data-segnavia-galleys></main>',
          pagination: {
            paper: { width: 100, height: 140 },
            margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
            columnGap: 0,
            geometries: [
              {
                paper: { width: 100, height: 140 },
                margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 },
                columns: { count: 1, gap: 0 },
                parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
              },
            ],
            direction: 'ltr',
            numbering: { frontMatter: 'roman-lower', body: 'arabic' },
            rectoOpenings: false,
            orphans: 2,
            widows: 2,
            parents: [{ name: 'body', foot: '<span data-motif="held"></span>', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
            endnotePlacement: 'book',
            contents: { pageNumbers: true, depth: 2 },
            runningHead: { recto: 'title', verso: 'title' },
          },
        },
      },
      () => {},
      motifs,
      undefined,
      placements,
      { standard: 900 },
    )
    const book = live.element as InstanceType<typeof import('./book.ts')['SegnaviaBook']>
    expect(book.motifs).toBe(motifs)
    expect(book.placements).toBe(placements)
    expect(book.pageWidths).toEqual({ standard: 900 })
    if (!book.view || !book.motifs) throw new Error('the live board book did not receive its view and sources')
    const expanded = await expandFrameBookView(book.view, book.motifs, new AbortController().signal, book.placements)
    expect(expanded.book.pagination?.parents[0]?.foot).toContain('data-board-book-motif')
    expect(expanded.book.pagination?.parents[0]?.foot).toContain(`src="${src}"`)
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})

test('routes deck, page and paper values through their internal load seams', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
  try {
    const { loadLiveDeck, loadLivePage, loadLivePaper } = await import('./board-live.ts')
    const { internalPageLoad, internalPaperPagesLoad, internalThumbnailDeckLoad } = await import('./document-value-load.ts')
    const deck = Deck.parse({ title: 'Deck', slides: [{ id: 'one', content: { kind: 'html', html: '' } }] })
    const page = Page.parse({ html: '<p>Page</p>', size: { width: 320, height: 200 } })
    const received: unknown[] = []
    loadLiveDeck({ [internalThumbnailDeckLoad]: (value: unknown) => received.push(value) } as never, deck)
    loadLivePage({ [internalPageLoad]: (value: unknown) => received.push(value) } as never, page)
    loadLivePaper({ [internalPaperPagesLoad]: (values: unknown) => received.push(values) } as never, [page], {} as never)
    expect(received).toEqual([deck, Page.parse({ ...page, scripts: 'refuse' }), [Page.parse({ ...page, scripts: 'refuse' })]])
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
