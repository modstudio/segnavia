import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { AS_OF_DEMO_DATE, AS_OF_DEMO_MOMENT, PAGE_DEMO_PAGES } from '../build-page-demo.ts'

export async function verifyPageAsOfRender(renderer: Renderer, work: string, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  const days: Array<{ date: string }> = []
  const fixture = PAGE_DEMO_PAGES.find(({ id }) => id === 'as-of')?.fixture as DocumentInput
  const pdf = await renderer.pagePdf(fixture, {
    moment: AS_OF_DEMO_MOMENT,
    asOf: { report: (reported) => days.push(...reported) },
  })
  const file = path.join(work, 'as-of.pdf')
  writeFileSync(file, pdf)
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  check(
    'page render binds and reports its deterministic as-of day',
    text.includes(AS_OF_DEMO_DATE) && days[0]?.date === AS_OF_DEMO_DATE,
    `${days[0]?.date} ${text.trim()}`,
  )

  const fixed = structuredClone(fixture) as DocumentInput & { asOf: { kind: 'fixed'; date: string } }
  fixed.asOf = { kind: 'fixed', date: AS_OF_DEMO_DATE }
  const [firstPdf, secondPdf, firstPng, secondPng] = await Promise.all([
    renderer.pagePdf(fixed),
    renderer.pagePdf(fixed),
    renderer.pageImage(fixed, { format: 'png' }),
    renderer.pageImage(fixed, { format: 'png' }),
  ])
  const fixedDocument = await PDFDocument.load(firstPdf, { updateMetadata: false })
  const info = fixedDocument.context.lookup(fixedDocument.context.trailerInfo.Info, PDFDict)
  const creationDate = info.lookup(PDFName.of('CreationDate'), PDFString).decodeText()
  check('fixed as-of renders stamp their date and are byte-identical', creationDate === 'D:20261114' && Buffer.from(firstPdf).equals(secondPdf))
  check(
    'fixed as-of PNG renders stamp their date and are byte-identical',
    pngCreationTime(firstPng) === AS_OF_DEMO_DATE && Buffer.from(firstPng).equals(secondPng),
  )

  const undated = await renderer.pagePdf(fixture)
  const undatedDocument = await PDFDocument.load(undated, { updateMetadata: false })
  const undatedInfo = undatedDocument.context.lookup(undatedDocument.context.trailerInfo.Info, PDFDict)
  check(
    'a current day without a host moment carries no PDF date or producer',
    !undatedInfo.has(PDFName.of('CreationDate')) && !undatedInfo.has(PDFName.of('Producer')),
  )
}

function pngCreationTime(bytes: Uint8Array): string | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8))
    if (type === 'tEXt') {
      const [keyword, value] = new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + length)).split('\0')
      if (keyword === 'Creation Time') return value
    }
    offset += length + 12
  }
  return undefined
}
