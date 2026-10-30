import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, PDFRef, PDFString } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'

export interface BookDestination {
  page: number
  x: number
  y: number
}

interface DestinationPart {
  pages: number
  destinations: Map<string, BookDestination>
}

export function joinedDestinations(front: DestinationPart, body: Pick<DestinationPart, 'destinations'>): Map<string, BookDestination> {
  const joined = new Map(front.destinations)
  for (const [id, target] of body.destinations) joined.set(id, { ...target, page: target.page + front.pages })
  return joined
}

const key = (value: string) => PDFName.of(value)
const resolve = (document: PDFDocument, value: PDFObject | undefined): PDFObject | undefined =>
  value instanceof PDFRef ? document.context.lookup(value) : value

function decode(value: PDFObject | undefined): string | undefined {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText()
  if (value instanceof PDFName) return value.toString().slice(1)
  return undefined
}

function destination(document: PDFDocument, value: PDFObject | undefined): BookDestination | undefined {
  let found = resolve(document, value)
  if (found instanceof PDFDict) found = resolve(document, found.get(key('D')))
  if (!(found instanceof PDFArray)) return undefined
  const reference = found.get(0)
  if (!(reference instanceof PDFRef)) return undefined
  const page = document.getPages().findIndex((candidate) => candidate.ref.toString() === reference.toString())
  if (page < 0) return undefined
  const x = resolve(document, found.get(2))
  const y = resolve(document, found.get(3))
  return {
    page: page + 1,
    x: x instanceof PDFNumber ? x.asNumber() : 0,
    y: y instanceof PDFNumber ? y.asNumber() : document.getPage(page).getHeight(),
  }
}

function nameTree(document: PDFDocument, value: PDFObject | undefined, output: Map<string, BookDestination>): void {
  const dictionary = resolve(document, value)
  if (!(dictionary instanceof PDFDict)) return
  const names = resolve(document, dictionary.get(key('Names')))
  if (names instanceof PDFArray) {
    for (let index = 0; index + 1 < names.size(); index += 2) {
      const name = decode(resolve(document, names.get(index)))
      const target = destination(document, names.get(index + 1))
      if (name && target) output.set(name, target)
    }
  }
  const kids = resolve(document, dictionary.get(key('Kids')))
  if (kids instanceof PDFArray) for (let index = 0; index < kids.size(); index += 1) nameTree(document, kids.get(index), output)
}

export function namedDestinations(document: PDFDocument): Map<string, BookDestination> {
  const output = new Map<string, BookDestination>()
  const names = resolve(document, document.catalog.get(key('Names')))
  if (names instanceof PDFDict) nameTree(document, names.get(key('Dests')), output)
  const direct = resolve(document, document.catalog.get(key('Dests')))
  if (direct instanceof PDFDict) {
    for (const [name, value] of direct.entries()) {
      const target = destination(document, value)
      if (target) output.set(name.toString().slice(1), target)
    }
  }
  return output
}

function hiddenAnnotation(document: PDFDocument, annotation: PDFDict): boolean {
  const rectangle = resolve(document, annotation.get(key('Rect')))
  if (!(rectangle instanceof PDFArray) || rectangle.size() !== 4) return false
  const values = Array.from({ length: 4 }, (_, index) => resolve(document, rectangle.get(index)))
  if (!values.every((value) => value instanceof PDFNumber)) return false
  const [left = 0, bottom = 0, right = 0, top = 0] = values.map((value) => (value as PDFNumber).asNumber())
  return Math.abs(right - left) <= 1 && Math.abs(top - bottom) <= 1
}

export function explicit(document: PDFDocument, target: BookDestination, offset: number): PDFArray {
  return document.context.obj([document.getPage(offset + target.page - 1).ref, 'XYZ', target.x, target.y, null])
}

function customTarget(uri: string | undefined): string | undefined {
  if (!uri?.startsWith('segnavia:target/')) return undefined
  try {
    return decodeURIComponent(uri.slice('segnavia:target/'.length))
  } catch {
    return uri.slice('segnavia:target/'.length)
  }
}

export function rewriteBookLinks(document: PDFDocument, frontPages: number, front: Map<string, BookDestination>, body: Map<string, BookDestination>): void {
  for (const [pageIndex, page] of document.getPages().entries()) {
    const annotations = resolve(document, page.node.get(key('Annots')))
    if (!(annotations instanceof PDFArray)) continue
    const kept = Array.from({ length: annotations.size() }, (_, index) => annotations.get(index)).filter((object) =>
      rewriteAnnotation(document, object, pageIndex, frontPages, front, body),
    )
    if (kept.length > 0) page.node.set(key('Annots'), document.context.obj(kept))
    else page.node.delete(key('Annots'))
  }
}

function rewriteAnnotation(
  document: PDFDocument,
  object: PDFObject,
  pageIndex: number,
  frontPages: number,
  front: Map<string, BookDestination>,
  body: Map<string, BookDestination>,
): boolean {
  const annotation = resolve(document, object)
  if (!(annotation instanceof PDFDict)) return true
  if (hiddenAnnotation(document, annotation)) return false
  const named = decode(resolve(document, annotation.get(key('Dest'))))
  const action = resolve(document, annotation.get(key('A')))
  const uri = action instanceof PDFDict ? decode(resolve(document, action.get(key('URI')))) : undefined
  const cross = customTarget(uri)
  const target = cross ? (front.get(cross) ?? body.get(cross)) : named ? (pageIndex < frontPages ? front.get(named) : body.get(named)) : undefined
  if (cross && !target) throw new RenderRefusedError(`The segnavia link to ${cross} has no printed destination.`)
  if (target) {
    const offset = front.has(cross ?? '') || (!cross && pageIndex < frontPages) ? 0 : frontPages
    annotation.set(key('Dest'), explicit(document, target, offset))
    annotation.delete(key('A'))
  } else if (uri?.startsWith('segnavia:')) throw new RenderRefusedError(`The PDF still contains the segnavia link ${uri}.`)
  return true
}
