import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput, Media } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, StandardFonts } from 'pdf-lib'
import { screenPage } from '../screen-document.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const marker = '<img data-segnavia-media="placed" style="display:block;width:120px;height:60px;margin-left:20px">'

async function sourcePdf(): Promise<{ bytes: Uint8Array; media: Media }> {
  const document = await PDFDocument.create()
  const page = document.addPage([200, 100])
  page.drawText('PLACED_VECTOR', { x: 20, y: 40, size: 18, font: await document.embedFont(StandardFonts.Helvetica) })
  page.node.set(
    PDFName.of('Annots'),
    document.context.obj([{ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 80, 30], A: { S: 'URI', URI: PDFString.of('https://source.invalid/link') } }]),
  )
  document.catalog.set(PDFName.of('OpenAction'), document.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("source")') }))
  return {
    bytes: await document.save(),
    media: { format: 'pdf', size: { width: 200, height: 100 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }] },
  }
}

function placedFormName(document: PDFDocument, page: number): string | undefined {
  const xobjects = document.getPage(page).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)
  if (!xobjects) return undefined
  return xobjects
    .entries()
    .find(([, value]) => {
      const form = document.context.lookup(value)
      const box = form instanceof PDFRawStream ? form.dict.lookupMaybe(PDFName.of('BBox'), PDFArray)?.asRectangle() : undefined
      return box?.width === 200 && box.height === 100
    })?.[0]
    .asString()
}

function placedPages(document: PDFDocument): number[] {
  return document.getPages().flatMap((_page, index) => (placedFormName(document, index) ? [index] : []))
}

function unsafeActions(document: PDFDocument): boolean {
  if (document.catalog.has(PDFName.of('OpenAction'))) return true
  return document.getPages().some((page) => {
    const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annotations) return false
    return annotations.asArray().some((value) => {
      const annotation = document.context.lookup(value, PDFDict)
      const action = annotation.lookupMaybe(PDFName.of('A'), PDFDict)
      return action?.lookupMaybe(PDFName.of('URI'), PDFString)?.decodeText() === 'https://source.invalid/link'
    })
  })
}

function annotationUris(document: PDFDocument): string[] {
  return document.getPages().flatMap((page) => {
    const annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annotations) return []
    return annotations.asArray().flatMap((value) => {
      const annotation = document.context.lookup(value, PDFDict)
      const uri = annotation.lookupMaybe(PDFName.of('A'), PDFDict)?.lookupMaybe(PDFName.of('URI'), PDFString)?.decodeText()
      return uri ? [uri] : []
    })
  })
}

function extractedText(work: string, name: string, bytes: Uint8Array): { text: string; x: number } {
  const file = path.join(work, name)
  writeFileSync(file, bytes)
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  const boxes = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  const x = Number(/<word xMin="([\d.]+)"[^>]*>PLACED_VECTOR<\/word>/.exec(boxes)?.[1])
  return { text, x }
}

export async function verifyPlacedPdfRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const source = await sourcePdf()
  const options = () => ({
    effects: false as const,
    placements: {
      resolve: async () => ({ kind: 'media' as const, media: source.media, src: 'data:image/png;base64,AA==', bytes: source.bytes }),
    },
  })
  const print = { paper: 'a5' as const, orientation: 'portrait' as const, margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } }
  const pageBytes = await renderer.pagePdf(screenPage({ html: `<p>PAGE</p>${marker}` }, { print }), options())
  const pagesBytes = await renderer.pagesPdf(
    [screenPage({ html: '<p>FIRST</p>' }, { print }), screenPage({ html: `<p>SECOND</p>${marker}` }, { print })],
    options(),
  )
  const book: DocumentInput = {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Placed PDF proof' },
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          { type: 'section', title: 'Proof', children: [{ type: 'flow', html: `<p>BOOK FIRST</p><div style="break-before:page">BOOK SECOND${marker}</div>` }] },
        ],
      },
    ],
  }
  const bookBytes = await renderer.bookPdf(book, options())
  const outputs = [
    { name: 'pagePdf', bytes: pageBytes, expected: 0 },
    { name: 'pagesPdf', bytes: pagesBytes, expected: 1 },
    { name: 'bookPdf', bytes: bookBytes, expected: 1 },
  ]
  for (const output of outputs) {
    const document = await PDFDocument.load(output.bytes)
    const pages = placedPages(document)
    const extracted = extractedText(work, `placed-${output.name}.pdf`, output.bytes)
    const page = pages[0] ?? -1
    check(
      `${output.name} places a PDF form on the fragmented output page at its margin offset`,
      pages.length === 1 && page >= output.expected && extracted.x > 50,
      `pages=${pages.join(',')} x=${extracted.x} uris=${annotationUris(document).join(',')}`,
    )
    check(
      `${output.name} keeps placed PDF text but not source actions`,
      extracted.text.includes('PLACED_VECTOR') && !unsafeActions(document),
      extracted.text.trim(),
    )
  }
}
