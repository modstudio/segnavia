import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

export async function verifyBookCssRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  let printedStyle: { color: string; size: string } | undefined
  const bytes = await renderer.bookPdf(
    {
      title: 'Styled book',
      mode: 'paginated',
      css: '.book-css-check{color:rgb(91, 42, 123);font-size:23px}',
      page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
      chapters: [{ title: 'One', html: '<p class="book-css-check">BOOK_CSS_PDF</p>' }],
    },
    {
      effects: false,
      css: 'body{font:16px serif}',
      beforeOutput: async (tab) => {
        printedStyle = await tab
          .locator('[data-segnavia-book-page] .book-css-check')
          .first()
          .evaluate((element) => {
            const style = getComputedStyle(element)
            return { color: style.color, size: style.fontSize }
          })
      },
    },
  )
  const file = path.join(work, 'book-css.pdf')
  writeFileSync(file, bytes)
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  check(
    'PDF text uses the book CSS color and size',
    printedStyle?.color === 'rgb(91, 42, 123)' && printedStyle.size === '23px' && text.includes('BOOK_CSS_PDF'),
    JSON.stringify(printedStyle),
  )
}
