import { deflateSync } from 'node:zlib'
import { type PDFDict, type PDFDocument, PDFHexString, type PDFRawStream, type PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { type ContentBudget, MAX_CONTENT_BYTES, MAX_DOCUMENT_CONTENT_BYTES, numberOf } from '../press/pdf-objects.ts'
import { GENERATED_EFFECT_IMAGE_KEY } from './types.ts'

export type PaintColor = { space: 'DeviceCMYK' | 'DeviceGray' | 'DeviceRGB'; values: number[] }
export interface Rule1Plan {
  bbox: number[]
  image: PDFRawStream
  mask: PDFDict
  opacity: number
}

function chargePixels(budget: ContentBudget, bytes: number): void {
  if (bytes > MAX_CONTENT_BYTES)
    throw new RenderRefusedError(`The PDF has unsupported effect image longer than ${MAX_CONTENT_BYTES} bytes; supported: at most ${MAX_CONTENT_BYTES} bytes.`)
  budget.decodedBytes += bytes
  if (budget.decodedBytes > MAX_DOCUMENT_CONTENT_BYTES)
    throw new RenderRefusedError(
      `The PDF has unsupported total decoded content length ${budget.decodedBytes}; supported: at most ${MAX_DOCUMENT_CONTENT_BYTES} bytes.`,
    )
}

export function rule1EffectImage(document: PDFDocument, budget: ContentBudget, plan: Rule1Plan, color: PaintColor): PDFRef {
  const width = numberOf(plan.image.dict, 'Width')
  const height = numberOf(plan.image.dict, 'Height')
  if (!width || !height) throw new RenderRefusedError('The PDF has unsupported grayscale mask image dimensions; supported: positive Width and Height numbers.')
  const palette = color.values.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255))
  const length = Math.ceil(width / 8) * height
  chargePixels(budget, length)
  const bytes = new Uint8Array(length)
  const softMask = document.context.getObjectRef(plan.image) ?? plan.image
  return document.context.register(
    document.context.stream(deflateSync(bytes), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: ['Indexed', color.space, 0, PDFHexString.of(Buffer.from(palette).toString('hex'))],
      BitsPerComponent: 1,
      Filter: 'Fl' + 'ateDecode',
      SMask: softMask,
      [GENERATED_EFFECT_IMAGE_KEY]: true,
      SegnaviaEffectColor: color.values,
    }),
  )
}
