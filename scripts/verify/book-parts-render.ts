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
    const [first, second] = hebrew ? ['א', 'ב'] : ['I', 'II']
    const [chapterFirst, chapterSecond] = hebrew ? ['א', 'ב'] : ['1', '2']
    const expected = [
      { title: `${first} ${labels.openingPart}`, depth: 0 },
      { title: `${chapterFirst} ${labels.chapterOne}`, depth: 1 },
      { title: `${labels.topic} 1`, depth: 2 },
      { title: `${second} ${labels.titleOnlyPart}`, depth: 0 },
      { title: `${chapterSecond} ${labels.chapterTwo}`, depth: 1 },
      { title: `${labels.topic} 2`, depth: 2 },
    ]
    const titles = expected.map(({ title }) => title)
    const actual = pdfOutlineItems(document).filter((item) => titles.includes(item.title))
    check(
      `${hebrew ? 'hebrew' : 'english'} printed parts outline nests numbered part, numbered chapter and h2`,
      JSON.stringify(actual.map(({ title, depth }) => ({ title, depth }))) === JSON.stringify(expected),
      JSON.stringify(actual),
    )
  }
}
