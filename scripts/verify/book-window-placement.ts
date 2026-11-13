import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

export async function verifyBookWindowPlacement(renderer: Renderer, work: string, check: Check): Promise<void> {
  const markers = ['AAA', ...Array.from({ length: 8 }, (_, index) => `P${index}`)]
  const document: DocumentInput = {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Window placement' },
    mode: 'paginated',
    page: { paper: 'letter', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: 'One',
            children: [
              {
                type: 'flow',
                html: `<div><p>AAA</p></div>${markers
                  .slice(1)
                  .map((marker) => `<p>${marker}</p>`)
                  .join('')}`,
              },
            ],
          },
        ],
      },
    ],
  }
  const bytes = await renderer.bookPdf(document, { effects: false })
  const file = path.join(work, 'book-window-placement.pdf')
  writeFileSync(file, bytes)
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  const missing = markers.filter((marker) => !text.includes(marker))
  check('a wrapper with a collapsing child margin keeps every later paragraph in its window', missing.length === 0, JSON.stringify({ missing, text }))
}
