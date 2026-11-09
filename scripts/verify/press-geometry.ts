import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { readPgm } from './pgm.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.6
const boxText = (box: { x: number; y: number; width: number; height: number }) =>
  `${box.x.toFixed(2)}/${box.y.toFixed(2)}/${box.width.toFixed(2)}/${box.height.toFixed(2)}`

function pressPages(bytes: Uint8Array, trim: { width: number; height: number }) {
  return PDFDocument.load(bytes).then((pdf) => ({
    pages: pdf.getPages(),
    ok: pdf.getPages().every((page) => {
      const actual = page.getTrimBox()
      const bleed = page.getBleedBox()
      return close(actual.width, trim.width) && close(actual.height, trim.height) && close(bleed.x, actual.x - 8.5) && close(bleed.y, actual.y - 8.5)
    }),
  }))
}

export async function verifyDocumentPressGeometry(renderer: Renderer, work: string, check: Check): Promise<void> {
  const print = { bleed: 3, marks: true } as const
  const deck = {
    type: 'document',
    kind: 'deck',
    title: 'Press deck',
    size: { width: 400, height: 200 },
    print,
    children: [1, 2].map((number) => ({
      type: 'slide' as const,
      id: `slide-${number}`,
      content: {
        kind: 'html' as const,
        html: '<html style="background:rgb(120,120,120)"><body style="margin:0"><div style="position:absolute;inset:0;background:rgb(60,60,60)"></div></body></html>',
      },
      notes: `Notes ${number}`,
    })),
  } as const
  const deckBytes = await renderer.deckPdf(deck)
  const deckPdf = await PDFDocument.load(deckBytes)
  const deckPage = deckPdf.getPage(1)
  const deckTrim = deckPage.getTrimBox()
  const deckBleed = deckPage.getBleedBox()
  const deckFile = path.join(work, 'document-press-deck.pdf')
  const deckRaster = path.join(work, 'document-press-deck')
  writeFileSync(deckFile, deckBytes)
  execFileSync('pdftoppm', ['-f', '2', '-l', '2', '-r', '72', '-gray', '-singlefile', deckFile, deckRaster])
  const raster = readPgm(`${deckRaster}.pgm`)
  const trimTop = deckPage.getHeight() - deckTrim.y - deckTrim.height
  const extent = {
    left: deckTrim.x,
    top: trimTop,
    width: deckTrim.width,
    height: deckTrim.height,
  }
  const grayAt = (x: number, y: number) => raster.pixels[Math.round(y) * raster.width + Math.round(x)]
  const fillSamples = [
    grayAt(extent.left + 2, extent.top + 2),
    grayAt(extent.left + extent.width - 2, extent.top + 2),
    grayAt(extent.left + 2, extent.top + extent.height - 2),
    grayAt(extent.left + extent.width - 2, extent.top + extent.height - 2),
    grayAt(extent.left + extent.width / 2, extent.top + extent.height / 2),
  ]
  check(
    'a deck Document print writes page 2 press boxes and fills its trim',
    close(deckPage.getWidth(), 351) &&
      close(deckPage.getHeight(), 201) &&
      close(deckTrim.x, 25.5) &&
      close(deckTrim.y, 25.5) &&
      close(deckTrim.width, 300) &&
      close(deckTrim.height, 150) &&
      close(extent.left, 25.5) &&
      close(extent.top, 25.5) &&
      close(extent.width, 300) &&
      close(extent.height, 150) &&
      fillSamples.every((value) => value !== undefined && value >= 55 && value <= 65),
    `media=${deckPage.getWidth().toFixed(1)}x${deckPage.getHeight().toFixed(1)}pt, trim=${boxText(deckTrim)}, bleed=${boxText(deckBleed)}, fill=${extent.left.toFixed(2)}/${extent.top.toFixed(2)}/${extent.width.toFixed(2)}/${extent.height.toFixed(2)}pt samples=${fillSamples.join('/')}`,
  )

  const notes = await pressPages(await renderer.deckPdf(deck, { layout: 'notes' }), { width: 612, height: 792 })
  check(
    'deck notes sheets take TrimBox and BleedBox from the deck print',
    notes.ok && notes.pages.length === 2,
    notes.pages.map((page) => `${boxText(page.getTrimBox())};${boxText(page.getBleedBox())}`).join(', '),
  )

  const margin = { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 }
  const book: DocumentInput = {
    type: 'document',
    kind: 'book',
    title: 'Press book',
    mode: 'continuous',
    page: { paper: 'a5', margin },
    print,
    children: [{ type: 'flow', title: 'Chapter', html: '<h1>Press book</h1><p>One composed page.</p>' }],
  }
  const bookPages = await pressPages(await renderer.bookPdf(book), { width: 419.53, height: 595.28 })
  check(
    'every book page uses page.paper as TrimBox with a 3mm BleedBox',
    bookPages.ok && bookPages.pages.length > 0,
    bookPages.pages.map((page) => `${boxText(page.getTrimBox())};${boxText(page.getBleedBox())}`).join(', '),
  )

  const printed: DocumentInput = {
    type: 'document',
    kind: 'printed',
    print: { paper: 'letter', ...print },
    parentPages: [{ type: 'parentPage', name: 'body', geometry: { margin } }],
    parentRules: [{ parent: 'body' }],
    children: [{ type: 'page', body: { html: '<h1>Printed page</h1><p>One composed page.</p>' } }],
  }
  const printedPages = await pressPages(await renderer.pagePdf(printed), { width: 612, height: 792 })
  check(
    'every printed composed page has its paper TrimBox and a 3mm BleedBox',
    printedPages.ok && printedPages.pages.length > 0,
    printedPages.pages.map((page) => `${boxText(page.getTrimBox())};${boxText(page.getBleedBox())}`).join(', '),
  )
}
