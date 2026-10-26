import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { MM_PER_PT, PAPER_MM } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'

type Check = (what: string, ok: boolean, detail?: string) => void

const close = (actual: number, expected: number) => Math.abs(actual - expected) <= 0.01

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
}
