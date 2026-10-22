import { PDFDict, type PDFDocument, PDFName, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { type ContentOperation, visitContentOperations } from '../press/content.ts'
import { type ContentBudget, decodeContent, dictionaryOf, nameOf } from '../press/pdf-objects.ts'
import type { MaskContext } from '../press/visitor.ts'
import { type BackdropHoistFacts, backdropHoistAction, sourceGroupAfterHoistAction } from './policy.ts'
import { BACKDROP_RASTER_IMAGE_KEY } from './types.ts'

const key = (name: string): PDFName => PDFName.of(name)
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

function graphicsStateBlend(document: PDFDocument, states: PDFDict | undefined, name: string): string | undefined {
  const state = dictionaryOf(resolved(document, states?.get(key(name))))
  return nameOf(state?.get(key('BM')))
}

function isCapturedRaster(document: PDFDocument, object: PDFObject | undefined, depth = 0): boolean {
  const stream = object instanceof PDFRef ? document.context.lookup(object) : object
  if (!(stream instanceof PDFRawStream) || depth > 4) return false
  if (stream.dict.has(key(BACKDROP_RASTER_IMAGE_KEY))) return true
  if (nameOf(stream.dict.get(key('Subtype'))) !== 'Form') return false
  const xobjects = stream.dict.lookupMaybe(key('Resources'), PDFDict)?.lookupMaybe(key('XObject'), PDFDict)
  for (const [, child] of xobjects?.entries() ?? []) if (isCapturedRaster(document, child, depth + 1)) return true
  return false
}

export function groupBackdropHoistFacts(document: PDFDocument, stream: PDFRawStream, mask: MaskContext, budget: ContentBudget): BackdropHoistFacts | undefined {
  const resources = stream.dict.lookupMaybe(key('Resources'), PDFDict)
  const states = resources?.lookupMaybe(key('ExtGState'), PDFDict)
  const xobjects = resources?.lookupMaybe(key('XObject'), PDFDict)
  if (!xobjects) return { paintsCapturedRaster: false, thenNonNormalBlend: false, maskSource: mask !== 'none' }
  try {
    const operations: ContentOperation[] = []
    visitContentOperations(decodeContent(stream, budget), (operation) => operations.push(operation))
    let paintsCapturedRaster = false
    let thenNonNormalBlend = false
    for (const operation of operations) {
      if (operation.operator === 'Do' && operation.operands[0]?.kind === 'name') {
        if (isCapturedRaster(document, xobjects.get(key(operation.operands[0].raw.slice(1))))) paintsCapturedRaster = true
      }
      if (operation.operator !== 'gs' || operation.operands[0]?.kind !== 'name') continue
      const blend = graphicsStateBlend(document, states, operation.operands[0].raw.slice(1))
      if (paintsCapturedRaster && blend && blend !== 'Normal') thenNonNormalBlend = true
    }
    return { paintsCapturedRaster, thenNonNormalBlend, maskSource: mask !== 'none' }
  } catch {
    return undefined
  }
}

export function rewriteTransparencyGroupColorSpace(owner: PDFDict): boolean {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || group.has(key('CS'))) return false
  // Chromium paints these groups in RGB; declaring that space prevents readers from choosing a device-dependent fallback that changes their color.
  group.set(key('CS'), key('DeviceRGB'))
  return true
}

export function shouldHoistBackdrop(document: PDFDocument, stream: PDFRawStream, mask: MaskContext, budget: ContentBudget): boolean {
  const facts = groupBackdropHoistFacts(document, stream, mask, budget)
  return Boolean(facts && backdropHoistAction(facts) === 'hoist')
}

function groupHasNonNormalBlend(document: PDFDocument, stream: PDFRawStream, budget: ContentBudget): boolean | undefined {
  const states = stream.dict.lookupMaybe(key('Resources'), PDFDict)?.lookupMaybe(key('ExtGState'), PDFDict)
  try {
    const operations: ContentOperation[] = []
    visitContentOperations(decodeContent(stream, budget), (operation) => operations.push(operation))
    for (const operation of operations) {
      if (operation.operator !== 'gs' || operation.operands[0]?.kind !== 'name') continue
      const blend = graphicsStateBlend(document, states, operation.operands[0].raw.slice(1))
      if (blend && blend !== 'Normal') return true
    }
    return false
  } catch {
    return undefined
  }
}

export function shouldDropSourceGroup(document: PDFDocument, stream: PDFRawStream, budget: ContentBudget): boolean {
  const remainingNonNormalBlend = groupHasNonNormalBlend(document, stream, budget)
  return remainingNonNormalBlend !== undefined && sourceGroupAfterHoistAction({ remainingNonNormalBlend }) === 'drop-group'
}
