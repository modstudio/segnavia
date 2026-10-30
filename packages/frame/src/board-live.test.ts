import { expect, test } from 'bun:test'

test('passes a board motif source to a live book before its view', async () => {
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
        versions: [{ lang: 'en', html: '<strong data-board-book-motif>Expanded</strong>' }],
        fonts: [],
      }),
    },
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
            margin: { top: 10, bottom: 10, inner: 10, outer: 10 },
            columnGap: 0,
            direction: 'ltr',
            numbering: { frontMatter: 'roman-lower', body: 'arabic' },
            rectoOpenings: false,
            orphans: 2,
            widows: 2,
            parents: [{ name: 'body', foot: '<span data-motif="held"></span>', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } }],
            endnotePlacement: 'book',
            contents: { pageNumbers: true, depth: 2 },
            runningHead: { recto: 'title', verso: 'title' },
          },
        },
      },
      () => {},
      motifs,
    )
    const book = live.element as InstanceType<typeof import('./book.ts')['SegnaviaBook']>
    expect(book.motifs).toBe(motifs)
    if (!book.view || !book.motifs) throw new Error('the live board book did not receive its view and motifs')
    const expanded = await expandFrameBookView(book.view, book.motifs, new AbortController().signal)
    expect(expanded.book.pagination?.parents[0]?.foot).toContain('data-board-book-motif')
  } finally {
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
