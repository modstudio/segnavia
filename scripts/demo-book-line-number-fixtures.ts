import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument, type DocumentInput } from '@segnavia/format'
import { bookView, parseDocument } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { fixtureIds } from './build-book-fixture-ids.ts'
import type { DemoBookPdf } from './build-book-plan.ts'
import { pdfOutlineItems } from './verify/book-pdf-readback.ts'

export interface LineNumberGeometry {
  page: number
  value: number
  x: number
  y: number
}

export interface SideNoteGeometry {
  id: string
  kind: string
  page: number
  x: number
  y: number
  anchorY: number
}

export function sideNoteGeometry(): SideNoteGeometry[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-segnavia-book-page]')).flatMap((page) => {
    const pageBox = page.getBoundingClientRect()
    const scale = pageBox.width / page.offsetWidth
    return Array.from(page.querySelectorAll<HTMLElement>('[data-segnavia-side-notes] [data-side-note]')).map((note) => {
      const box = note.getBoundingClientRect()
      const kind = note.getAttribute('data-side-note-kind') ?? ''
      const anchor = page.querySelector(`[data-side-note-anchor="${kind}"]`)
      const anchorBox = anchor?.getBoundingClientRect()
      return {
        id: note.dataset.segnaviaId ?? '',
        kind,
        page: Number(page.dataset.segnaviaBookPage),
        x: (box.left - pageBox.left) / scale,
        y: (box.top - pageBox.top) / scale,
        anchorY: anchorBox ? (anchorBox.top - pageBox.top) / scale : Number.NaN,
      }
    })
  })
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

export function sideNoteBookFixture(hebrew: boolean): DocumentInput {
  const note = hebrew ? 'הערת שוליים עשירה' : 'A rich margin note'
  const inlineNote = hebrew
    ? 'הערת שוליים ארוכה ועשירה שנעטפת לכמה שורות בשוליים הצרים של העמוד'
    : 'A long rich margin note whose text wraps across several lines in the narrow page margin'
  const text = hebrew ? 'הטקסט ממשיך בשורה הזאת' : 'The text continues on this line'
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: hebrew ? 'ספר עם הערות' : 'A Book with Side Notes' },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en', sideNotes: { area: 'margin', side: 'outer' } },
    style: { css: ':where(html){font:18px/1.5 serif}:where([data-side-note]){font-size:12px;line-height:1.25}' },
    page: { paper: 'a5', margin: { blockStart: 25, blockEnd: 25, inlineStart: 30, inlineEnd: 30 } },
    children: [
      {
        type: 'division',
        name: 'front',
        children: [{ type: 'contents', title: hebrew ? 'תוכן' : 'Contents' }],
      },
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: hebrew ? 'פרק' : 'Chapter',
            children: [
              {
                type: 'flow',
                html: `<p>${text}</p><h2 id="side-heading" data-side-note data-side-note-kind="block">${note} <em>${hebrew ? 'מודגשת' : 'emphasized'}</em></h2><p><span data-side-note-anchor="block">${text}</span></p><p data-side-note-holder>${text}<br><span>${text}</span> <span data-side-note data-side-note-kind="inline" data-side-note-anchor="inline">${inlineNote}<em style="break-inside:avoid"> ${hebrew ? 'נשמרת' : 'kept'}</em></span></p><p data-side-note-control>${text}<br><span>${text}</span></p><p>${text}</p>`,
              },
            ],
          },
        ],
      },
    ],
  }
}

export function lineKeyedBookFixture(hebrew: boolean): DocumentInput {
  const firstLemma = hebrew ? 'מילים ארוכות שנעטפות בסוף השורה' : 'several long words wrapping at the line end'
  const sharedOne = hebrew ? 'אחד' : 'one'
  const sharedTwo = hebrew ? 'שניים' : 'two'
  const nextWord = hebrew ? 'המשך' : 'continues'
  const spaceBefore = hebrew ? 'רווח' : 'single'
  const spaceAfter = hebrew ? 'רגיל' : 'space'
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: hebrew ? 'ספר הערות שורה' : 'A Line-Keyed Book' },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en', lineNumbers: { interval: 1, restart: 'page', area: 'text', side: 'outer' } },
    style: { css: ':where(html){font:18px/1.5 serif}:where([data-line-numbers]){margin:0;max-inline-size:17em}' },
    page: { paper: 'a5', margin: { blockStart: 25, blockEnd: 25, inlineStart: 25, inlineEnd: 25 } },
    noteSeries: [{ type: 'noteSeries', name: 'apparatus', key: 'line', placement: 'page', numbering: 'book', marker: hebrew ? 'hebrew' : 'arabic' }],
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: hebrew ? 'פרק' : 'Chapter',
            children: [
              {
                type: 'flow',
                html: `<p data-line-numbers>${hebrew ? 'פתיחה של הקטע ' : 'The passage opens with enough text to place '}<span data-lemma data-line-keyed-case="wrapping">${firstLemma}</span> <span data-note="apparatus">${hebrew ? 'הערה ראשונה' : 'First note'}</span> <span data-line-keyed-next>${nextWord}</span><br><span data-lemma data-line-keyed-case="shared-one">${sharedOne}</span><span data-note="apparatus">${hebrew ? 'הערה שנייה' : 'Second note'}</span> <span data-lemma data-line-keyed-case="shared-two">${sharedTwo}</span><span data-note="apparatus">${hebrew ? 'הערה שלישית' : 'Third note'}</span><br><span data-line-keyed-case="no-lemma"></span><span data-note="apparatus">${hebrew ? 'ללא דיבור המתחיל' : 'Without a lemma'}</span><br><span data-line-keyed-space-before>${spaceBefore}</span> <span data-line-keyed-space-after>${spaceAfter}</span></p>`,
              },
            ],
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
  for (const hebrew of [false, true]) {
    const value = bookFromDocument(parseDocument(lineKeyedBookFixture(hebrew), { newId: fixtureIds() }))
    writeFileSync(path.join(site, `book-line-keyed-${hebrew ? 'he' : 'en'}.json`), JSON.stringify(bookView(value)))
  }
  writeFileSync(
    path.join(site, 'book-line-keyed.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Line-keyed apparatus</title><style>html,body{margin:0}body{padding:16px;background:#d9d5cc}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}segnavia-book{display:block;block-size:70vh;background:#fff}</style></head><body><main class="books"><segnavia-book id="book-line-keyed-en" src="book-line-keyed-en.json"></segnavia-book><segnavia-book id="book-line-keyed-he" src="book-line-keyed-he.json"></segnavia-book></main><script type="module" src="segnavia.js"></script></body></html>`,
  )
  for (const hebrew of [false, true]) {
    const value = bookFromDocument(parseDocument(sideNoteBookFixture(hebrew), { newId: fixtureIds() }))
    writeFileSync(path.join(site, `book-side-notes-${hebrew ? 'he' : 'en'}.json`), JSON.stringify(bookView(value)))
  }
  writeFileSync(
    path.join(site, 'book-side-notes.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Side-note books</title><style>html,body{margin:0}body{padding:16px;background:#d9d5cc}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}segnavia-book{display:block;block-size:70vh;background:#fff}</style></head><body><main class="books"><segnavia-book id="book-side-notes-en" src="book-side-notes-en.json"></segnavia-book><segnavia-book id="book-side-notes-he" src="book-side-notes-he.json"></segnavia-book></main><script type="module" src="segnavia.js"></script></body></html>`,
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
  for (const hebrew of [false, true]) {
    let geometry: SideNoteGeometry[] | undefined
    const pdf = await bookPdf(sideNoteBookFixture(hebrew), {
      beforeOutput: async (tab) => {
        geometry = await tab.evaluate(sideNoteGeometry)
      },
    })
    if (!geometry) throw new Error(`The ${hebrew ? 'Hebrew' : 'English'} side-note PDF did not expose its geometry.`)
    const language = hebrew ? 'he' : 'en'
    writeFileSync(path.join(site, `book-side-notes-${language}.pdf`), pdf)
    writeFileSync(path.join(site, `book-side-notes-${language}-pdf-geometry.json`), JSON.stringify(geometry))
    const outline = pdfOutlineItems(await PDFDocument.load(pdf))
    writeFileSync(path.join(site, `book-side-notes-${language}-pdf-outline.json`), JSON.stringify(outline))
  }
}
