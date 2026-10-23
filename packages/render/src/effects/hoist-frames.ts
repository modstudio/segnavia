import { deflateSync } from 'node:zlib'
import { PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, type PDFRawStream, type PDFRef } from 'pdf-lib'
import { IDENTITY_MATRIX } from '../press/affine.ts'
import type { ContentOperation } from '../press/content.ts'

const key = (name: string): PDFName => PDFName.of(name)
const decoder = new TextDecoder()
const encoder = new TextEncoder()
const PATH = new Set(['c', 'h', 'l', 'm', 're', 'v', 'y'])
const PAINT = new Set(['B', 'B*', 'Do', 'S', 'Tj', 'TJ', 'b', 'b*', 'f', 'f*', 's', 'sh'])

export interface FrameSlice {
  end: number
  kind: 'clip' | 'cm'
  start: number
  text: string
}

export interface FramePrefix {
  slices: FrameSlice[]
}

export interface ImagePaint {
  frames: FramePrefix[]
  image: PDFRef
  remove: Array<{ end: number; start: number }>
  stream: PDFRawStream
}

export interface OpenFrame {
  pathStart?: number
  q: ContentOperation
  slices: FrameSlice[]
}

function sliceText(bytes: Uint8Array, start: number, end: number): string {
  return decoder.decode(bytes.subarray(start, end))
}

export function operationStart(operation: ContentOperation): number {
  // ContentOperation.start is the operator token, so a clip or cm slice must
  // begin at the first operand or the numbers never make it into the frost form.
  return operation.operands[0]?.start ?? operation.start
}

function withNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

export function prefixOf(frame: OpenFrame): FramePrefix {
  return { slices: frame.slices }
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

function recordClip(frame: OpenFrame, operations: ContentOperation[], index: number, bytes: Uint8Array): void {
  const next = operations[index + 1]
  const end = next?.operator === 'n' ? next.end : (operations[index]?.end ?? frame.q.end)
  const start = frame.pathStart ?? frame.q.end
  frame.slices.push({ end, kind: 'clip', start, text: sliceText(bytes, start, end) })
  frame.pathStart = undefined
}

export function advanceFrame(stack: OpenFrame[], operations: ContentOperation[], index: number, bytes: Uint8Array): void {
  const operation = operations[index]
  const frame = stack[stack.length - 1]
  if (!operation) return
  if (operation.operator === 'q') {
    stack.push({ q: operation, slices: [] })
    return
  }
  if (PATH.has(operation.operator) && frame && frame.pathStart === undefined) frame.pathStart = operationStart(operation)
  if ((operation.operator === 'W' || operation.operator === 'W*') && frame) recordClip(frame, operations, index, bytes)
  if (operation.operator === 'cm' && frame) {
    frame.slices.push({ end: operation.end, kind: 'cm', start: operationStart(operation), text: sliceText(bytes, operationStart(operation), operation.end) })
  }
  if (operation.operator === 'Q') stack.pop()
}

export function frameHasOtherPaint(stack: OpenFrame[], operations: ContentOperation[], imageDo: ContentOperation): boolean {
  const inner = stack[stack.length - 1]
  if (!inner) return false
  const from = operations.indexOf(inner.q)
  const close = matchingClose(operations, from)
  if (!close) return true
  const end = operations.indexOf(close)
  for (let index = from + 1; index < end; index++) {
    const current = operations[index]
    if (current && PAINT.has(current.operator) && current !== imageDo) return true
  }
  return false
}

export function removalOf(frame: OpenFrame | undefined, imageDo: ContentOperation): Array<{ end: number; start: number }> {
  const ranges = frame ? frame.slices.map((slice) => ({ end: slice.end, start: slice.start })) : []
  ranges.push({ end: imageDo.end, start: operationStart(imageDo) })
  return ranges.sort((left, right) => left.start - right.start)
}

function matrixValues(stream: PDFRawStream): number[] | undefined {
  if (!stream.dict.has(key('Matrix'))) return []
  const matrix = stream.dict.lookupMaybe(key('Matrix'), PDFArray)
  if (matrix?.size() !== 6) return undefined
  const values: number[] = []
  for (let index = 0; index < 6; index++) {
    const value = matrix.lookupMaybe(index, PDFNumber)?.asNumber()
    if (value === undefined || !Number.isFinite(value)) return undefined
    values.push(value)
  }
  return values
}

export function withNestedMatrix(nested: PDFRawStream, inherited: FramePrefix[]): FramePrefix[] | undefined {
  const values = matrixValues(nested)
  if (!values) return undefined
  if (values.length === 0 || values.every((value, index) => Math.abs(value - (IDENTITY_MATRIX[index] ?? 0)) <= 1e-9)) return inherited
  return [...inherited, { slices: [{ end: 0, kind: 'cm', start: 0, text: `${values.join(' ')} cm` }] }]
}

export function xObjectName(resources: PDFDict, object: PDFRef): string {
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

export function emitFrost(document: PDFDocument, host: PDFRawStream, paint: ImagePaint): PDFRef {
  const resources = document.context.obj({ XObject: {} })
  const name = xObjectName(resources, paint.image)
  const parts: string[] = []
  for (const frame of paint.frames) {
    parts.push('q\n')
    for (const slice of frame.slices) parts.push(withNewline(slice.kind === 'clip' ? slice.text.trimStart() : slice.text.trim()))
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
