// Converts the raster images a press rewrite reaches: supplied images, inline
// images in content streams, and the backdrop rasters the effects pass captured.
import { deflateSync } from 'node:zlib'
import { type PDFDocument, PDFName, type PDFObject, type PDFRawStream } from 'pdf-lib'
import type { Profile } from '../color/types.ts'
import { BACKDROP_RASTER_IMAGE_KEY } from '../effects/types.ts'
import { convertedImageCount, createImageState, type JpegDecoder } from './image.ts'
import { convertInlineImages } from './image-inline.ts'
import { DEFAULT_IMAGE_ENCODING, DEFAULT_IMAGE_QUALITY, type PressImageEncoding } from './image-options.ts'
import { convertImageUses, type SuppliedImageUse } from './image-use.ts'
import { type ContentBudget, decodeContent } from './pdf-objects.ts'
import { type MaskContext, walkPressGraph } from './visitor.ts'

const key = (name: string): PDFName => PDFName.of(name)

export async function convertGeneratedRasterImages(document: PDFDocument, profile: Profile, tolerance: number, decodeJpeg?: JpegDecoder): Promise<void> {
  const state = createImageState(document, profile, decodeJpeg, tolerance)
  const uses = new Map<PDFRawStream, SuppliedImageUse[]>()
  walkPressGraph(document, {
    content: () => undefined,
    function: () => undefined,
    group: () => undefined,
    image: (image, mask, replace) => {
      if (!image.dict.has(key(BACKDROP_RASTER_IMAGE_KEY))) return
      uses.set(image, [...(uses.get(image) ?? []), { image, mask, replace }])
    },
    shading: () => false,
  })
  for (const [image, found] of uses) await convertImageUses(state, image, found, true)
}

export function streamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = { Filter: key('Fl' + 'ateDecode') }
  for (const [name, value] of stream.dict.entries()) {
    const label = name.toString().slice(1)
    if (!['Filter', 'DecodeP' + 'arms', 'Length'].includes(label)) dictionary[label] = value
  }
  return dictionary
}

export async function convertSuppliedImages(
  document: PDFDocument,
  profile: Profile,
  tolerance: number,
  decodeJpeg?: JpegDecoder,
  imageEncoding: PressImageEncoding = DEFAULT_IMAGE_ENCODING,
  imageQuality = DEFAULT_IMAGE_QUALITY,
): Promise<number> {
  const state = createImageState(document, profile, decodeJpeg, tolerance, imageEncoding, imageQuality)
  const images: SuppliedImageUse[] = []
  const contents: Array<{ image: PDFRawStream; mask: MaskContext; replace: (object: PDFRawStream) => void }> = []
  walkPressGraph(document, {
    content: (_object, stream, replace, _resources, mask) => contents.push({ image: stream, mask, replace }),
    function: () => undefined,
    group: () => undefined,
    image: (image, mask, replace) => images.push({ image, mask, replace }),
    shading: () => false,
  })
  const uses = new Map<PDFRawStream, SuppliedImageUse[]>()
  for (const found of images) uses.set(found.image, [...(uses.get(found.image) ?? []), found])
  for (const [image, found] of uses) await convertImageUses(state, image, found)
  const contentUses = new Map<PDFRawStream, (typeof contents)[number]>()
  for (const found of contents) if (!contentUses.has(found.image) || found.mask === 'none') contentUses.set(found.image, found)
  const budget: ContentBudget = { decodedBytes: 0 }
  for (const [stream, use] of contentUses) {
    const converted = await convertInlineImages(state, decodeContent(stream, budget), use.mask)
    if (!converted) continue
    const replacement = document.context.stream(deflateSync(converted), streamDictionary(stream))
    const reference = document.context.getObjectRef(stream)
    if (reference) document.context.assign(reference, replacement)
    else use.replace(replacement)
  }
  return convertedImageCount(state)
}
