import type { Renderer } from '@segnavia/render'

export async function verifyBookOffline(renderer: Renderer, origin: string): Promise<void> {
  const external = `<link rel="stylesheet" href="${origin}/book.css"><img src="${origin}/book.png"><a href="${origin}/book-link">external</a>`
  await renderer.bookPdf(
    {
      title: 'Offline book',
      mode: 'continuous',
      page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
      chapters: [{ title: 'Chapter', html: `${external}<p>Text<span data-note="footnote">${external}</span></p>` }],
    },
    { effects: false },
  )
}
