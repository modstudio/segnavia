import type { PDFDocument, PDFObject, PDFRawStream } from 'pdf-lib'
import { convertSuppliedImage, type ImageState } from './image.ts'
import type { MaskContext } from './visitor.ts'

export interface SuppliedImageUse {
  image: PDFRawStream
  mask: MaskContext
  replace: (object: PDFObject) => void
}

function replaceSourceImage(document: PDFDocument, image: PDFRawStream, uses: SuppliedImageUse[], replacement: PDFRawStream): void {
  const reference = document.context.getObjectRef(image)
  if (reference) document.context.assign(reference, replacement)
  else for (const use of uses) use.replace(replacement)
}

export async function convertImageUses(state: ImageState, image: PDFRawStream, uses: SuppliedImageUse[], generatedEffect = false): Promise<void> {
  const normal = uses.filter((use) => use.mask === 'none')
  const masks = uses.filter((use) => use.mask !== 'none')
  if (normal.length > 0) {
    const replacement = await convertSuppliedImage(state, image, 'none', generatedEffect)
    if (!replacement) return
    replaceSourceImage(state.document, image, normal, replacement)
  }
  if (masks.length === 0) return
  const replacement = await convertSuppliedImage(state, image, masks[0]?.mask ?? 'luminosity', generatedEffect)
  if (!replacement) return
  if (normal.length === 0) replaceSourceImage(state.document, image, masks, replacement)
  else {
    const reference = state.document.context.getObjectRef(replacement) ?? state.document.context.register(replacement)
    for (const use of masks) use.replace(reference)
  }
}
