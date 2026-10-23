import { PDFDict, type PDFDocument, PDFName, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { type ContentOperation, visitContentOperations } from '../press/content.ts'
import { type ContentBudget, decodeContent, dictionaryOf, nameOf } from '../press/pdf-objects.ts'
import { type MaskContext, walkPressGraph } from '../press/visitor.ts'
import { assignStream, replaceRanges } from './content-replacement.ts'
import {
  advanceFrame,
  emitFrost,
  type FramePrefix,
  frameHasOtherPaint,
  type ImagePaint,
  type OpenFrame,
  prefixOf,
  removalOf,
  unframedClipOrCm,
  withNestedMatrix,
  xObjectName,
} from './hoist-frames.ts'
import { backdropHoistAction, sourceGroupAfterHoistAction } from './policy.ts'
import { BACKDROP_RASTER_IMAGE_KEY } from './types.ts'

export const MAX_HOIST_NESTING = 4

const key = (name: string): PDFName => PDFName.of(name)
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

interface StreamCache {
  bytes: WeakMap<PDFRawStream, Uint8Array>
  operations: WeakMap<PDFRawStream, ContentOperation[]>
}

interface HoistPlan {
  paint: ImagePaint
  source: PDFRawStream
}

function newCache(): StreamCache {
  return { bytes: new WeakMap(), operations: new WeakMap() }
}

function cachedBytes(stream: PDFRawStream, budget: ContentBudget, cache: StreamCache): Uint8Array {
  const hit = cache.bytes.get(stream)
  if (hit) return hit
  const bytes = decodeContent(stream, budget)
  cache.bytes.set(stream, bytes)
  return bytes
}

function cachedOperations(stream: PDFRawStream, budget: ContentBudget, cache: StreamCache): ContentOperation[] {
  const hit = cache.operations.get(stream)
  if (hit) return hit
  const operations: ContentOperation[] = []
  visitContentOperations(cachedBytes(stream, budget, cache), (operation) => operations.push(operation))
  cache.operations.set(stream, operations)
  return operations
}

function xobjectsOf(stream: PDFRawStream): PDFDict | undefined {
  return stream.dict.lookupMaybe(key('Resources'), PDFDict)?.lookupMaybe(key('XObject'), PDFDict)
}

function taggedImageRef(document: PDFDocument, object: PDFObject | undefined): PDFRef | undefined {
  const stream = resolved(document, object)
  if (!(stream instanceof PDFRawStream) || !stream.dict.has(key(BACKDROP_RASTER_IMAGE_KEY))) return undefined
  return object instanceof PDFRef ? object : document.context.getObjectRef(stream)
}

function formContent(document: PDFDocument, object: PDFObject | undefined): PDFRawStream | undefined {
  const stream = resolved(document, object)
  return stream instanceof PDFRawStream && nameOf(stream.dict.get(key('Subtype'))) === 'Form' ? stream : undefined
}

function graphicsStateBlend(document: PDFDocument, states: PDFDict | undefined, name: string): string | undefined {
  const state = dictionaryOf(resolved(document, states?.get(key(name))))
  return nameOf(state?.get(key('BM')))
}

function paintAtDo(
  document: PDFDocument,
  stream: PDFRawStream,
  budget: ContentBudget,
  cache: StreamCache,
  inherited: FramePrefix[],
  stack: OpenFrame[],
  operations: ContentOperation[],
  operation: ContentOperation,
  child: PDFObject | undefined,
  depth: number,
  bytes: Uint8Array,
): ImagePaint | undefined {
  const frames = [...inherited, ...stack.map((open) => prefixOf(open))]
  const image = taggedImageRef(document, child)
  if (image) {
    if (unframedClipOrCm(operations, operation) || frameHasOtherPaint(stack, operations, operation, bytes)) return undefined
    return { frames, image, remove: removalOf(stack[stack.length - 1], operation), stream }
  }
  const nested = formContent(document, child)
  if (!nested) return undefined
  const next = withNestedMatrix(nested, frames)
  return next ? findTaggedImagePaint(document, nested, budget, cache, next, depth + 1) : undefined
}

function findTaggedImagePaint(
  document: PDFDocument,
  stream: PDFRawStream,
  budget: ContentBudget,
  cache: StreamCache,
  inherited: FramePrefix[],
  depth: number,
): ImagePaint | undefined {
  if (depth > MAX_HOIST_NESTING) return undefined
  let operations: ContentOperation[]
  let bytes: Uint8Array
  try {
    operations = cachedOperations(stream, budget, cache)
    bytes = cachedBytes(stream, budget, cache)
  } catch {
    return undefined
  }
  const xobjects = xobjectsOf(stream)
  const stack: OpenFrame[] = []
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    if (!operation) continue
    advanceFrame(stack, operations, index, bytes)
    if (operation.operator !== 'Do' || operation.operands[0]?.kind !== 'name' || !xobjects) continue
    const found = paintAtDo(
      document,
      stream,
      budget,
      cache,
      inherited,
      stack,
      operations,
      operation,
      xobjects.get(key(operation.operands[0].raw.slice(1))),
      depth,
      bytes,
    )
    if (found) return found
  }
  return undefined
}

function doPaintsCapturedRaster(document: PDFDocument, child: PDFObject | undefined, budget: ContentBudget, cache: StreamCache): boolean {
  if (taggedImageRef(document, child)) return true
  const nested = formContent(document, child)
  return Boolean(nested && findTaggedImagePaint(document, nested, budget, cache, [], 1))
}

function groupBackdropHoistFacts(
  document: PDFDocument,
  stream: PDFRawStream,
  mask: MaskContext,
  budget: ContentBudget,
  cache: StreamCache,
): { maskSource: boolean; paintsCapturedRaster: boolean; thenNonNormalBlend: boolean } | undefined {
  const maskSource = mask !== 'none'
  const xobjects = xobjectsOf(stream)
  const states = stream.dict.lookupMaybe(key('Resources'), PDFDict)?.lookupMaybe(key('ExtGState'), PDFDict)
  if (!xobjects) return { maskSource, paintsCapturedRaster: false, thenNonNormalBlend: false }
  let operations: ContentOperation[]
  try {
    operations = cachedOperations(stream, budget, cache)
  } catch {
    return undefined
  }
  let paintsCapturedRaster = false
  let thenNonNormalBlend = false
  for (const operation of operations) {
    if (operation.operator === 'Do' && operation.operands[0]?.kind === 'name') {
      if (doPaintsCapturedRaster(document, xobjects.get(key(operation.operands[0].raw.slice(1))), budget, cache)) paintsCapturedRaster = true
    }
    if (operation.operator !== 'gs' || operation.operands[0]?.kind !== 'name') continue
    const blend = graphicsStateBlend(document, states, operation.operands[0].raw.slice(1))
    if (paintsCapturedRaster && blend && blend !== 'Normal') thenNonNormalBlend = true
  }
  return { maskSource, paintsCapturedRaster, thenNonNormalBlend }
}

function shouldHoistBackdrop(document: PDFDocument, stream: PDFRawStream, mask: MaskContext, budget: ContentBudget, cache: StreamCache): boolean {
  const facts = groupBackdropHoistFacts(document, stream, mask, budget, cache)
  return Boolean(facts && backdropHoistAction(facts) === 'hoist')
}

function groupHasNonNormalBlend(document: PDFDocument, stream: PDFRawStream, budget: ContentBudget, cache: StreamCache): boolean | undefined {
  const states = stream.dict.lookupMaybe(key('Resources'), PDFDict)?.lookupMaybe(key('ExtGState'), PDFDict)
  try {
    for (const operation of cachedOperations(stream, budget, cache)) {
      if (operation.operator !== 'gs' || operation.operands[0]?.kind !== 'name') continue
      const blend = graphicsStateBlend(document, states, operation.operands[0].raw.slice(1))
      if (blend && blend !== 'Normal') return true
    }
    return false
  } catch {
    return undefined
  }
}

function shouldDropSourceGroup(document: PDFDocument, stream: PDFRawStream, budget: ContentBudget, cache: StreamCache): boolean {
  const remainingNonNormalBlend = groupHasNonNormalBlend(document, stream, budget, cache)
  return remainingNonNormalBlend !== undefined && sourceGroupAfterHoistAction({ remainingNonNormalBlend }) === 'drop-group'
}

function erasePaint(document: PDFDocument, paint: ImagePaint, budget: ContentBudget, cache: StreamCache): void {
  const remaining = assignStream(
    document,
    paint.stream,
    replaceRanges(
      cachedBytes(paint.stream, budget, cache),
      paint.remove.map((range) => ({ ...range, text: '' })),
    ),
  )
  // CoreGraphics composites a nested isolated group with a soft-masked fill
  // against white; without a remaining non-Normal blend the Group is only an artifact.
  if (shouldDropSourceGroup(document, remaining, budget, cache)) remaining.dict.delete(key('Group'))
}

function planLabel(document: PDFDocument, stored: PDFObject | undefined): string | undefined {
  if (stored instanceof PDFRef) return stored.toString()
  return stored instanceof PDFRawStream ? document.context.getObjectRef(stored)?.toString() : undefined
}

function insertFrostDos(
  document: PDFDocument,
  stream: PDFRawStream,
  resources: PDFDict | undefined,
  plans: Map<string, HoistPlan>,
  frosts: Map<string, PDFRef>,
  budget: ContentBudget,
  cache: StreamCache,
): string[] {
  const xobjects = resources?.lookupMaybe(key('XObject'), PDFDict)
  if (!resources || !xobjects) return []
  let operations: ContentOperation[]
  try {
    operations = cachedOperations(stream, budget, cache)
  } catch {
    return []
  }
  const replacements: Array<{ end: number; start: number; text: string }> = []
  const inserted: string[] = []
  for (const operation of operations) {
    if (operation.operator !== 'Do' || operation.operands[0]?.kind !== 'name') continue
    const label = planLabel(document, xobjects.get(key(operation.operands[0].raw.slice(1))))
    const plan = label ? plans.get(label) : undefined
    if (!plan || !label) continue
    let frost = frosts.get(label)
    if (!frost) {
      frost = emitFrost(document, plan.source, plan.paint)
      frosts.set(label, frost)
    }
    const start = operation.operands[0].start
    replacements.push({ start, end: start, text: `/${xObjectName(resources, frost)} Do ` })
    if (!inserted.includes(label)) inserted.push(label)
  }
  if (replacements.length === 0) return []
  assignStream(document, stream, replaceRanges(cachedBytes(stream, budget, cache), replacements))
  return inserted
}

export function hoistBackdropRasters(document: PDFDocument, budget: ContentBudget): boolean {
  const cache = newCache()
  const plans = new Map<string, HoistPlan>()
  walkPressGraph(document, {
    content: () => undefined,
    function: () => undefined,
    group: (_owner, stream, mask) => {
      if (!stream || !shouldHoistBackdrop(document, stream, mask, budget, cache)) return
      const reference = document.context.getObjectRef(stream)
      if (!reference) return
      const paint = findTaggedImagePaint(document, stream, budget, cache, [], 0)
      if (!paint || !document.context.getObjectRef(paint.stream)) return
      plans.set(reference.toString(), { paint, source: stream })
    },
    image: () => undefined,
    shading: () => false,
  })
  if (plans.size === 0) return false
  const frosts = new Map<string, PDFRef>()
  const erased = new Set<string>()
  let changed = false
  walkPressGraph(document, {
    content: (_object, stream, _replace, resources) => {
      for (const label of insertFrostDos(document, stream, resources, plans, frosts, budget, cache)) {
        const plan = plans.get(label)
        if (!plan || erased.has(label)) continue
        erasePaint(document, plan.paint, budget, cache)
        erased.add(label)
        changed = true
      }
    },
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
  })
  return changed
}
