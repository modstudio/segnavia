import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { MM_PER_PT, PAPER_MM } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'

type Check = (what: string, ok: boolean, detail?: string) => void

const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.01

function markerDistanceFromTop(file: string): number | undefined {
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  const marker = xml.match(/<word\s+[^>]*yMin="([\d.]+)"[^>]*>TOPMARK<\/word>/)
  return marker ? Number(marker[1]) : undefined
}

export async function verifyNamedPaperRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const papers = ['postcard-4x6', 'business-card-eu', 'a4'] as const
  for (const paper of papers) {
    const { width, height } = PAPER_MM[paper]
    const file = path.join(work, `${paper}.pdf`)
    const bytes = await renderer.pagePdf({ html: '<p>Named paper</p>', print: { paper, orientation: 'portrait' } })
    writeFileSync(file, bytes)
    const actual = (await PDFDocument.load(bytes)).getPage(0).getMediaBox()
    check(
      `${paper} prints at its named trim size within 0.01 point`,
      actual.x === 0 && actual.y === 0 && close(actual.width, width / MM_PER_PT) && close(actual.height, height / MM_PER_PT),
      `${actual.x},${actual.y} ${actual.width} x ${actual.height} pt`,
    )
  }

  const sequential = await renderer.pagesPdf([
    { html: '<p>A4</p>', print: { paper: 'a4', orientation: 'portrait' } },
    { html: '<p>Letter</p>', print: { paper: 'letter', orientation: 'portrait' } },
  ])
  const pages = (await PDFDocument.load(sequential)).getPages()
  const expected = [PAPER_MM.a4, PAPER_MM.letter]
  check(
    'sequential pagesPdf keeps each media box at its exact physical size',
    pages.length === expected.length &&
      pages.every((page, index) => {
        const box = page.getMediaBox()
        const size = expected[index]
        return size !== undefined && box.x === 0 && box.y === 0 && close(box.width, size.width / MM_PER_PT) && close(box.height, size.height / MM_PER_PT)
      }),
    pages.map((page) => JSON.stringify(page.getMediaBox())).join(', '),
  )

  const markerHtml = '<div>TOPMARK</div>'
  const margin = { top: 0, right: 0, bottom: 0, left: 0 }
  let raw: Uint8Array<ArrayBufferLike> = new Uint8Array()
  const corrected = await renderer.pagePdf(
    { html: markerHtml, print: { paper: { width: 100, height: 150, unit: 'mm' }, orientation: 'portrait', margin } },
    {
      css: 'html,body{margin:0}body{font:12px/12px sans-serif}',
      beforeOutput: async (tab) => {
        raw = await tab.pdf({
          width: `${100 / 25.4}in`,
          height: `${150 / 25.4}in`,
          printBackground: true,
          preferCSSPageSize: false,
          margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
        })
      },
    },
  )
  const correctedFile = path.join(work, 'custom-top-marker.pdf')
  const rawFile = path.join(work, 'custom-top-marker-raw.pdf')
  writeFileSync(correctedFile, corrected)
  writeFileSync(rawFile, raw)
  const correctedTop = markerDistanceFromTop(correctedFile)
  const rawTop = markerDistanceFromTop(rawFile)
  check(
    'exact custom sizing preserves a top-edge marker position',
    correctedTop !== undefined && rawTop !== undefined && Math.abs(correctedTop - rawTop) <= 0.05,
    `corrected=${correctedTop ?? 'missing'}pt raw=${rawTop ?? 'missing'}pt`,
  )
}
