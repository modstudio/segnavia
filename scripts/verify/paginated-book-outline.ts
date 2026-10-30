import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { BookInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { verifyPdfStructure } from './book-pdf-readback.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

export async function verifyPaginatedBookWithoutContents(renderer: Renderer, work: string, check: Check): Promise<void> {
  const book: BookInput = {
    title: 'Book without contents',
    authors: ['A. Writer'],
    subject: 'Outline destinations without a contents section',
    mode: 'paginated',
    lang: 'en',
    page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
    chapters: [{ title: 'Chapter One', html: `<p>OPEN_NO_CONTENTS</p><h2 id="topic-no-contents">Topic</h2><p>${'text '.repeat(40)}</p>` }],
  }
  const bytes = await renderer.bookPdf(book, { effects: false, css: 'body{font:16px serif}' })
  const file = path.join(work, 'book-paginated-no-contents.pdf')
  writeFileSync(file, bytes)
  const pages = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).split('\f').slice(0, -1)
  const pageWith = (value: string) => pages.findIndex((page) => page.includes(value)) + 1
  verifyPdfStructure(
    await PDFDocument.load(bytes),
    book,
    [
      { title: 'Chapter One', page: pageWith('OPEN_NO_CONTENTS') },
      { title: 'Topic', page: pageWith('Topic') },
    ],
    'paginated book without contents',
    check,
  )
}
