import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { partBookLabels, partsFixture } from '../demo-book-parts-fixtures.ts'
import { pdfOutlineItems } from './book-pdf-readback.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

export async function verifyPartsOutlines(renderer: Renderer, check: Check): Promise<void> {
  for (const hebrew of [false, true]) {
    const bytes = await renderer.bookPdf(partsFixture(hebrew), { effects: false })
    const document = await PDFDocument.load(bytes)
    const labels = partBookLabels(hebrew)
    const actual = pdfOutlineItems(document).filter((item) =>
      [labels.openingPart, labels.chapterOne, `${labels.topic} 1`, labels.titleOnlyPart, labels.chapterTwo, `${labels.topic} 2`].includes(item.title),
    )
    const expected = [
      { title: labels.openingPart, depth: 0 },
      { title: labels.chapterOne, depth: 1 },
      { title: `${labels.topic} 1`, depth: 2 },
      { title: labels.titleOnlyPart, depth: 0 },
      { title: labels.chapterTwo, depth: 1 },
      { title: `${labels.topic} 2`, depth: 2 },
    ]
    check(
      `${hebrew ? 'hebrew' : 'english'} printed parts outline nests part, chapter and h2`,
      JSON.stringify(actual.map(({ title, depth }) => ({ title, depth }))) === JSON.stringify(expected),
      JSON.stringify(actual),
    )
  }
}
