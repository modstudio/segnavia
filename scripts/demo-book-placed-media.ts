import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Book } from '@segnavia/format'
import { bookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { expandFrameBook } from '@segnavia/frame/motifs'

export async function writePlacedMediaBook(site: string): Promise<void> {
  const book = Book.parse({
    title: 'Placed Media Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    chapters: [{ title: 'Placed image', html: '<h1>Placed image</h1><img data-placed-check data-segnavia-media="tall">' }],
  })
  const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="2400"><rect width="240" height="2400" fill="#2b6cb0"/></svg>')
  const expanded = await expandFrameBook(
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
  writeFileSync(path.join(site, 'book-placed-media.html'), bookDocument(expanded.book, { nonce: newNonce() }))
}
