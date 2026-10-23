import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { BACKDROP_RASTER_IMAGE_KEY } from './types.ts'

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 3, 1, 2, 3, 0xff, 0xd9])

export function taggedRaster(document: PDFDocument) {
  const imageStream = document.context.stream(jpeg, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1,
    Height: 1,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'DCTDecode',
  })
  imageStream.dict.set(PDFName.of(BACKDROP_RASTER_IMAGE_KEY), document.context.obj(true))
  return document.context.register(imageStream)
}

export function blendText(document: PDFDocument) {
  return document.context.register(
    document.context.stream('1 .91 .36 rg BT /F 12 Tf 0 0 Td (A) Tj ET', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: {},
    }),
  )
}

export const glassGroup = { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true } as const

export async function capturedBlendDocument(
  glassContent = 'q 0 0 10 10 re W n 3 0 0 3 0 0 cm /Raster Do Q q /Blend gs /Text Do Q',
): Promise<{ contents: PDFRawStream; document: PDFDocument; glass: PDFRawStream; text: PDFRawStream }> {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream(glassContent, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Raster: image, Text: text } },
    }),
  )
  const contentsRef = document.context.register(document.context.stream('1 0 0 rg 0 0 10 10 re f /Glass Do'))
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), contentsRef)
  const glassStream = document.context.lookup(glass)
  const textStream = document.context.lookup(text)
  const contents = document.context.lookup(contentsRef)
  if (!(glassStream instanceof PDFRawStream) || !(textStream instanceof PDFRawStream) || !(contents instanceof PDFRawStream)) {
    throw new Error('Expected form streams')
  }
  return { contents, document, glass: glassStream, text: textStream }
}

export async function capturedBlendPdf(): Promise<Uint8Array> {
  return (await capturedBlendDocument()).document.save()
}

export async function nestedFrostDocument(frostContent: string): Promise<PDFDocument> {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const frost = document.context.register(
    document.context.stream(frostContent, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { XObject: { Raster: image } },
    }),
  )
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 0 0 m 10 0 l 10 10 l 0 10 l h W n /Frost Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Frost: frost, Text: text } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  return document
}
