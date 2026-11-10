import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { type DocumentInput, MM_PER_PT, PAPER_MM, PX_PER_MM, pressBoxes } from '@segnavia/format'
import type { ResolvePlacement } from '@segnavia/html'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { annotationDestinations, pdfOutlineItems } from './book-pdf-readback.ts'
import { compact, pagesText, pageWith } from './book-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const margin = { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 16 }
const parents = { opener: 'section-opener', recto: 'section-recto', verso: 'section-verso', fixed: 'section-fixed' }
const sectionParentRules = [
  { when: { blank: true as const }, parent: 'segnavia:blank' },
  { when: { position: 'sectionFirst' as const }, parent: parents.opener },
  { when: { face: 'verso' as const }, parent: parents.verso },
  { parent: parents.recto },
]
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
    parentRules: sectionParentRules,
    children: [
      {
        type: 'flow' as const,
        html: `<p>${marker}_ONE</p>${`<p>${marker} ${'text '.repeat(65)}</p>`.repeat(8)}<p style="break-before:page">${marker}_TWO</p>${`<p>${'more '.repeat(65)}</p>`.repeat(8)}`,
      },
    ],
  })
  const designedLandscape = {
    type: 'section' as const,
    title: hebrew ? 'מעוצב' : 'Designed',
    pageGeometry: 'landscape',
    lang: hebrew ? 'he' : 'en',
    dir: hebrew ? ('rtl' as const) : ('ltr' as const),
    parentRules: [{ parent: parents.fixed }],
    children: [
      { type: 'page' as const, body: { html: '<p>DESIGNED_ONE</p><img data-segnavia-media="landscape-asset" alt="landscape asset">' } },
      { type: 'page' as const, body: { html: '<p>DESIGNED_TWO</p>' } },
    ],
  }
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
      {
        type: 'parentPage',
        name: parents.opener,
        basedOn: 'segnavia:opener',
        regions: {
          head: { edge: 'blockStart', html: '' },
          foot: { edge: 'blockEnd', html: '<div>FOLIO <span data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></span></div>' },
        },
      },
      {
        type: 'parentPage',
        name: parents.recto,
        basedOn: 'segnavia:recto',
        regions: {
          head: { edge: 'blockStart', html: '<div>HEAD <span data-motif="segnavia:head-template" data-motif-name="segnavia:running-head"></span></div>' },
          foot: { edge: 'blockEnd', html: '<div>FOLIO <span data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></span></div>' },
        },
      },
      {
        type: 'parentPage',
        name: parents.verso,
        basedOn: 'segnavia:verso',
        regions: {
          head: { edge: 'blockStart', html: '<div>HEAD <span data-motif="segnavia:head-template" data-motif-name="segnavia:running-head"></span></div>' },
          foot: { edge: 'blockEnd', html: '<div>FOLIO <span data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></span></div>' },
        },
      },
      {
        type: 'parentPage',
        name: parents.fixed,
        basedOn: 'segnavia:blank',
        regions: {
          head: { edge: 'blockStart', html: '<div>HEAD <span data-motif="segnavia:head-template" data-motif-name="segnavia:running-head"></span></div>' },
          foot: { edge: 'blockEnd', html: '<div>FOLIO <span data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></span></div>' },
        },
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
          designedLandscape,
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
    const widthsSeen: number[] = []
    const resolvePlacement: ResolvePlacement = async (_placement, context) => {
      if (context.width !== undefined) widthsSeen.push(context.width)
      return {
        kind: 'media' as const,
        media: { format: 'png' as const, size: { width: 1, height: 1 } },
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      }
    }
    const placements = { resolve: resolvePlacement }
    const plan = await renderer.bookPlan(input, { css: 'body{font:14px/20px serif}p{margin:0 0 3mm}', newId: fixtureIds(), placements })
    const bytes = await renderer.bookPdf(input, {
      plan,
      effects: false,
      css: 'body{font:14px/20px serif}p{margin:0 0 3mm}',
      newId: fixtureIds(),
      placements,
    })
    const file = path.join(work, `book-section-paper-${key}.pdf`)
    writeFileSync(file, bytes)
    const pdf = await PDFDocument.load(bytes)
    const text = pagesText(file)
    const bboxes = bboxWords(file)
    const pages = pdf.getPages()
    check(
      `${key} landscape placed asset resolves at its section paper width`,
      widthsSeen.length >= 2 && widthsSeen.every((width) => close(width, 279.4 * PX_PER_MM)),
      `compared-widths=${widthsSeen.join(',')}, expected=${279.4 * PX_PER_MM}px`,
    )
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
    const sectionMarkers = [
      ['FIRST_ONE', 'FIRST_TWO'],
      ['SECOND_ONE', 'SECOND_TWO'],
      ['DESIGNED_ONE', 'DESIGNED_TWO'],
      ['THIRD_ONE', 'THIRD_TWO'],
    ]
    const markers = sectionMarkers.flat()
    const markerPages = markers.map((marker) => pageWith(text, marker))
    const sectionOpeningPages = plan.pages
      .map((page, index) => ({ page, pageNumber: index + 1 }))
      .filter(({ page }) => page.sequence === 'body' && page.sectionOpening && !page.blank)
    const sectionFlows = sectionOpeningPages.map(({ page }) => page.flow)
    const markerFlowsOk = sectionMarkers.every((section, sectionIndex) =>
      section.every((marker) => plan.pages[pageWith(text, marker) - 1]?.flow === sectionFlows[sectionIndex]),
    )
    const foliosOk = markerPages.every((page) => page > 0 && compact(text[page - 1] ?? '').includes(compact(plan.folios[page - 1] ?? '')))
    check(
      `${key} folios continue across all four sections and match the plan`,
      foliosOk &&
        markerFlowsOk &&
        markerPages.every((page, index) => index === 0 || page >= (markerPages[index - 1] ?? 0)) &&
        sectionOpeningPages.length === sectionMarkers.length,
      `compared marker pages=${markerPages.join(',')} to plan flows=${sectionFlows.join(',')} and folios=${markerPages
        .map((page) => plan.folios[page - 1])
        .join(',')}`,
    )
    const outlines = pdfOutlineItems(pdf)
    const sectionStarts = sectionOpeningPages.map(({ pageNumber }) => pageNumber)
    const destinations = annotationDestinations(pdf)
    check(
      `${key} contents links and outline destinations land on all four planned section opening pages`,
      sectionStarts.every((page) => destinations.includes(page)) && sectionStarts.every((page) => outlines.some((outline) => outline.page === page)),
      `compared planned starts=${sectionStarts.join(',')} to links=${destinations.join(',')} and outline=${outlines.map((item) => item.page).join(',')}`,
    )
    const furniturePages = [
      plan.pages.findIndex((page) => page.pageGeometry === undefined && page.face === 'recto' && page.role === 'body') + 1,
      plan.pages.findIndex((page) => page.pageGeometry === 'landscape' && page.face === 'recto' && page.role === 'body') + 1,
      plan.pages.findIndex((page) => page.pageGeometry === 'landscape' && page.face === 'verso' && page.role === 'body') + 1,
    ].filter((page, index, selected) => page > 0 && selected.indexOf(page) === index)
    const furnitureOk =
      furniturePages.length >= 2 &&
      furniturePages.every((pageNumber) => {
        const page = bboxes[pageNumber - 1]
        const planPage = plan.pages[pageNumber - 1]
        if (!page || !planPage) return false
        const trim = expected[pageNumber - 1]
        if (!trim) return false
        const words = page.words.filter((word) => word.text === 'HEAD' || word.text === 'FOLIO')
        const recto = planPage.face === 'recto'
        const expectedSide = recto === hebrew ? 'left' : 'right'
        const left = 3 / MM_PER_PT + (recto ? margin.inlineEnd : margin.inlineStart) / MM_PER_PT
        const right = 3 / MM_PER_PT + trim.width / MM_PER_PT - (recto ? margin.inlineStart : margin.inlineEnd) / MM_PER_PT
        const glyphOverhang = 2
        return (
          planPage.side === expectedSide &&
          words.length >= 2 &&
          words.every(
            (word) =>
              word.xMin >= left - glyphOverhang &&
              word.xMax <= right + glyphOverhang &&
              word.yMin >= 3 / MM_PER_PT - glyphOverhang &&
              word.yMax <= (trim.height + 3) / MM_PER_PT + glyphOverhang,
          )
        )
      })
    check(
      `${key} running heads and folios on flowing landscape, portrait recto and landscape recto pages stay inside each page's own text area`,
      furnitureOk,
      `compared plan pages=${furniturePages.join(',')}, geometries=${furniturePages
        .map((page) => plan.pages[page - 1]?.pageGeometry ?? 'default')
        .join(',')}, physical ${hebrew ? 'RTL' : 'LTR'} sides=${furniturePages.map((page) => plan.pages[page - 1]?.side).join(',')}`,
    )
  }
}
