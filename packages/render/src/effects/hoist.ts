import { deflateSync } from 'node:zlib'
import { PDFDict, type PDFDocument, PDFName, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { type ContentOperation, visitContentOperations } from '../press/content.ts'
import { type ContentBudget, decodeContent, nameOf } from '../press/pdf-objects.ts'
import { walkPressGraph } from '../press/visitor.ts'
import { replaceRanges, streamDictionary } from './content-replacement.ts'
import { shouldDropSourceGroup, shouldHoistBackdrop } from './isolation.ts'
import { BACKDROP_RASTER_IMAGE_KEY } from './types.ts'

const key = (name: string): PDFName => PDFName.of(name)
const decoder = new TextDecoder()
const encoder = new TextEncoder()
const PATH = new Set(['c', 'h', 'l', 'm', 're', 'v', 'y'])
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

interface FramePrefix {
  clip?: string
  cms: string[]
}

interface ImagePaint {
  frames: FramePrefix[]
  image: PDFRef
  remove: { end: number; start: number; stream: PDFRawStream }
}

interface OpenFrame {
  clip?: { end: number; start: number }
  cms: ContentOperation[]
  pathStart?: number
  q: ContentOperation
}

function referenceOf(document: PDFDocument, stream: PDFRawStream): PDFRef | undefined {
  for (const [ref, object] of document.context.enumerateIndirectObjects()) if (object === stream) return ref
  return undefined
}

function operationsOf(stream: PDFRawStream, budget: ContentBudget): ContentOperation[] {
  const operations: ContentOperation[] = []
  visitContentOperations(decodeContent(stream, budget), (operation) => operations.push(operation))
  return operations
}

function xobjectsOf(stream: PDFRawStream): PDFDict | undefined {
  return stream.dict.lookupMaybe(key('Resources'), PDFDict)?.lookupMaybe(key('XObject'), PDFDict)
}

function sliceText(bytes: Uint8Array, start: number, end: number): string {
  return decoder.decode(bytes.subarray(start, end))
}

function operationStart(operation: ContentOperation): number {
  // ContentOperation.start is the operator token, so a clip or cm slice must
  // begin at the first operand or the numbers never make it into the frost form.
  return operation.operands[0]?.start ?? operation.start
}

function withNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

function taggedImageRef(document: PDFDocument, object: PDFObject | undefined): PDFRef | undefined {
  const stream = resolved(document, object)
  if (!(stream instanceof PDFRawStream) || !stream.dict.has(key(BACKDROP_RASTER_IMAGE_KEY))) return undefined
  const reference = object instanceof PDFRef ? object : referenceOf(document, stream)
  return reference
}

function formContent(document: PDFDocument, object: PDFObject | undefined): PDFRawStream | undefined {
  const stream = resolved(document, object)
  return stream instanceof PDFRawStream && nameOf(stream.dict.get(key('Subtype'))) === 'Form' ? stream : undefined
}

function prefixOf(frame: OpenFrame, bytes: Uint8Array): FramePrefix {
  return {
    clip: frame.clip ? sliceText(bytes, frame.clip.start, frame.clip.end) : undefined,
    cms: frame.cms.map((operation) => sliceText(bytes, operationStart(operation), operation.end)),
  }
}

function matchingClose(operations: ContentOperation[], from: number): ContentOperation | undefined {
  let depth = 1
  for (let index = from + 1; index < operations.length; index++) {
    const operation = operations[index]
    if (!operation) continue
    if (operation.operator === 'q') depth++
    if (operation.operator !== 'Q') continue
    depth--
    if (depth === 0) return operation
  }
  return undefined
}

function recordClip(frame: OpenFrame, operations: ContentOperation[], index: number): void {
  const next = operations[index + 1]
  const end = next?.operator === 'n' ? next.end : (operations[index]?.end ?? frame.q.end)
  frame.clip = { start: frame.pathStart ?? frame.q.end, end }
  frame.pathStart = undefined
}

function paintAtDo(
  document: PDFDocument,
  stream: PDFRawStream,
  budget: ContentBudget,
  inherited: FramePrefix[],
  bytes: Uint8Array,
  stack: OpenFrame[],
  operations: ContentOperation[],
  operation: ContentOperation,
  child: PDFObject | undefined,
  depth: number,
): ImagePaint | undefined {
  const frames = [...inherited, ...stack.map((open) => prefixOf(open, bytes))]
  const image = taggedImageRef(document, child)
  if (image) {
    const inner = stack[stack.length - 1]
    const close = inner ? matchingClose(operations, operations.indexOf(inner.q)) : undefined
    return { frames, image, remove: { end: close?.end ?? operation.end, start: inner?.q.start ?? operation.start, stream } }
  }
  const nested = formContent(document, child)
  return nested ? findTaggedImagePaint(document, nested, budget, frames, depth + 1) : undefined
}

function advanceFrame(stack: OpenFrame[], operations: ContentOperation[], index: number): void {
  const operation = operations[index]
  const frame = stack[stack.length - 1]
  if (!operation) return
  if (operation.operator === 'q') {
    stack.push({ cms: [], q: operation })
    return
  }
  if (PATH.has(operation.operator) && frame && frame.pathStart === undefined) frame.pathStart = operationStart(operation)
  if ((operation.operator === 'W' || operation.operator === 'W*') && frame) recordClip(frame, operations, index)
  if (operation.operator === 'cm' && frame) frame.cms.push(operation)
  if (operation.operator === 'Q') stack.pop()
}

function findTaggedImagePaint(
  document: PDFDocument,
  stream: PDFRawStream,
  budget: ContentBudget,
  inherited: FramePrefix[],
  depth: number,
): ImagePaint | undefined {
  if (depth > 4) return undefined
  let operations: ContentOperation[]
  try {
    operations = operationsOf(stream, budget)
  } catch {
    return undefined
  }
  const bytes = decodeContent(stream, budget)
  const xobjects = xobjectsOf(stream)
  const stack: OpenFrame[] = []
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    if (!operation) continue
    advanceFrame(stack, operations, index)
    if (operation.operator !== 'Do' || operation.operands[0]?.kind !== 'name' || !xobjects) continue
    const found = paintAtDo(
      document,
      stream,
      budget,
      inherited,
      bytes,
      stack,
      operations,
      operation,
      xobjects.get(key(operation.operands[0].raw.slice(1))),
      depth,
    )
    if (found) return found
  }
  return undefined
}

function emitFrost(document: PDFDocument, host: PDFRawStream, paint: ImagePaint): PDFRef {
  const resources = document.context.obj({ XObject: {} })
  const name = xObjectName(resources, paint.image)
  const parts: string[] = []
  for (const frame of paint.frames) {
    parts.push('q\n')
    if (frame.clip) parts.push(withNewline(frame.clip.trimStart()))
    for (const cm of frame.cms) parts.push(withNewline(cm.trim()))
  }
  parts.push(`/${name} Do\n`)
  for (let index = 0; index < paint.frames.length; index++) parts.push('Q\n')
  const dictionary: Record<string, PDFObject> = {
    Type: key('XObject'),
    Subtype: key('Form'),
    Filter: key('FlateDecode'),
    Resources: resources,
  }
  const bbox = host.dict.get(key('BBox'))
  if (bbox) dictionary.BBox = bbox
  const group = host.dict.get(key('Group'))
  if (group) dictionary.Group = group
  const matrix = host.dict.get(key('Matrix'))
  if (matrix) dictionary.Matrix = matrix
  return document.context.register(document.context.stream(deflateSync(encoder.encode(parts.join(''))), dictionary))
}

function assignStream(document: PDFDocument, stream: PDFRawStream, bytes: Uint8Array): PDFRawStream {
  const replacement = document.context.stream(deflateSync(bytes), streamDictionary(stream))
  const reference = referenceOf(document, stream)
  if (reference) document.context.assign(reference, replacement)
  return replacement
}

function splitFrostForm(document: PDFDocument, stream: PDFRawStream, budget: ContentBudget): PDFRef | undefined {
  const paint = findTaggedImagePaint(document, stream, budget, [], 0)
  if (!paint) return undefined
  const frost = emitFrost(document, stream, paint)
  const bytes = decodeContent(paint.remove.stream, budget)
  const remaining = assignStream(document, paint.remove.stream, replaceRanges(bytes, [{ start: paint.remove.start, end: paint.remove.end, text: '' }]))
  // CoreGraphics composites a nested isolated group with a soft-masked fill
  // against white; without a remaining non-Normal blend the Group is only an artifact.
  if (shouldDropSourceGroup(document, remaining, budget)) remaining.dict.delete(key('Group'))
  return frost
}

function xObjectName(resources: PDFDict, object: PDFRef): string {
  let xobjects = resources.lookupMaybe(key('XObject'), PDFDict)
  if (!xobjects) {
    xobjects = resources.context.obj({})
    resources.set(key('XObject'), xobjects)
  }
  for (const [name, value] of xobjects.entries()) if (value === object || value?.toString() === object.toString()) return name.toString().slice(1)
  let index = 1
  while (xobjects.has(key(`SegnaviaBackdrop${index}`))) index++
  const name = `SegnaviaBackdrop${index}`
  xobjects.set(key(name), object)
  return name
}

function insertFrostDos(
  document: PDFDocument,
  stream: PDFRawStream,
  resources: PDFDict | undefined,
  plans: Map<string, PDFRef>,
  budget: ContentBudget,
): boolean {
  if (!resources) return false
  const xobjects = resources.lookupMaybe(key('XObject'), PDFDict)
  if (!xobjects) return false
  let operations: ContentOperation[]
  try {
    operations = operationsOf(stream, budget)
  } catch {
    return false
  }
  const replacements: Array<{ end: number; start: number; text: string }> = []
  for (const operation of operations) {
    if (operation.operator !== 'Do' || operation.operands[0]?.kind !== 'name') continue
    const stored = xobjects.get(key(operation.operands[0].raw.slice(1)))
    const label = stored instanceof PDFRef ? stored.toString() : stored instanceof PDFRawStream ? referenceOf(document, stored)?.toString() : undefined
    const frost = label ? plans.get(label) : undefined
    if (!frost) continue
    const name = xObjectName(resources, frost)
    const start = operation.operands[0].start
    replacements.push({ start, end: start, text: `/${name} Do ` })
  }
  if (replacements.length === 0) return false
  assignStream(document, stream, replaceRanges(decodeContent(stream, budget), replacements))
  return true
}

export function hoistBackdropRasters(document: PDFDocument, budget: ContentBudget): boolean {
  const plans = new Map<string, PDFRef>()
  walkPressGraph(document, {
    content: () => undefined,
    function: () => undefined,
    group: (_owner, stream, mask) => {
      if (!stream || mask !== 'none' || !shouldHoistBackdrop(document, stream, mask, budget)) return
      const reference = referenceOf(document, stream)
      const frost = splitFrostForm(document, stream, budget)
      if (frost && reference) plans.set(reference.toString(), frost)
    },
    image: () => undefined,
    shading: () => false,
  })
  if (plans.size === 0) return false
  let changed = false
  walkPressGraph(document, {
    content: (_object, stream, _replace, resources) => {
      if (insertFrostDos(document, stream, resources, plans, budget)) changed = true
    },
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
  })
  return changed
}
