import { expect, test } from 'bun:test'
import { PLACED_PDF_SOURCES } from '@segnavia/html'
import { degrees, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, type PDFRef, PDFString, StandardFonts } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { markerMeasurements } from './placed-pdf-markers.ts'
import { drawPlacedPdfPages, placedPdfCrop } from './placed-pdf-page.ts'

const key = (value: string) => PDFName.of(value)

test('converts physical crop insets independently of document direction', () => {
  const box = { x: 10, y: 20, width: 200, height: 100 }
  expect(placedPdfCrop(box, '10% 20px 30% 40px', 'source')).toEqual({ x: 40, y: 50, width: 155, height: 60 })
})

test('refuses a crop that leaves no displayed page area', () => {
  expect(() => placedPdfCrop({ x: 0, y: 0, width: 100, height: 100 }, '0 80px', 'assets/source.pdf')).toThrow(RenderRefusedError)
  expect(() => placedPdfCrop({ x: 0, y: 0, width: 100, height: 100 }, '0 80px', 'assets/source.pdf')).toThrow(
    'Cannot place PDF at assets/source.pdf; its crop leaves no area of the page. Use a smaller crop to clear this refusal.',
  )
})

test('draws a bounded source page once as an artifact Form XObject', async () => {
  const source = await PDFDocument.create()
  const first = source.addPage([200, 100])
  first.drawText('placed-vector', { x: 20, y: 40, font: await source.embedFont(StandardFonts.Helvetica) })
  source.addPage([300, 400]).drawText('other-page')
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const output = await drawPlacedPdfPages(
    await target.save(),
    [
      {
        address: 'source',
        page: 1,
        paper: 0,
        draw: { x: 96, y: 192, width: 192, height: 96 },
        clip: { x: 100, y: 196, width: 180, height: 88 },
      },
    ],
    {
      placements: {
        resolve: async () => undefined,
        [PLACED_PDF_SOURCES]: new Map([
          [
            'source',
            {
              bytes: await source.save(),
              media: {
                format: 'pdf',
                size: { width: 200, height: 100 },
                pages: [{ boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }],
              },
            },
          ],
        ]),
      },
    },
  )
  expect(await pageContent(output)).toMatch(/\/Artifact BMC[\s\S]*75 147 135 66 re[\s\S]*\/EmbeddedPdfPage/)
  const text = new TextDecoder().decode(output)
  expect(text).toContain('/Subtype /Form')
  expect(text).not.toContain('/Subtype /Image')
  expect(text).not.toContain('other-page')
})

async function transformedPageOutput(rotate: 0 | 90, userUnit: number): Promise<string> {
  const source = await PDFDocument.create()
  const page = source.addPage([200, 100])
  page.setRotation(degrees(rotate))
  page.node.set(PDFName.of('UserUnit'), PDFNumber.of(userUnit))
  page.drawText('transformed')
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const output = await drawPlacedPdfPages(
    await target.save(),
    [{ address: 'source', page: 1, paper: 0, draw: { x: 96, y: 192, width: 192, height: 96 }, clip: { x: 96, y: 192, width: 192, height: 96 } }],
    {
      placements: {
        resolve: async () => undefined,
        [PLACED_PDF_SOURCES]: new Map([
          [
            'source',
            {
              bytes: await source.save(),
              media: {
                format: 'pdf',
                size: { width: 200, height: 100 },
                pages: [{ rotate, userUnit: userUnit > 0 ? userUnit : 1, boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }],
              },
            },
          ],
        ]),
      },
    },
  )
  return pageContent(output)
}

test('maps a UserUnit 2 displayed page exactly into the marker rectangle', async () => {
  expect(await transformedPageOutput(0, 2)).toMatch(/72 144 144 72 re[\s\S]*1 0 0 1 72 144 cm[\s\S]*0\.36 0 0 0\.36 0 0 cm/)
})

test('treats a nonpositive source UserUnit as the PDF default', async () => {
  expect(await transformedPageOutput(0, 0)).toMatch(/72 144 144 72 re[\s\S]*1 0 0 1 72 144 cm[\s\S]*0\.72 0 0 0\.72 0 0 cm/)
})

test('maps a rotated non-square page exactly into the marker rectangle', async () => {
  expect(await transformedPageOutput(90, 1)).toMatch(/72 144 144 72 re[\s\S]*1 0 0 1 72 144 cm[\s\S]*1\.44 0 0 0\.36 0 0 cm/)
})

test('uses and removes Chromium marker annotations for fragmented page placement', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 100]).drawText('placed')
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const second = target.addPage([600, 800])
  second.node.set(
    PDFName.of('Annots'),
    target.context.obj([
      { Type: 'Annot', Subtype: 'Link', Rect: [72, 144, 216, 216], A: { S: 'URI', URI: PDFString.of('https://placed-pdf.invalid/marker') } },
    ]),
  )
  const output = await drawPlacedPdfPages(
    await target.save(),
    [
      {
        id: 'marker',
        anchorOffset: { x: 20, y: 10 },
        address: 'source',
        page: 1,
        paper: 0,
        draw: { x: 0, y: 0, width: 192, height: 96 },
        clip: { x: 0, y: 0, width: 192, height: 96 },
      },
    ],
    {
      placements: {
        resolve: async () => undefined,
        [PLACED_PDF_SOURCES]: new Map([
          [
            'source',
            {
              bytes: await source.save(),
              media: { format: 'pdf', size: { width: 200, height: 100 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }] },
            },
          ],
        ]),
      },
    },
  )
  const loaded = await PDFDocument.load(output)
  expect(loaded.getPage(0).node.Annots()).toBeUndefined()
  expect(loaded.getPage(1).node.Annots()?.size() ?? 0).toBe(0)
  expect(await pageContent(output, 0)).not.toContain('/EmbeddedPdfPage')
  expect(await pageContent(output, 1)).toMatch(/87 151\.5 144 72 re[\s\S]*1 0 0 1 87 151\.5 cm[\s\S]*\/EmbeddedPdfPage/)
})

test('leaves a transparent marker when the selected source page has no contents', async () => {
  const source = await PDFDocument.create()
  source.addPage([200, 100])
  const target = await PDFDocument.create()
  target.addPage([600, 800])
  const output = await drawPlacedPdfPages(
    await target.save(),
    [{ address: 'blank', page: 1, paper: 0, draw: { x: 96, y: 192, width: 192, height: 96 }, clip: { x: 96, y: 192, width: 192, height: 96 } }],
    {
      placements: {
        resolve: async () => undefined,
        [PLACED_PDF_SOURCES]: new Map([
          [
            'blank',
            {
              bytes: await source.save(),
              media: { format: 'pdf', size: { width: 200, height: 100 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 200, height: 100 } } }] },
            },
          ],
        ]),
      },
    },
  )
  expect(await pageContent(output)).not.toContain('/EmbeddedPdfPage')
})

function markerAnnotation(document: PDFDocument, id: string, rectangle: number[], structParent?: number): PDFRef {
  return document.context.register(
    document.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rectangle,
      A: { S: 'URI', URI: PDFString.of(`https://placed-pdf.invalid/${id}`) },
      ...(structParent === undefined ? {} : { StructParent: structParent }),
    }),
  )
}

test('unions every Chromium link rectangle for one marker regardless of annotation order', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([600, 800])
  page.node.set(
    key('Annots'),
    document.context.obj([markerAnnotation(document, 'marker', [60, 140, 160, 180]), markerAnnotation(document, 'marker', [40, 140, 400, 180])]),
  )
  const measurements = markerMeasurements(document, [
    { id: 'marker', address: 'placed', page: 1, paper: 0, draw: { x: 0, y: 0, width: 120, height: 60 }, clip: { x: 0, y: 0, width: 120, height: 60 } },
  ])
  const measured = measurements.get('marker')
  expect(measured?.paper).toBe(0)
  for (const box of [measured?.draw, measured?.clip]) {
    expect(box?.x).toBeCloseTo(160 / 3)
    expect(box?.y).toBeCloseTo(560 / 3)
    expect(box?.width).toBeCloseTo(480)
    expect(box?.height).toBeCloseTo(160 / 3)
  }
})

test('refuses a marker whose link rectangles are split across pages and names its placement', async () => {
  const document = await PDFDocument.create()
  for (let index = 0; index < 2; index += 1) {
    document.addPage([600, 800]).node.set(key('Annots'), document.context.obj([markerAnnotation(document, 'marker', [40, 140, 160, 180])]))
  }
  const work = () =>
    markerMeasurements(document, [
      {
        id: 'marker',
        address: 'assets/chapter.pdf',
        page: 1,
        paper: 0,
        draw: { x: 0, y: 0, width: 120, height: 60 },
        clip: { x: 0, y: 0, width: 120, height: 60 },
      },
    ])
  try {
    work()
    throw new Error('Expected marker measurement to refuse')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect((error as Error).message).toBe(
      'Cannot place PDF at assets/chapter.pdf; its placed element was split across pages. Keep the placed element on one page, for example with break-inside: avoid or a smaller height, to clear this refusal.',
    )
  }
})

test('removes marker OBJRs, empty structure elements, and annotation ParentTree entries', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([600, 800])
  const realAnnotation = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 20, 20], StructParent: 1 }))
  const marker = markerAnnotation(document, 'marker', [40, 140, 160, 180], 2)
  page.node.set(key('Annots'), document.context.obj([realAnnotation, marker]))
  const root = document.context.obj({ Type: 'StructTreeRoot' })
  const rootReference = document.context.register(root)
  const structureElements = [realAnnotation, marker].map((annotation) => {
    const objectReference = document.context.register(document.context.obj({ Type: 'OBJR', Pg: page.ref, Obj: annotation }))
    const element = document.context.obj({ Type: 'StructElem', S: 'Link', P: rootReference, K: [objectReference] })
    return document.context.register(element)
  })
  root.set(key('K'), document.context.obj(structureElements))
  root.set(key('ParentTree'), document.context.obj({ Nums: [1, structureElements[0], 2, structureElements[1]] }))
  document.catalog.set(key('StructTreeRoot'), rootReference)

  markerMeasurements(document, [
    { id: 'marker', address: 'placed', page: 1, paper: 0, draw: { x: 0, y: 0, width: 120, height: 60 }, clip: { x: 0, y: 0, width: 120, height: 60 } },
  ])

  const annotations = page.node.lookup(key('Annots'), PDFArray)
  expect(annotations.size()).toBe(1)
  expect(annotations.get(0)).toEqual(realAnnotation)
  const rootKids = root.lookup(key('K'), PDFArray)
  expect(rootKids.size()).toBe(1)
  expect(rootKids.get(0)).toEqual(structureElements[0] as PDFRef)
  const parentNumbers = root.lookup(key('ParentTree'), PDFDict).lookup(key('Nums'), PDFArray)
  expect(parentNumbers.asArray().map(String)).toEqual(['1', (structureElements[0] as PDFRef).toString()])
})
