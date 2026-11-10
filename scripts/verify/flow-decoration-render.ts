import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { readPgm } from './pgm.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const DPI = 150
const MARGIN_MM = 18
const BOX = 'border:4pt solid #000;padding:12pt;background:#ccc;margin:0'
const LINES = 'The first line of the boxed paragraph.<br>The second line of the boxed paragraph.<br>The third line of the boxed paragraph.'
const PLAIN = '<p style="margin:0">An unstyled paragraph outside the box.</p>'

function printed(html: string): DocumentInput {
  return {
    type: 'document',
    kind: 'printed',
    settings: { lang: 'en' },
    style: { css: 'body{font:12pt serif}' },
    print: { paper: 'letter' },
    parentPages: [
      {
        type: 'parentPage',
        name: 'body',
        geometry: { margin: { blockStart: MARGIN_MM, blockEnd: MARGIN_MM, inlineStart: MARGIN_MM, inlineEnd: MARGIN_MM } },
      },
    ],
    parentRules: [{ parent: 'body' }],
    children: [{ type: 'page', body: { html } }],
  }
}

function book(html: string): DocumentInput {
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Flow decoration render check' },
    mode: 'paginated',
    page: { paper: 'letter', margin: { blockStart: MARGIN_MM, blockEnd: MARGIN_MM, inlineStart: MARGIN_MM, inlineEnd: MARGIN_MM } },
    settings: { lang: 'en' },
    style: { css: 'body{font:12pt serif}' },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [{ type: 'section', title: 'Chapter', children: [{ type: 'flow', html }] }],
      },
    ],
  }
}

interface PagePaint {
  bands: Array<{ start: number; end: number }>
  firstGray: number | undefined
  lastGray: number | undefined
  leftSideRows: number
  rightSideRows: number
}

function pagePaint(file: string): PagePaint {
  const { width, height, pixels } = readPgm(file)
  const at = (x: number, y: number) => pixels[y * width + x] ?? 255
  let boxLeft = width
  let boxRight = -1
  let widest = 0
  for (let y = 0; y < height; y += 1) {
    let left = width
    let right = -1
    let gray = 0
    for (let x = 0; x < width; x += 1) {
      const value = at(x, y)
      if (value >= 180 && value <= 225) {
        gray += 1
        left = Math.min(left, x)
        right = Math.max(right, x)
      }
    }
    if (gray > widest) {
      widest = gray
      boxLeft = left
      boxRight = right
    }
  }
  if (boxRight < boxLeft) return { bands: [], firstGray: undefined, lastGray: undefined, leftSideRows: 0, rightSideRows: 0 }
  const span = boxRight - boxLeft + 1
  const borderRows: number[] = []
  const grayRows: number[] = []
  for (let y = 0; y < height; y += 1) {
    let dark = 0
    let gray = 0
    for (let x = boxLeft; x <= boxRight; x += 1) {
      const value = at(x, y)
      if (value < 80) dark += 1
      if (value >= 180 && value <= 225) gray += 1
    }
    if (dark / span > 0.9) borderRows.push(y)
    if (gray / span > 0.5) grayRows.push(y)
  }
  const bands: Array<{ start: number; end: number }> = []
  for (const row of borderRows) {
    const band = bands.at(-1)
    if (band && row === band.end + 1) band.end = row
    else bands.push({ start: row, end: row })
  }
  let leftSideRows = 0
  let rightSideRows = 0
  for (let y = 0; y < height; y += 1) {
    if (at(boxLeft, y) < 80) leftSideRows += 1
    if (at(boxRight, y) < 80) rightSideRows += 1
  }
  return { bands, firstGray: grayRows[0], lastGray: grayRows.at(-1), leftSideRows, rightSideRows }
}

function hasTop(paint: PagePaint): boolean {
  return paint.firstGray !== undefined && paint.bands.some((band) => band.end < paint.firstGray! && band.end - band.start >= 5)
}

function hasBottom(paint: PagePaint): boolean {
  return paint.lastGray !== undefined && paint.bands.some((band) => band.start > paint.lastGray! && band.end - band.start >= 5)
}

function detail(pages: PagePaint[]): string {
  return pages
    .map(
      (page, index) =>
        `p${index + 1}: bands=${page.bands.map((band) => `${band.start}-${band.end}`).join(',') || 'none'} gray=${page.firstGray ?? 'none'}-${page.lastGray ?? 'none'} sides=${page.leftSideRows}/${page.rightSideRows}`,
    )
    .join('; ')
}

async function render(renderer: Renderer, work: string, stem: string, input: DocumentInput, kind: 'page' | 'book'): Promise<PagePaint[]> {
  const bytes = kind === 'book' ? await renderer.bookPdf(input, { effects: false }) : await renderer.pagePdf(input, { effects: false })
  const pdf = path.join(work, `${stem}.pdf`)
  const raster = path.join(work, stem)
  writeFileSync(pdf, bytes)
  execFileSync('pdftoppm', ['-r', String(DPI), '-gray', pdf, raster])
  const count = Number(execFileSync('pdfinfo', [pdf], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1] ?? 0)
  return Array.from({ length: count }, (_, index) => pagePaint(`${raster}-${index + 1}.pgm`))
}

export async function verifyFlowDecorationRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const first = await render(renderer, work, 'decoration-first', printed(`<p style="${BOX}">${LINES}</p>${PLAIN}`), 'page')
  check('a first flowing block keeps its top border and padding', hasTop(first[0]!), detail(first))

  const last = await render(renderer, work, 'decoration-last', printed(`${PLAIN}<p style="${BOX}">${LINES}</p>`), 'page')
  check('a last flowing block keeps its bottom border and padding', hasBottom(last.at(-1)!), detail(last))

  const chapter = await render(renderer, work, 'decoration-book', book(`<p style="${BOX}">${LINES}</p>${PLAIN}`), 'book')
  check('a paginated chapter keeps its first box top border and padding', hasTop(chapter[0]!), detail(chapter))

  const before = await render(renderer, work, 'decoration-before', printed(`${PLAIN}<p style="break-before:page;${BOX}">${LINES}</p>`), 'page')
  check('a break before a bordered box keeps the whole top band on the following page', before.length === 2 && hasTop(before[1]!) && !hasTop(before[0]!), detail(before))

  const tallLines = Array.from({ length: 60 }, (_, index) => `Box line ${index + 1}`).join('<br>')
  const sliced = await render(renderer, work, 'decoration-sliced', printed(`<p style="${BOX}">${tallLines}</p>`), 'page')
  const slicedOk =
    sliced.length === 2 &&
    hasTop(sliced[0]!) &&
    !hasBottom(sliced[0]!) &&
    !hasTop(sliced[1]!) &&
    hasBottom(sliced[1]!) &&
    sliced.every((page) => page.leftSideRows > 20 && page.rightSideRows > 20)
  check('a box split between pages is sliced with side borders on both pages', slicedOk, detail(sliced))

  const nested = await render(renderer, work, 'decoration-nested', printed(`<section><aside style="${BOX}">${LINES}</aside></section>`), 'page')
  check('a nested bordered aside keeps both border bands', hasTop(nested[0]!) && hasBottom(nested[0]!), detail(nested))

  const table = await render(
    renderer,
    work,
    'decoration-table',
    printed(`<table style="${BOX};border-collapse:separate;width:100%"><tbody><tr><td>${LINES}</td></tr></tbody></table>`),
    'page',
  )
  check('a first flowing table keeps its own top border band', hasTop(table[0]!), detail(table))
}
