import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'

type Check = (what: string, ok: boolean, detail?: string) => void

export async function verifyBookDocumentPageLimitRender(renderer: Renderer, check: Check): Promise<void> {
  const paragraphs = Array.from({ length: 510 }, (_, index) => `<p>Page ${index + 1}</p>`).join('')
  const document: DocumentInput = {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Book above the default page limit' },
    mode: 'paginated',
    limits: { pages: 1000 },
    page: { paper: 'a6', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [{ type: 'section', title: 'Pages', children: [{ type: 'flow', html: paragraphs }] }],
      },
    ],
  }

  const bytes = await renderer.bookPdf(document, { effects: false, css: 'body{font:12px serif}p{break-before:page;margin:0}' })
  const pages = (await PDFDocument.load(bytes)).getPageCount()
  check('bookPdf re-reads a plan above the default with the document page limit', pages === 510, `pages=${pages}`)
}
