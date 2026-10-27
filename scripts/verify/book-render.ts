import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { type BookInput, formatNumber, MM_PER_PT, PAPER_MM } from '@segnavia/format'
import type { OverflowReport, Renderer } from '@segnavia/render'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib'

type Check = (what: string, ok: boolean, detail?: string) => void

interface Fixture {
  key: 'english' | 'hebrew'
  book: BookInput
  css: string
  contentsTitle: string
  frontTitle: string
  frontMarker: string
  chapterMarkers: string[]
  runningHeads: string[]
  endnotesTitle: string
}

interface BboxWord {
  text: string
  xMin: number
  xMax: number
  yMin: number
}

interface BboxPage {
  width: number
  height: number
  words: BboxWord[]
}

const topics = (key: string, chapter: number) =>
  `<div class="topics">${Array.from({ length: 6 }, (_, index) => `<h2>${key}-${chapter}-H2-${index}</h2><h3>${key}-${chapter}-H3-${index}</h3>`).join('')}<h2 data-contents="exclude">EXCLUDED-${key}-${chapter}</h2></div>`

function fixture(key: 'english' | 'hebrew'): Fixture {
  const hebrew = key === 'hebrew'
  const tag = hebrew ? 'HE' : 'EN'
  const chapterMarkers = [`OPEN${tag}1`, `OPEN${tag}2`, `OPEN${tag}3`]
  const runningHeads = hebrew ? ['ראשון', 'שני', 'שלישי'] : ['RUNEN1', 'RUNEN2', 'RUNEN3']
  const chapters = [
    {
      title: hebrew ? 'פרק ראשון' : 'Chapter One',
      runningHead: runningHeads[0],
      html: `<p>${chapterMarkers[0]}<span data-note="footnote">FOOT-${tag}</span></p><p class="margin-probe"><span>MARGIN-L-${tag}-1</span><span>MARGIN-R-${tag}-1</span></p>${topics(tag, 1)}<div class="second-page">SECOND${tag}1<p class="margin-probe"><span>MARGIN-L-${tag}-2</span><span>MARGIN-R-${tag}-2</span></p></div>`,
    },
    { title: hebrew ? 'פרק שני' : 'Chapter Two', runningHead: runningHeads[1], html: `<p>${chapterMarkers[1]}</p>${topics(tag, 2)}` },
    {
      title: hebrew ? 'פרק שלישי' : 'Chapter Three',
      runningHead: runningHeads[2],
      html: `<p>${chapterMarkers[2]}<span data-note="endnote">END-${tag}</span></p>${topics(tag, 3)}`,
    },
  ]
  return {
    key,
    book: {
      title: hebrew ? 'ספר בדיקה' : 'Test Book',
      mode: 'continuous',
      lang: hebrew ? 'he' : 'en',
      page: { paper: 'a5', orientation: 'portrait', margin: { top: 15, bottom: 15, inner: 20, outer: 12 } },
      rectoOpenings: true,
      frontMatter: [
        { title: hebrew ? 'פתיחה' : 'Front', html: `<p>FRONT${tag}</p>` },
        { kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' },
      ],
      chapters,
    },
    css: ':where(body){font:12px serif}:where(.topics h2,.topics h3){font-size:1px;line-height:1px;margin:0}:where(.second-page){break-before:page}:where(.margin-probe){display:flex;justify-content:space-between;direction:ltr}:where(.segnavia-contents-entry){line-height:8mm}',
    contentsTitle: hebrew ? 'תוכן' : 'Contents',
    frontTitle: hebrew ? 'פתיחה' : 'Front',
    frontMarker: `FRONT${tag}`,
    chapterMarkers,
    runningHeads,
    endnotesTitle: hebrew ? 'הערות' : 'Notes',
  }
}

function pagesText(file: string): string[] {
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).split('\f').slice(0, -1)
}

function decodeXml(value: string): string {
  return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
}

function bboxPages(file: string): BboxPage[] {
  const xml = execFileSync('pdftotext', ['-bbox-layout', file, '-'], { encoding: 'utf8' })
  return [...xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)].map((page) => ({
    width: Number(page[1]),
    height: Number(page[2]),
    words: [...(page[3] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"[^>]*>([\s\S]*?)<\/word>/g)].map((word) => ({
      xMin: Number(word[1]),
      yMin: Number(word[2]),
      xMax: Number(word[3]),
      text: decodeXml(word[4] ?? ''),
    })),
  }))
}

function pageWith(pages: string[], value: string): number {
  return pages.findIndex((page) => page.includes(value)) + 1
}

function frontPageCount(fixture: Fixture, pages: string[]): number {
  const tag = fixture.key === 'hebrew' ? 'HE' : 'EN'
  const lastContentsPage = pageWith(pages, `${tag}-3-H2-5`)
  return lastContentsPage % 2 === 1 ? lastContentsPage + 1 : lastContentsPage
}

function annotationDestination(document: PDFDocument, value: unknown): number | undefined {
  const key = (value: string) => PDFName.of(value)
  const resolve = (value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)
  const annotation = resolve(value)
  if (!(annotation instanceof PDFDict)) return undefined
  const action = resolve(annotation.get(key('A')))
  if (action instanceof PDFDict) {
    const uri = resolve(action.get(key('URI')))
    const text = uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : ''
    if (text.startsWith('segnavia:')) return -1
  }
  const target = resolve(annotation.get(key('Dest')))
  if (!(target instanceof PDFArray)) return undefined
  const reference = target.get(0)
  return document.getPages().findIndex((candidate) => candidate.ref.toString() === reference?.toString()) + 1
}

function destinations(document: PDFDocument): number[] {
  const resolve = (value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)
  const output: number[] = []
  for (const page of document.getPages()) {
    const annotations = resolve(page.node.get(PDFName.of('Annots')))
    if (!(annotations instanceof PDFArray)) continue
    for (let index = 0; index < annotations.size(); index += 1) {
      const target = annotationDestination(document, annotations.get(index))
      if (target !== undefined) output.push(target)
    }
  }
  return output
}

function contentsNumbers(
  fixture: Fixture,
  text: string,
  chapterPages: number[],
  frontPages: number,
  frontSystem: 'arabic' | 'roman-lower',
  bodySystem: 'arabic' | 'hebrew',
): boolean {
  const compact = (value: string) => value.replaceAll(/[\s\u202a-\u202e\u2066-\u2069]/g, '')
  const lines = text.split('\n').map(compact)
  const entries = [
    { text: fixture.frontTitle, number: formatNumber(1, frontSystem) },
    ...chapterPages.flatMap((page, index) => [
      { text: fixture.book.chapters[index]?.title ?? '', number: formatNumber(page - frontPages, bodySystem) },
      ...Array.from({ length: 6 }, (_, topic) => ({
        text: `${fixture.key === 'hebrew' ? 'HE' : 'EN'}-${index + 1}-H2-${topic}`,
        number: formatNumber(page - frontPages, bodySystem),
      })),
    ]),
  ]
  return entries.every((entry) => {
    const printed = compact(entry.text)
    return lines.some((line) => line.includes(printed) && (line.endsWith(entry.number) || line.startsWith(entry.number)))
  })
}

function expectedLinkPages(fixture: Fixture, pages: string[], frontPages: number): number[] {
  const chapterPages = fixture.chapterMarkers.map((marker) => pageWith(pages, marker))
  const endnotes = pageWith(pages, fixture.endnotesTitle)
  const headings = [pageWith(pages, fixture.frontMarker), ...chapterPages.flatMap((page) => Array.from({ length: 7 }, () => page))]
  const footnote = chapterPages[0] ?? 0
  const endnote = chapterPages[2] ?? 0
  return [...headings, footnote, footnote, endnotes, endnote].sort((left, right) => left - right).map((page) => page || frontPages)
}

function pageMap(fixture: Fixture, pages: string[], bboxes: BboxPage[], frontPages: number) {
  const openings = fixture.chapterMarkers.map((marker) => pageWith(pages, marker))
  const endnotes = pageWith(pages, fixture.endnotesTitle)
  return pages.map((text, index) => {
    const page = index + 1
    const blank = text.trim() === ''
    const bottom = (bboxes[index]?.words ?? [])
      .filter((word) => word.yMin > (bboxes[index]?.height ?? 0) - 50)
      .map((word) => word.text)
      .join(' ')
    const top = (bboxes[index]?.words ?? [])
      .filter((word) => word.yMin < 35)
      .map((word) => word.text)
      .join(' ')
    let kind = page <= frontPages ? (page < pageWith(pages, fixture.contentsTitle) ? 'front' : 'contents') : 'chapter'
    if (page === endnotes || page > endnotes) kind = 'endnotes'
    if (blank) kind = 'blank'
    return {
      page,
      kind,
      folio: bottom,
      runningHead: top,
      opening: openings.includes(page) || page === endnotes || page === 1 || page === pageWith(pages, fixture.contentsTitle),
    }
  })
}

function bodyTextMargins(fixture: Fixture, bboxes: BboxPage[], frontPages: number) {
  const tag = fixture.key === 'hebrew' ? 'HE' : 'EN'
  return [1, 2].map((bodyPage) => {
    const page = bboxes[frontPages + bodyPage - 1]
    const left = page?.words.find((word) => word.text === `MARGIN-L-${tag}-${bodyPage}`)
    const right = page?.words.find((word) => word.text === `MARGIN-R-${tag}-${bodyPage}`)
    return {
      bodyPage,
      left: (left?.xMin ?? Number.NaN) * MM_PER_PT,
      right: ((page?.width ?? Number.NaN) - (right?.xMax ?? Number.NaN)) * MM_PER_PT,
    }
  })
}

async function verifyFixture(renderer: Renderer, work: string, fixture: Fixture, check: Check): Promise<void> {
  const bytes = await renderer.bookPdf(fixture.book, { css: fixture.css, effects: false })
  const file = path.join(work, `book-${fixture.key}.pdf`)
  writeFileSync(file, bytes)
  const document = await PDFDocument.load(bytes)
  const pages = pagesText(file)
  const bboxes = bboxPages(file)
  const chapterPages = fixture.chapterMarkers.map((marker) => pageWith(pages, marker))
  const frontPages = frontPageCount(fixture, pages)
  const map = pageMap(fixture, pages, bboxes, frontPages)
  console.log(`BOOK MAP [${fixture.key}] ${JSON.stringify(map.map(({ opening: _, ...page }) => page))}`)
  const textMargins = bodyTextMargins(fixture, bboxes, frontPages)
  console.log(`BOOK TEXT MARGINS [${fixture.key}] ${JSON.stringify(textMargins)}`)

  check(
    `${fixture.key} book page count is its front plus body pages`,
    pages.length === document.getPageCount() && frontPages > 0,
    `front=${frontPages}, body=${pages.length - frontPages}, total=${pages.length}`,
  )
  const bodyStarts = [...chapterPages, pageWith(pages, fixture.endnotesTitle)].map((page) => page - frontPages)
  check(
    `${fixture.key} chapters and endnotes start on odd body pages`,
    bodyStarts.every((page) => page > 0 && page % 2 === 1),
    bodyStarts.join(', '),
  )
  const blanks = map.filter((page) => page.kind === 'blank')
  check(
    `${fixture.key} inserted blank pages contain no text`,
    blanks.length >= 2 && blanks.every((page) => pages[page.page - 1]?.trim() === ''),
    blanks.map((page) => page.page).join(', '),
  )

  const runningOk = map.every((page) => (page.kind === 'blank' || page.opening ? page.runningHead === '' : page.runningHead !== ''))
  check(`${fixture.key} running heads appear only on non-opening, nonblank pages`, runningOk && map.some((page) => page.runningHead !== ''))
  const frontSystem = fixture.key === 'english' ? 'roman-lower' : 'arabic'
  const bodySystem = fixture.key === 'english' ? 'arabic' : 'hebrew'
  const foliosOk = map.every((page) => {
    if (page.kind === 'blank') return page.folio === ''
    const local = page.page <= frontPages ? page.page : page.page - frontPages
    return page.folio === formatNumber(local, page.page <= frontPages ? frontSystem : bodySystem)
  })
  check(`${fixture.key} folios use the front and body numbering systems`, foliosOk, map.map((page) => `${page.page}:${page.folio}`).join(', '))

  const numbered = contentsNumbers(fixture, pages.slice(0, frontPages).join('\n'), chapterPages, frontPages, frontSystem, bodySystem)
  check(`${fixture.key} contents page numbers match heading destination pages`, numbered)
  const actualLinks = destinations(document).sort((left, right) => left - right)
  const expectedLinks = expectedLinkPages(fixture, pages, frontPages)
  check(
    `${fixture.key} contents and note links resolve to their target pages`,
    JSON.stringify(actualLinks) === JSON.stringify(expectedLinks),
    `actual=${actualLinks.join(',')} expected=${expectedLinks.join(',')}`,
  )

  const positionsOk = map.every((page, index) => {
    if (page.kind === 'blank') return true
    const folio = (bboxes[index]?.words ?? []).find((word) => word.yMin > (bboxes[index]?.height ?? 0) - 50)
    if (!folio) return false
    const shouldBeLeft = fixture.key === 'hebrew' ? page.page % 2 === 1 : page.page % 2 === 0
    return shouldBeLeft ? folio.xMax < (bboxes[index]?.width ?? 0) / 2 : folio.xMin > (bboxes[index]?.width ?? 0) / 2
  })
  check(`${fixture.key} folios sit at the physical outer edge`, positionsOk)
  const expectedMargins =
    fixture.key === 'hebrew'
      ? [
          [14, 22],
          [22, 14],
        ]
      : [
          [22, 14],
          [14, 22],
        ]
  const marginsOk = textMargins.every(
    (margin, index) => Math.abs(margin.left - (expectedMargins[index]?.[0] ?? 0)) < 1.5 && Math.abs(margin.right - (expectedMargins[index]?.[1] ?? 0)) < 1.5,
  )
  check(
    `${fixture.key} first two body pages put the inner text margin on the recto and verso spine edges`,
    marginsOk,
    textMargins.map((margin) => `${margin.bodyPage}:${margin.left.toFixed(2)}mm/${margin.right.toFixed(2)}mm`).join(', '),
  )
}

async function verifyPaginatedContentsLinks(renderer: Renderer, work: string, check: Check): Promise<void> {
  for (const key of ['english', 'hebrew'] as const) {
    const hebrew = key === 'hebrew'
    const one = hebrew ? 'פרק א' : 'Chapter One'
    const two = hebrew ? 'פרק ב' : 'Chapter Two'
    const openOne = hebrew ? 'OPEN_HE1' : 'OPEN_EN1'
    const openTwo = hebrew ? 'OPEN_HE2' : 'OPEN_EN2'
    const bytes = await renderer.bookPdf(
      {
        title: hebrew ? 'ספר' : 'Book',
        mode: 'paginated',
        lang: hebrew ? 'he' : 'en',
        page: { paper: 'a5', margin: { top: 16, bottom: 16, inner: 18, outer: 12 } },
        frontMatter: [{ kind: 'contents', title: hebrew ? 'תוכן' : 'Contents' }],
        chapters: [
          { title: one, html: `<p>${openOne}</p><p>${'text '.repeat(40)}</p>` },
          { title: two, html: `<p>${openTwo}</p><p>${'text '.repeat(40)}</p>` },
        ],
      },
      { effects: false, css: 'body{font:16px serif}' },
    )
    const file = path.join(work, `book-paginated-${key}.pdf`)
    writeFileSync(file, bytes)
    const chapterPages = [pageWith(pagesText(file), openOne), pageWith(pagesText(file), openTwo)]
    const links = destinations(await PDFDocument.load(bytes)).sort((left, right) => left - right)
    const expected = [...chapterPages].sort((left, right) => left - right)
    check(
      `${key} paginated contents links resolve to each chapter's first page`,
      chapterPages.every((page) => page > 0) && JSON.stringify(links) === JSON.stringify(expected),
      `chapters=${chapterPages.join(',')} links=${links.join(',')}`,
    )
  }
}

export async function verifyBookRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  await verifyFixture(renderer, work, fixture('english'), check)
  await verifyFixture(renderer, work, fixture('hebrew'), check)
  await verifyPaginatedContentsLinks(renderer, work, check)

  const chapterHtml = `<p>BOOK_FLOW_MARKER ${'book text '.repeat(1200)}</p>`
  const book = {
    title: 'Overflowing book',
    mode: 'continuous' as const,
    page: { paper: 'a5' as const, orientation: 'portrait' as const, margin: { top: 15, bottom: 15, inner: 20, outer: 12 } },
    chapters: [{ title: 'Wide chapter', html: chapterHtml }],
  }
  const baseline = await renderer.bookPdf(book, { effects: false, css: 'body{margin:0;font:16px/24px serif}' })
  let report: OverflowReport | undefined
  const overflow = await renderer.bookPdf(
    { ...book, chapters: [{ title: 'Wide chapter', html: `<table style="position:absolute;width:1677px"><tr><td></td></tr></table>${chapterHtml}` }] },
    { effects: false, css: 'body{margin:0;font:16px/24px serif}', overflow: { report: (value) => (report = value) } },
  )
  const baselineFile = path.join(work, 'book-overflow-baseline.pdf')
  const overflowFile = path.join(work, 'book-overflow.pdf')
  writeFileSync(baselineFile, baseline)
  writeFileSync(overflowFile, overflow)
  const facts = (file: string) => {
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
    const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
    const marker = xml.match(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"[^>]*>BOOK_FLOW_MARKER<\/word>/)
    return {
      pages: Number(info.match(/Pages:\s+(\d+)/)?.[1]),
      x: Number(marker?.[1]),
      y: Number(marker?.[2]),
      width: Number(marker?.[3]) - Number(marker?.[1]),
    }
  }
  const baselineFacts = facts(baselineFile)
  const overflowFacts = facts(overflowFile)
  const bookPages = (await PDFDocument.load(baseline)).getPages()
  const a5 = PAPER_MM.a5
  check(
    'every continuous book page has an origin-zero A5 media box within 0.01 point',
    bookPages.every((page) => {
      const box = page.getMediaBox()
      return box.x === 0 && box.y === 0 && Math.abs(box.width - a5.width / MM_PER_PT) <= 0.01 && Math.abs(box.height - a5.height / MM_PER_PT) <= 0.01
    }),
    JSON.stringify(bookPages[0]?.getMediaBox()),
  )
  const body = report?.entries.find((entry) => entry.part === 'body')
  check(
    'a book chapter with a too-wide table keeps text and page count at true size and reports only kept prints in output order',
    Math.abs(baselineFacts.x - overflowFacts.x) <= 1 &&
      Math.abs(baselineFacts.y - overflowFacts.y) <= 1 &&
      Math.abs(baselineFacts.width - overflowFacts.width) <= 1 &&
      baselineFacts.pages === overflowFacts.pages &&
      report?.entries.map((entry) => entry.part).join(',') === 'body,margin' &&
      body !== undefined &&
      Math.abs(body.clippedEnd - (1677 - body.pageWidth)) <= 1,
    `marker=${overflowFacts.x},${overflowFacts.y}/${baselineFacts.x},${baselineFacts.y}, pages=${overflowFacts.pages}/${baselineFacts.pages}, parts=${report?.entries.map((entry) => entry.part)}, clipped=${body?.clippedEnd}`,
  )
}
