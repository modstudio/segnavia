import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument, type DocumentInput } from '@segnavia/format'
import { bookView, parseDocument } from '@segnavia/html'
import { fixtureIds } from './build-book-fixture-ids.ts'
import type { DemoBookPdf } from './build-book-plan.ts'

export interface LineNumberGeometry {
  page: number
  value: number
  x: number
  y: number
}

export function lineNumberGeometry(): LineNumberGeometry[] {
  const pages = document.querySelector<HTMLElement>('[data-segnavia-pages]')
  const transform = pages ? getComputedStyle(pages).transform : 'none'
  const scale = transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a
  return Array.from(document.querySelectorAll<HTMLElement>('[data-segnavia-book-page]')).flatMap((page) => {
    const pageBox = page.getBoundingClientRect()
    const pageNumber = Number(page.dataset.segnaviaBookPage)
    return Array.from(page.querySelectorAll<HTMLElement>('[data-segnavia-line-number]')).map((number) => {
      const box = number.getBoundingClientRect()
      return {
        page: pageNumber,
        value: Number(number.dataset.segnaviaLineNumber),
        x: (box.left - pageBox.left) / scale,
        y: (box.top - pageBox.top) / scale,
      }
    })
  })
}

export function numberedBookFixture(hebrew: boolean): DocumentInput {
  const lines = hebrew
    ? ['בראשית ברא', 'ויהי אור', 'יום אחד', 'רוח על המים', 'ערב ובוקר', 'טוב מאוד']
    : ['At first light', 'The harbor woke', 'Six bells sounded', 'The tide returned', 'The sails opened', 'The voyage began']
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: hebrew ? 'ספר ממוספר' : 'A Numbered Book' },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en', lineNumbers: { interval: 1, start: 1, restart: 'section', area: 'text', side: 'outer' } },
    style: { css: ':where(html){font:18px/1.5 serif}:where([data-line-numbers]){margin:0}' },
    page: { paper: 'a5', margin: { blockStart: 25, blockEnd: 25, inlineStart: 25, inlineEnd: 25 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: hebrew ? 'פרק' : 'Chapter',
            children: [{ type: 'flow', html: `<p data-line-numbers>${lines.join('<br>')}</p>` }],
          },
        ],
      },
    ],
  }
}

const numberedBookValue = (hebrew: boolean) => bookFromDocument(parseDocument(numberedBookFixture(hebrew), { newId: fixtureIds() }))

export function writeNumberedBookDemo(site: string): void {
  for (const hebrew of [false, true])
    writeFileSync(path.join(site, `book-line-numbers-${hebrew ? 'he' : 'en'}.json`), JSON.stringify(bookView(numberedBookValue(hebrew))))
  writeFileSync(
    path.join(site, 'book-line-numbers.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Numbered books</title><style>
      html,body{margin:0}body{box-sizing:border-box;padding:16px;background:#d9d5cc;font:16px system-ui,sans-serif}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.book h2{margin:0 0 8px}segnavia-book{display:block;block-size:70vh;background:#fff}
    </style></head><body><main class="books"><section class="book"><h2>English</h2><segnavia-book id="book-line-numbers-en" src="book-line-numbers-en.json"></segnavia-book></section><section class="book"><h2>עברית</h2><segnavia-book id="book-line-numbers-he" src="book-line-numbers-he.json"></segnavia-book></section></main><script type="module" src="segnavia.js"></script></body></html>`,
  )
}

export async function buildNumberedBookPdfs(site: string, bookPdf: DemoBookPdf): Promise<void> {
  for (const hebrew of [false, true]) {
    let geometry: LineNumberGeometry[] | undefined
    const pdf = await bookPdf(numberedBookFixture(hebrew), {
      beforeOutput: async (tab) => {
        geometry = await tab.evaluate(lineNumberGeometry)
      },
    })
    if (!geometry) throw new Error(`The ${hebrew ? 'Hebrew' : 'English'} numbered PDF did not expose its line-number geometry.`)
    const language = hebrew ? 'he' : 'en'
    writeFileSync(path.join(site, `book-line-numbers-${language}.pdf`), pdf)
    writeFileSync(path.join(site, `book-line-numbers-${language}-pdf-geometry.json`), JSON.stringify(geometry))
  }
}
