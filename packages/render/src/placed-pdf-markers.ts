import { pointsToCssPixels } from '@segnavia/format'
import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, type PDFPage, PDFRef, PDFString } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import type { PlacedPdfMeasurement } from './placed-pdf-page.ts'

export const MARKER_LINK_PREFIX = 'https://placed-pdf.invalid/'
const key = (value: string) => PDFName.of(value)

function resolved(document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined {
  return object instanceof PDFRef ? document.context.lookup(object) : object
}

function markerUri(annotation: PDFDict): string | undefined {
  const action = annotation.lookupMaybe(key('A'), PDFDict)
  return action?.lookupMaybe(key('URI'), PDFString, PDFHexString)?.decodeText()
}

function sameObject(document: PDFDocument, left: PDFObject | undefined, right: PDFObject): boolean {
  if (left instanceof PDFRef && right instanceof PDFRef) return left.toString() === right.toString()
  return resolved(document, left) === resolved(document, right)
}

function deleteNumberTreeEntry(document: PDFDocument, nodeObject: PDFObject | undefined, wanted: number): void {
  const node = resolved(document, nodeObject)
  if (!(node instanceof PDFDict)) return
  const numbers = resolved(document, node.get(key('Nums')))
  if (numbers instanceof PDFArray) {
    for (let index = numbers.size() - 2; index >= 0; index -= 2) {
      const number = resolved(document, numbers.get(index))
      if (number instanceof PDFNumber && number.asNumber() === wanted) {
        numbers.remove(index + 1)
        numbers.remove(index)
      }
    }
    if (numbers.size() === 0) node.delete(key('Nums'))
  }
  const kids = resolved(document, node.get(key('Kids')))
  if (kids instanceof PDFArray) for (let index = 0; index < kids.size(); index += 1) deleteNumberTreeEntry(document, kids.get(index), wanted)
}

function pruneKid(document: PDFDocument, object: PDFObject, removed: readonly PDFObject[]): boolean {
  const dictionary = resolved(document, object)
  if (!(dictionary instanceof PDFDict)) return true
  if (dictionary.lookupMaybe(key('Type'), PDFName) === key('OBJR')) {
    const target = dictionary.get(key('Obj'))
    return !removed.some((annotation) => sameObject(document, target, annotation))
  }
  if (dictionary.lookupMaybe(key('Type'), PDFName) !== key('StructElem')) return true
  const childObject = dictionary.get(key('K'))
  if (!childObject) return true
  const children = resolved(document, childObject)
  if (children instanceof PDFArray) {
    for (let index = children.size() - 1; index >= 0; index -= 1) {
      const child = children.get(index)
      if (child && !pruneKid(document, child, removed)) children.remove(index)
    }
    if (children.size() > 0) return true
  } else if (pruneKid(document, childObject, removed)) {
    return true
  }
  dictionary.delete(key('K'))
  return false
}

function removeStructureReferences(document: PDFDocument, annotations: readonly { object: PDFObject; parent?: number }[]): void {
  if (annotations.length === 0) return
  const root = resolved(document, document.catalog.get(key('StructTreeRoot')))
  if (!(root instanceof PDFDict)) return
  for (const annotation of annotations) {
    if (annotation.parent !== undefined) deleteNumberTreeEntry(document, root.get(key('ParentTree')), annotation.parent)
  }
  const rootKid = root.get(key('K'))
  if (!rootKid) return
  const children = resolved(document, rootKid)
  const removed = annotations.map(({ object }) => object)
  if (children instanceof PDFArray) {
    for (let index = children.size() - 1; index >= 0; index -= 1) {
      const child = children.get(index)
      if (child && !pruneKid(document, child, removed)) children.remove(index)
    }
  } else if (!pruneKid(document, rootKid, removed)) {
    root.delete(key('K'))
  }
}

function union(left: PlacedPdfMeasurement['draw'], right: PlacedPdfMeasurement['draw']): PlacedPdfMeasurement['draw'] {
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y,
  }
}

type MarkerBox = Pick<PlacedPdfMeasurement, 'paper' | 'draw' | 'clip'>
type RemovedAnnotation = { object: PDFObject; parent?: number }

function collectPageMarkers(
  document: PDFDocument,
  page: PDFPage,
  paper: number,
  addresses: ReadonlyMap<string, string>,
  found: Map<string, MarkerBox>,
  removed: RemovedAnnotation[],
): void {
  const annotations = page.node.lookupMaybe(key('Annots'), PDFArray)
  if (!annotations) return
  for (let index = annotations.size() - 1; index >= 0; index -= 1) {
    const object = annotations.get(index)
    const annotation = object ? resolved(document, object) : undefined
    if (!(annotation instanceof PDFDict)) continue
    const uri = markerUri(annotation)
    if (!uri?.startsWith(MARKER_LINK_PREFIX) || !object) continue
    const rectangle = annotation.lookupMaybe(key('Rect'), PDFArray)?.asRectangle()
    const parent = annotation.lookupMaybe(key('StructParent'), PDFNumber)?.asNumber()
    removed.push({ object, ...(parent === undefined ? {} : { parent }) })
    annotations.remove(index)
    if (!rectangle) continue
    const id = uri.slice(MARKER_LINK_PREFIX.length)
    const draw = {
      x: pointsToCssPixels(rectangle.x),
      y: pointsToCssPixels(rectangle.y),
      width: pointsToCssPixels(rectangle.width),
      height: pointsToCssPixels(rectangle.height),
    }
    const prior = found.get(id)
    if (prior && prior.paper !== paper) {
      throw new RenderRefusedError(
        `Cannot place PDF at ${addresses.get(id) ?? id}; its placed element was split across pages. Keep the placed element on one page, for example with break-inside: avoid or a smaller height, to clear this refusal.`,
      )
    }
    const combined = prior ? union(prior.draw, draw) : draw
    found.set(id, { paper, draw: combined, clip: combined })
  }
  if (annotations.size() === 0) page.node.delete(key('Annots'))
}

export function markerMeasurements(document: PDFDocument, placements: readonly PlacedPdfMeasurement[]): Map<string, MarkerBox> {
  const found = new Map<string, MarkerBox>()
  const addresses = new Map(placements.flatMap((placement) => (placement.id ? [[placement.id, placement.address] as const] : [])))
  const removed: RemovedAnnotation[] = []
  for (const [paper, page] of document.getPages().entries()) collectPageMarkers(document, page, paper, addresses, found, removed)
  removeStructureReferences(document, removed)
  return found
}
