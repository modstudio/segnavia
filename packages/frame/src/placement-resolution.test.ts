import { expect, test } from 'bun:test'
import { BookView, Page } from '@segnavia/format'
import { expandFrameBookView, expandFramePage } from './motif-expansion.ts'

const signal = new AbortController().signal
const src = 'data:image/png;base64,AA=='
const placements = {
  resolve: async () => ({ kind: 'media' as const, media: { format: 'png' as const, size: { width: 20, height: 10 } }, src }),
}

test('frame page preparation resolves placed media into the document HTML', async () => {
  const page = Page.parse({ html: '<img data-segnavia-media="cover">', size: { width: 320, height: 200 } })
  expect((await expandFramePage(page, undefined, signal, placements)).page.html).toContain(`src="${src}"`)
})

test('frame book preparation resolves placed media into the document HTML', async () => {
  const view = BookView.parse({ html: '<main><img data-segnavia-media="cover"></main>' })
  expect((await expandFrameBookView(view, undefined, signal, placements)).book.html).toContain(`src="${src}"`)
})

test('placements introduced by motif expansion resolve afterward', async () => {
  const page = Page.parse({ html: '<div data-motif="hero"></div>', size: { width: 320, height: 200 } })
  const motifs = {
    source: {
      motif: async () => ({
        key: 'hero',
        label: 'Hero',
        revision: '1',
        fields: [],
        fonts: [],
        versions: [{ lang: 'en', html: '<img data-segnavia-media="cover">' }],
      }),
    },
  }
  expect((await expandFramePage(page, motifs, signal, placements)).page.html).toContain(`src="${src}"`)
})
