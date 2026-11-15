import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput, Media } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject, PDFRawStream, PDFRef, PDFString, StandardFonts } from 'pdf-lib'
import { screenPage } from '../screen-document.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const marker = (marginLeft: number, options: { naturalSize?: boolean; crop?: string } = {}) =>
  `<img data-segnavia-media="placed" data-segnavia-page="2"${options.crop ? ` data-segnavia-crop="${options.crop}"` : ''} style="display:block;${options.naturalSize ? '' : 'width:120px;height:60px;'}margin-left:${marginLeft}px">`

async function sourcePdf(): Promise<{ bytes: Uint8Array; media: Media }> {
  const document = await PDFDocument.create()
  document.addPage([120, 80]).drawText('SOURCE_FIRST_PAGE')
  const page = document.addPage([200, 100])
  page.drawText('PLACED_VECTOR', { x: 20, y: 40, size: 18, font: await document.embedFont(StandardFonts.Helvetica) })
  page.node.set(
    PDFName.of('Annots'),
    document.context.obj([{ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 80, 30], A: { S: 'URI', URI: PDFString.of('https://source.invalid/link') } }]),
  )
  document.catalog.set(PDFName.of('OpenAction'), document.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("source")') }))
  return {
    bytes: await document.save(),
    media: {
      format: 'pdf',
      size: { width: 200, height: 100 },
      pages: [{ boxes: { media: { x: 0, y: 0, width: 120, height: 80 } } }, { boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }],
    },
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

function resolved(document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined {
  return object instanceof PDFRef ? document.context.lookup(object) : object
}

function annotationStructure(document: PDFDocument): { annotations: Set<string>; objectReferences: Set<string>; realLink?: string } {
  const annotations = new Set<string>()
  let realLink: string | undefined
  for (const page of document.getPages()) {
    const pageAnnotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    for (const object of pageAnnotations?.asArray() ?? []) {
      if (!(object instanceof PDFRef)) continue
      const annotation = resolved(document, object)
      if (!(annotation instanceof PDFDict)) continue
      const reference = object.toString()
      annotations.add(reference)
      const uri = annotation.lookupMaybe(PDFName.of('A'), PDFDict)?.lookupMaybe(PDFName.of('URI'), PDFString)?.decodeText()
      if (uri === 'https://author.invalid/real') realLink = reference
    }
  }
  const objectReferences = new Set<string>()
  const visit = (object: PDFObject | undefined): void => {
    const value = resolved(document, object)
    if (value instanceof PDFArray) {
      for (const child of value.asArray()) visit(child)
      return
    }
    if (!(value instanceof PDFDict)) return
    if (value.lookupMaybe(PDFName.of('Type'), PDFName) === PDFName.of('OBJR')) {
      const target = value.get(PDFName.of('Obj'))
      if (target instanceof PDFRef) objectReferences.add(target.toString())
      return
    }
    visit(value.get(PDFName.of('K')))
  }
  const root = document.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict)
  visit(root?.get(PDFName.of('K')))
  return { annotations, objectReferences, ...(realLink ? { realLink } : {}) }
}

function extractedText(work: string, name: string, bytes: Uint8Array): { text: string; x: number; y: number } {
  const file = path.join(work, name)
  writeFileSync(file, bytes)
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  const boxes = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  const match = /<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>PLACED_VECTOR<\/word>/.exec(boxes)
  return { text, x: Number(match?.[1]), y: Number(match?.[2]) }
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
  const pageBytes = await renderer.pagePdf(screenPage({ html: `<p>PAGE</p>${marker(12)}` }, { print }), options())
  const pagesBytes = await renderer.pagesPdf(
    [screenPage({ html: '<p>FIRST</p>' }, { print }), screenPage({ html: `<p>SECOND</p>${marker(20, { naturalSize: true })}` }, { print })],
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
          {
            type: 'section',
            title: 'Proof',
            children: [
              {
                type: 'flow',
                html: `<p>BOOK FIRST <a href="https://author.invalid/real">AUTHOR LINK</a></p><div style="break-before:page">BOOK SECOND${marker(28, { crop: '0 0 0 20px' })}</div>`,
              },
            ],
          },
        ],
      },
    ],
  }
  const bookBytes = await renderer.bookPdf(book, options())
  const sourceText = { x: 20, yFromTop: 47.076 }
  const outputs = [
    { name: 'pagePdf', bytes: pageBytes, expectedPage: 0, contentLeft: 48, markerLeft: 12 * 0.75, markerTop: 79.5, cropLeft: 0, scaleX: 0.45, scaleY: 0.45 },
    { name: 'pagesPdf', bytes: pagesBytes, expectedPage: 1, contentLeft: 48, markerLeft: 20 * 0.75, markerTop: 79.5, cropLeft: 0, scaleX: 1, scaleY: 1 },
    {
      name: 'bookPdf',
      bytes: bookBytes,
      expectedPage: 1,
      contentLeft: 48.75,
      markerLeft: 28 * 0.75,
      markerTop: 56.25,
      cropLeft: 15,
      scaleX: 90 / 185,
      scaleY: 0.45,
    },
  ]
  for (const output of outputs) {
    const document = await PDFDocument.load(output.bytes)
    const pages = placedPages(document)
    const extracted = extractedText(work, `placed-${output.name}.pdf`, output.bytes)
    const page = pages[0] ?? -1
    const expectedX = output.contentLeft + output.markerLeft + (sourceText.x - output.cropLeft) * output.scaleX
    const expectedY = output.markerTop + sourceText.yFromTop * output.scaleY
    check(
      `${output.name} places a PDF form on the fragmented output page at its margin offset`,
      pages.length === 1 && page === output.expectedPage && Math.abs(extracted.x - expectedX) <= 0.5 && Math.abs(extracted.y - expectedY) <= 0.5,
      `pages=${pages.join(',')} x=${extracted.x}/${expectedX} y=${extracted.y}/${expectedY} uris=${annotationUris(document).join(',')}`,
    )
    check(
      `${output.name} keeps placed PDF text but not source actions`,
      extracted.text.includes('PLACED_VECTOR') && !unsafeActions(document),
      extracted.text.trim(),
    )
    if (output.name === 'bookPdf') {
      const structure = annotationStructure(document)
      check(
        'bookPdf structure OBJRs target retained annotations and keep the author link',
        [...structure.objectReferences].every((reference) => structure.annotations.has(reference)) &&
          structure.realLink !== undefined &&
          structure.objectReferences.has(structure.realLink),
        `annotations=${[...structure.annotations].join(',')} objrs=${[...structure.objectReferences].join(',')} real=${structure.realLink ?? 'missing'}`,
      )
    }
  }
}
