import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { type DocumentInput, MM_PER_PT, PAPER_MM, pressBoxes } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { annotationDestinations, pdfOutlineItems } from './book-pdf-readback.ts'
import { compact, pagesText, pageWith } from './book-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const margin = { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 16 }
const parents = { opener: 'section-opener', recto: 'section-recto', verso: 'section-verso' }
const fixtureIds = () => {
  let id = 0
  return () => `section-paper-${++id}`
}

function fixture(hebrew: boolean): DocumentInput {
  const section = (title: string, marker: string, pageGeometry?: string) => ({
    type: 'section' as const,
    title,
    ...(pageGeometry ? { pageGeometry } : {}),
    lang: hebrew ? 'he' : 'en',
    dir: hebrew ? ('rtl' as const) : ('ltr' as const),
    parents,
    children: [
      {
        type: 'flow' as const,
        html: `<p>${marker}_ONE</p>${`<p>${marker} ${'text '.repeat(65)}</p>`.repeat(8)}<p style="break-before:page">${marker}_TWO</p>${`<p>${'more '.repeat(65)}</p>`.repeat(8)}`,
      },
    ],
  })
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: hebrew ? 'נייר לפי פרק' : 'Section paper' },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en', dir: hebrew ? 'rtl' : 'ltr' },
    page: { paper: 'letter', orientation: 'portrait', margin },
    print: { bleed: 3 },
    style: {
      pageGeometries: {
        landscape: { paper: 'letter', orientation: 'landscape', margin, columns: { count: 1, gap: 6 } },
      },
    },
    parentPages: [
      { type: 'parentPage', name: parents.opener, basedOn: 'segnavia:opener', head: '', foot: '<div>FOLIO <span data-motif="segnavia:folio"></span></div>' },
      {
        type: 'parentPage',
        name: parents.recto,
        basedOn: 'segnavia:recto',
        head: '<div>HEAD <span data-motif="segnavia:running-head"></span></div>',
        foot: '<div>FOLIO <span data-motif="segnavia:folio"></span></div>',
      },
      {
        type: 'parentPage',
        name: parents.verso,
        basedOn: 'segnavia:verso',
        head: '<div>HEAD <span data-motif="segnavia:running-head"></span></div>',
        foot: '<div>FOLIO <span data-motif="segnavia:folio"></span></div>',
      },
    ],
    children: [
      { type: 'division', name: 'front', children: [{ type: 'contents', id: 'paper-contents', title: hebrew ? 'תוכן' : 'Contents' }] },
      {
        type: 'division',
        name: 'body',
        children: [
          section(hebrew ? 'ראשון' : 'First', 'FIRST'),
          section(hebrew ? 'שני' : 'Second', 'SECOND', 'landscape'),
          section(hebrew ? 'שלישי' : 'Third', 'THIRD'),
        ],
      },
    ],
  }
}

function close(value: number, expected: number): boolean {
  return Math.abs(value - expected) <= 0.01
}

function bboxWords(file: string) {
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  return [...xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)].map((page) => ({
    width: Number(page[1]),
    height: Number(page[2]),
    words: [...(page[3] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map((word) => ({
      xMin: Number(word[1]),
      yMin: Number(word[2]),
      xMax: Number(word[3]),
      yMax: Number(word[4]),
      text: word[5] ?? '',
    })),
  }))
}

export async function verifyBookSectionPaper(renderer: Renderer, work: string, check: Check): Promise<void> {
  for (const hebrew of [false, true]) {
    const key = hebrew ? 'hebrew' : 'english'
    const input = fixture(hebrew)
    const plan = await renderer.bookPlan(input, { css: 'body{font:14px/20px serif}p{margin:0 0 3mm}', newId: fixtureIds() })
    const bytes = await renderer.bookPdf(input, { plan, effects: false, css: 'body{font:14px/20px serif}p{margin:0 0 3mm}', newId: fixtureIds() })
    const file = path.join(work, `book-section-paper-${key}.pdf`)
    writeFileSync(file, bytes)
    const pdf = await PDFDocument.load(bytes)
    const text = pagesText(file)
    const bboxes = bboxWords(file)
    const pages = pdf.getPages()
    const expected = plan.pages.map((page) =>
      page.pageGeometry === 'landscape' ? { width: PAPER_MM.letter.height, height: PAPER_MM.letter.width } : PAPER_MM.letter,
    )
    const boxesOk = pages.every((page, index) => {
      const trim = expected[index]
      if (!trim) return false
      const press = pressBoxes(trim, { bleed: 3, safe: 0, marks: false })
      const media = page.getMediaBox()
      const trimBox = page.getTrimBox()
      const bleed = page.getBleedBox()
      return (
        close(media.width, press.media.width / MM_PER_PT) &&
        close(media.height, press.media.height / MM_PER_PT) &&
        close(trimBox.width, trim.width / MM_PER_PT) &&
        close(trimBox.height, trim.height / MM_PER_PT) &&
        close(bleed.width, (trim.width + 6) / MM_PER_PT) &&
        close(bleed.height, (trim.height + 6) / MM_PER_PT)
      )
    })
    check(
      `${key} section paper MediaBox, TrimBox and BleedBox match every planned page geometry within 0.01pt`,
      boxesOk && pages.length === plan.pages.length,
      `compared=${pages.length}, planned=${plan.pages.length}, geometries=${plan.pages.map((page) => page.pageGeometry).join(',')}`,
    )
    const markers = ['FIRST_ONE', 'FIRST_TWO', 'SECOND_ONE', 'SECOND_TWO', 'THIRD_ONE', 'THIRD_TWO']
    const markerPages = markers.map((marker) => pageWith(text, marker))
    const foliosOk = markerPages.every((page) => page > 0 && compact(text[page - 1] ?? '').includes(compact(plan.folios[page - 1] ?? '')))
    check(
      `${key} folios continue across portrait-landscape-portrait sections and match the plan`,
      foliosOk && markerPages.every((page, index) => index === 0 || page >= (markerPages[index - 1] ?? 0)),
      `markers=${markerPages.join(',')}, folios=${markerPages.map((page) => plan.folios[page - 1]).join(',')}`,
    )
    const outlines = pdfOutlineItems(pdf)
    const sectionStarts = ['FIRST_ONE', 'SECOND_ONE', 'THIRD_ONE'].map((marker) => pageWith(text, marker))
    const destinations = annotationDestinations(pdf)
    check(
      `${key} contents links and outline destinations land on the three section opening pages`,
      sectionStarts.every((page) => destinations.includes(page)) && sectionStarts.every((page) => outlines.some((outline) => outline.page === page)),
      `starts=${sectionStarts.join(',')}, links=${destinations.join(',')}, outline=${outlines.map((item) => item.page).join(',')}`,
    )
    const furnitureOk = markerPages
      .filter((_, index) => index % 2 === 1)
      .every((pageNumber) => {
        const page = bboxes[pageNumber - 1]
        const planPage = plan.pages[pageNumber - 1]
        if (!page || !planPage) return false
        const trim = expected[pageNumber - 1]
        if (!trim) return false
        const words = page.words.filter((word) => word.text === 'HEAD' || word.text === 'FOLIO')
        const left = 3 / MM_PER_PT + (planPage.side === 'right' ? margin.inlineStart : margin.inlineEnd) / MM_PER_PT
        const right = 3 / MM_PER_PT + trim.width / MM_PER_PT - (planPage.side === 'right' ? margin.inlineEnd : margin.inlineStart) / MM_PER_PT
        return (
          words.length >= 2 &&
          words.every(
            (word) => word.xMin >= left - 1 && word.xMax <= right + 1 && word.yMin >= 3 / MM_PER_PT - 1 && word.yMax <= (trim.height + 3) / MM_PER_PT + 1,
          )
        )
      })
    check(
      `${key} running heads and folios stay inside each page's own text area on physical ${hebrew ? 'RTL' : 'LTR'} sides`,
      furnitureOk,
      `compared-pages=${markerPages.filter((_, index) => index % 2 === 1).join(',')}, sides=${markerPages
        .filter((_, index) => index % 2 === 1)
        .map((page) => plan.pages[page - 1]?.side)
        .join(',')}`,
    )
  }
}
