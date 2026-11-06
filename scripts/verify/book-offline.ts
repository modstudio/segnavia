import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'

export async function verifyBookOffline(renderer: Renderer, origin: string): Promise<void> {
  const external = `<link rel="stylesheet" href="${origin}/book.css"><img src="${origin}/book.png"><a href="${origin}/book-link">external</a>`
  const document: DocumentInput = {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Offline book' },
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          { type: 'section', title: 'Chapter', children: [{ type: 'flow', html: `${external}<p>Text<span data-note="footnote">${external}</span></p>` }] },
        ],
      },
    ],
  }
  await renderer.bookPdf(document, { effects: false })
}
