import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookValueDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { expandFrameBookValue } from '@segnavia/frame/motifs'
import { bookDocumentFixture, bookFixtureValue } from './book-document-fixture.ts'

export async function writePlacedMediaBook(site: string): Promise<void> {
  const document = bookDocumentFixture({
    title: 'Placed Media Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
    chapters: [{ title: 'Placed image', html: '<h1>Placed image</h1><img data-placed-check data-segnavia-media="tall">' }],
  })
  const book = bookFixtureValue(document)
  const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="2400"><rect width="240" height="2400" fill="#2b6cb0"/></svg>')
  const expanded = await expandFrameBookValue(
    book,
    undefined,
    new AbortController().signal,
    {
      resolve: async () => ({
        kind: 'media',
        media: { format: 'svg', size: { width: 240, height: 2400 }, alt: { text: 'A tall placed image' } },
        src: `data:image/svg+xml,${svg}`,
      }),
    },
    'print',
  )
  writeFileSync(path.join(site, 'book-placed-media.html'), bookValueDocument(expanded.book, { nonce: newNonce() }))
}
