import type { MediaPage, PageBoxName } from '@segnavia/format'
import { PDFArray, PDFName, PDFNumber, type PDFObject, type PDFPage } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'

export interface SourcePdfPageFacts {
  rotate: 0 | 90 | 180 | 270
  userUnit: number
}

type Bounds = MediaPage['boxes'][PageBoxName]

/** Each box's dictionary key, and whether a page inherits it from its parent Pages node (PDF 1.7, Table 30). */
const PAGE_BOX_KEYS: Record<PageBoxName, { key: string; inheritable: boolean }> = {
  media: { key: 'MediaBox', inheritable: true },
  crop: { key: 'CropBox', inheritable: true },
  bleed: { key: 'BleedBox', inheritable: false },
  trim: { key: 'TrimBox', inheritable: false },
  art: { key: 'ArtBox', inheritable: false },
}

/** Reads display facts from a received PDF page, applying PDF defaults. */
export function sourcePdfPageFacts(page: PDFPage): SourcePdfPageFacts {
  const angle = ((page.getRotation().angle % 360) + 360) % 360
  const rotate = (angle === 90 || angle === 180 || angle === 270 ? angle : 0) as SourcePdfPageFacts['rotate']
  const candidate = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber()
  const userUnit = candidate !== undefined && Number.isFinite(candidate) && candidate > 0 ? candidate : 1
  return { rotate, userUnit }
}

/** A rectangle from any two opposite corners, or undefined unless the array is four finite numbers enclosing an area. */
function rectangle(page: PDFPage, value: PDFObject | undefined): Bounds | undefined {
  const array = value === undefined ? undefined : page.doc.context.lookup(value)
  if (!(array instanceof PDFArray) || array.size() !== 4) return undefined
  const numbers = array.asArray().map((item) => {
    const entry = page.doc.context.lookup(item)
    return entry instanceof PDFNumber ? entry.asNumber() : undefined
  })
  if (!numbers.every((item): item is number => item !== undefined && Number.isFinite(item))) return undefined
  const [x1, y1, x2, y2] = numbers as [number, number, number, number]
  const bounds = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
  return bounds.width > 0 && bounds.height > 0 ? bounds : undefined
}

/** The box as the page declares it, following inheritance where the box is inheritable; undefined when absent or malformed. */
function declaredBox(page: PDFPage, box: PageBoxName): Bounds | undefined {
  const { key, inheritable } = PAGE_BOX_KEYS[box]
  const name = PDFName.of(key)
  return rectangle(page, inheritable ? page.node.getInheritableAttribute(name) : page.node.get(name))
}

/**
 * Reads a received page as the format's MediaPage: only the boxes it declares, so format's placedPdfPage applies the
 * same selection and fallback to it as to stored media.
 */
export function sourcePdfMediaPage(page: PDFPage, number: number): MediaPage {
  const declared = (Object.keys(PAGE_BOX_KEYS) as PageBoxName[]).flatMap((box) => {
    const bounds = declaredBox(page, box)
    return bounds ? [[box, bounds] as const] : []
  })
  const boxes = Object.fromEntries(declared) as Partial<MediaPage['boxes']>
  if (!boxes.media) {
    throw new RenderRefusedError(
      `The received PDF's page ${number} has no usable MediaBox of four numbers; supply a PDF whose pages declare one to clear this refusal.`,
    )
  }
  return { boxes: boxes as MediaPage['boxes'], ...sourcePdfPageFacts(page) }
}
