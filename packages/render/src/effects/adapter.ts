import { deflateSync } from 'node:zlib'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { IDENTITY_MATRIX, multiplyAffine } from '../press/affine.ts'
import { type ContentOperation, visitContentOperations } from '../press/content.ts'
import {
  type ContentBudget,
  decodeContent,
  dictionaryOf,
  MAX_CONTENT_BYTES,
  MAX_DOCUMENT_CONTENT_BYTES,
  nameOf,
  numberOf,
  resolvedColorSpace,
} from '../press/pdf-objects.ts'
import { walkPressGraph } from '../press/visitor.ts'
import { softMaskAction } from './policy.ts'
import { buildRuleCImage, type RuleCPlan, ruleCPlan } from './rule-c.ts'
import type { EffectsReport } from './types.ts'

type PaintColor = { space: 'DeviceCMYK' | 'DeviceGray' | 'DeviceRGB'; values: number[] }
interface Rule1Plan {
  bbox: number[]
  image: PDFRawStream
  mask: PDFDict
}
interface EffectsState {
  applied: WeakSet<PDFDict>
  appliedRuleC: number
  budget: ContentBudget
  document: PDFDocument
  maskPlans: WeakMap<PDFDict, Rule1Plan>
  masks: Set<PDFDict>
  plans: WeakMap<PDFDict, Rule1Plan>
  ruleCChecked: WeakSet<PDFRawStream>
  ruleCPlans: WeakMap<PDFRawStream, RuleCPlan>
  ruleCMasks: WeakSet<PDFDict>
}

const key = (name: string): PDFName => PDFName.of(name)
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

function numbers(array: PDFArray | undefined): number[] | undefined {
  if (!array) return undefined
  const values: number[] = []
  for (let index = 0; index < array.size(); index++) {
    const value = array.lookupMaybe(index, PDFNumber)?.asNumber()
    if (value === undefined) return undefined
    values.push(value)
  }
  return values
}

function blackBackdrop(mask: PDFDict): boolean {
  const backdrop = numbers(mask.lookupMaybe(key('BC'), PDFArray))
  return backdrop === undefined || (backdrop.length === 1 && backdrop[0] === 0)
}

function hasNestedMask(document: PDFDocument, resources: PDFDict | undefined): boolean {
  const states = resources?.lookupMaybe(key('ExtGState'), PDFDict)
  for (const [, object] of states?.entries() ?? []) {
    const state = dictionaryOf(resolved(document, object))
    if (dictionaryOf(resolved(document, state?.get(key('SMask'))))) return true
  }
  return false
}

function groupContents(
  document: PDFDocument,
  source: PDFRawStream,
  resources: PDFDict | undefined,
  budget: ContentBudget,
): { image?: PDFRawStream; kind: 'single-image' | 'vector' | 'other' } {
  const operations: ContentOperation[] = []
  visitContentOperations(decodeContent(source, budget), (operation) => operations.push(operation))
  const paints = operations.filter(({ operator }) => ['Do', 'sh', 'f', 'f*', 'F', 'S', 'B', 'B*', 'b', 'b*'].includes(operator))
  if (paints.length !== 1 || paints[0]?.operator !== 'Do' || paints[0].operands.length !== 1 || paints[0].operands[0]?.kind !== 'name') {
    return { kind: paints.some(({ operator }) => operator !== 'Do') ? 'vector' : 'other' }
  }
  const xObjects = resources?.lookupMaybe(key('XObject'), PDFDict)
  const image = resolved(document, xObjects?.get(PDFName.of(paints[0].operands[0].raw.slice(1))))
  if (!(image instanceof PDFRawStream) || nameOf(image.dict.get(key('Subtype'))) !== 'Image') return { kind: 'vector' }
  if (resolvedColorSpace(document, resolved(document, image.dict.get(key('ColorSpace')))).kind !== 'gray' || image.dict.has(key('SMask'))) {
    return { kind: 'other' }
  }
  return { image, kind: 'single-image' }
}

function classifyMask(state: EffectsState, graphicsState: PDFDict, mask: PDFDict, source: PDFRawStream, resources: PDFDict | undefined): void {
  if (state.masks.has(mask)) {
    const plan = state.maskPlans.get(mask)
    if (plan) state.plans.set(graphicsState, plan)
    return
  }
  state.masks.add(mask)
  const group = source.dict.lookupMaybe(key('Group'), PDFDict)
  const contents = groupContents(state.document, source, resources, state.budget)
  const image = contents.image
  const nested = hasNestedMask(state.document, resources)
  const decision = softMaskAction({
    backdrop: blackBackdrop(mask) ? 'black' : 'other',
    colorSpace: group && resolvedColorSpace(state.document, resolved(state.document, group.get(key('CS')))).kind === 'gray' ? 'gray' : 'other',
    contents: contents.kind,
    nested,
    oneAxis: 'unknown',
    subtype: nameOf(mask.get(key('S'))) === 'Luminosity' ? 'luminosity' : 'other',
  })
  const bbox = numbers(source.dict.lookupMaybe(key('BBox'), PDFArray))
  if (decision === 'rule1' && image && bbox?.length === 4) {
    const plan = { bbox, image, mask }
    state.maskPlans.set(mask, plan)
    state.plans.set(graphicsState, plan)
  }
}

function numericOperands(operation: ContentOperation, count: number): number[] | undefined {
  if (operation.operands.length !== count || operation.operands.some(({ kind }) => kind !== 'number')) return undefined
  return operation.operands.map(({ raw }) => Number(raw))
}

const close = (left: number, right: number): boolean => Math.abs(left - right) <= 0.01
function matchingRectangle(operation: ContentOperation, bbox: number[]): boolean {
  const rectangle = numericOperands(operation, 4)
  if (!rectangle) return false
  const [x = 0, y = 0, width = 0, height = 0] = rectangle
  return close(x, bbox[0] ?? 0) && close(y, bbox[1] ?? 0) && close(width, (bbox[2] ?? 0) - (bbox[0] ?? 0)) && close(height, (bbox[3] ?? 0) - (bbox[1] ?? 0))
}

function colorFrom(operation: ContentOperation): PaintColor | undefined {
  const definitions = { g: ['DeviceGray', 1], rg: ['DeviceRGB', 3], k: ['DeviceCMYK', 4] } as const
  const definition = definitions[operation.operator as keyof typeof definitions]
  if (!definition) return undefined
  const values = numericOperands(operation, definition[1])
  return values ? { space: definition[0], values } : undefined
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

function effectImage(state: EffectsState, plan: Rule1Plan, color: PaintColor): PDFRef {
  const width = numberOf(plan.image.dict, 'Width')
  const height = numberOf(plan.image.dict, 'Height')
  if (!width || !height) throw new RenderRefusedError('The PDF has unsupported grayscale mask image dimensions; supported: positive Width and Height numbers.')
  const palette = color.values.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255))
  const length = Math.ceil(width / 8) * height
  chargePixels(state.budget, length)
  const bytes = new Uint8Array(length)
  const softMask = state.document.context.getObjectRef(plan.image) ?? plan.image
  return state.document.context.register(
    state.document.context.stream(deflateSync(bytes), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: ['Indexed', color.space, 0, PDFHexString.of(Buffer.from(palette).toString('hex'))],
      BitsPerComponent: 1,
      Filter: 'Fl' + 'ateDecode',
      SMask: softMask,
      SegnaviaEffectRule: 1,
      SegnaviaEffectColor: color.values,
    }),
  )
}

function xObjectName(resources: PDFDict, image: PDFRef): string {
  let xObjects = resources.lookupMaybe(key('XObject'), PDFDict)
  if (!xObjects) {
    xObjects = resources.context.obj({})
    resources.set(key('XObject'), xObjects)
  }
  let index = 1
  while (xObjects.has(key(`SegnaviaEffect${index}`))) index++
  const name = `SegnaviaEffect${index}`
  xObjects.set(key(name), image)
  return name
}

function streamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = { Filter: key('Fl' + 'ateDecode') }
  for (const [name, value] of stream.dict.entries()) {
    const label = name.toString().slice(1)
    if (!['Filter', 'DecodeP' + 'arms', 'Length'].includes(label)) dictionary[label] = value
  }
  return dictionary
}

function replaceRanges(bytes: Uint8Array, replacements: Array<{ end: number; start: number; text: string }>): Uint8Array {
  const encoder = new TextEncoder()
  let length = bytes.length
  for (const item of replacements) length += encoder.encode(item.text).length - (item.end - item.start)
  const output = new Uint8Array(length)
  let inputAt = 0
  let outputAt = 0
  for (const item of replacements) {
    output.set(bytes.subarray(inputAt, item.start), outputAt)
    outputAt += item.start - inputAt
    const inserted = encoder.encode(item.text)
    output.set(inserted, outputAt)
    outputAt += inserted.length
    inputAt = item.end
  }
  output.set(bytes.subarray(inputAt), outputAt)
  return output
}

function ruleCReplacement(
  state: EffectsState,
  next: ContentOperation | undefined,
  graphicsState: PDFDict | undefined,
  resources: PDFDict,
  printMatrix: number[],
): { end: number; text: string } | undefined {
  if (!graphicsState || next?.operator !== 'Do' || next.operands.length !== 1 || next.operands[0]?.kind !== 'name') return undefined
  const xObjects = resources.lookupMaybe(key('XObject'), PDFDict)
  const form = resolved(state.document, xObjects?.get(PDFName.of(next.operands[0].raw.slice(1))))
  if (!(form instanceof PDFRawStream) || nameOf(form.dict.get(key('Subtype'))) !== 'Form') return undefined
  if (!state.ruleCChecked.has(form)) {
    state.ruleCChecked.add(form)
    const candidate = ruleCPlan(state.document, form, state.budget)
    const decision = softMaskAction({
      backdrop: 'other',
      colorSpace: 'other',
      contents: 'other',
      nested: true,
      oneAxis: candidate.facts,
      subtype: 'other',
    })
    if (decision === 'ruleC' && candidate.plan) state.ruleCPlans.set(form, candidate.plan)
  }
  const plan = state.ruleCPlans.get(form)
  const built = plan ? buildRuleCImage(state.document, plan, numberOf(graphicsState, 'ca') ?? 1, state.budget, printMatrix) : undefined
  if (!plan || !built) return undefined
  const name = xObjectName(resources, built.image)
  const [left = 0, bottom = 0, right = 0, top = 0] = plan.bbox
  for (const mask of plan.masks) state.ruleCMasks.add(mask)
  state.appliedRuleC++
  return {
    end: next.end,
    text: `q ${left} ${bottom} ${right - left} ${top - bottom} re W n ${built.matrix.join(' ')} cm /${name} Do Q`,
  }
}

function namedOperand(operation: ContentOperation, operator: string): ContentOperation['operands'][number] | undefined {
  const operand = operation.operands[0]
  return operation.operator === operator && operation.operands.length === 1 && operand?.kind === 'name' ? operand : undefined
}

interface ContentGraphics {
  color: PaintColor | undefined
  matrix: number[]
}

function advanceGraphics(operation: ContentOperation, current: ContentGraphics, stack: ContentGraphics[]): ContentGraphics {
  if (operation.operator === 'q') {
    stack.push(current)
    return current
  }
  if (operation.operator === 'Q') return stack.pop() ?? { color: undefined, matrix: IDENTITY_MATRIX }
  if (operation.operator === 'cm') return { ...current, matrix: multiplyAffine(current.matrix, numericOperands(operation, 6) ?? IDENTITY_MATRIX) }
  return { ...current, color: colorFrom(operation) ?? current.color }
}

function rewriteContent(
  state: EffectsState,
  object: PDFObject,
  stream: PDFRawStream,
  setDirect: (stream: PDFRawStream) => void,
  resources: PDFDict | undefined,
): void {
  const bytes = decodeContent(stream, state.budget)
  if (!resources) return
  const operations: ContentOperation[] = []
  visitContentOperations(bytes, (operation) => operations.push(operation))
  const graphicsStates = resources.lookupMaybe(key('ExtGState'), PDFDict)
  const replacements: Array<{ end: number; start: number; text: string }> = []
  const stack: ContentGraphics[] = []
  let graphics: ContentGraphics = { color: undefined, matrix: IDENTITY_MATRIX }
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    if (!operation) continue
    graphics = advanceGraphics(operation, graphics, stack)
    const operand = namedOperand(operation, 'gs')
    if (!operand) continue
    const graphicsState = dictionaryOf(resolved(state.document, graphicsStates?.get(PDFName.of(operand.raw.slice(1)))))
    const ruleC = ruleCReplacement(state, operations[index + 1], graphicsState, resources, graphics.matrix)
    if (ruleC) {
      replacements.push({ start: operand.start, ...ruleC })
      index++
      continue
    }
    if (!graphics.color) continue
    const plan = graphicsState ? state.plans.get(graphicsState) : undefined
    const rectangle = operations[index + 1]
    const fill = operations[index + 2]
    if (!plan || !rectangle || !fill || rectangle.operator !== 're' || !['f', 'f*', 'F'].includes(fill.operator) || !matchingRectangle(rectangle, plan.bbox))
      continue
    const image = effectImage(state, plan, graphics.color)
    const name = xObjectName(resources, image)
    const [left = 0, bottom = 0, right = 0, top = 0] = plan.bbox
    replacements.push({
      start: operand.start,
      end: fill.end,
      text: `q ${right - left} 0 0 ${bottom - top} ${left} ${top} cm /${name} Do Q`,
    })
    state.applied.add(plan.mask)
    index += 2
  }
  if (replacements.length === 0) return
  const replacement = state.document.context.stream(deflateSync(replaceRanges(bytes, replacements)), streamDictionary(stream))
  const reference = object instanceof PDFRef ? object : state.document.context.getObjectRef(object)
  if (reference) state.document.context.assign(reference, replacement)
  else setDirect(replacement)
}

export function rewriteEffectsDocument(document: PDFDocument): EffectsReport {
  const state: EffectsState = {
    applied: new WeakSet(),
    appliedRuleC: 0,
    budget: { decodedBytes: 0 },
    document,
    maskPlans: new WeakMap(),
    masks: new Set(),
    plans: new WeakMap(),
    ruleCChecked: new WeakSet(),
    ruleCPlans: new WeakMap(),
    ruleCMasks: new WeakSet(),
  }
  walkPressGraph(document, {
    content: () => undefined,
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
    softMask: (graphicsState, mask, source, resources) => classifyMask(state, graphicsState, mask, source, resources),
  })
  state.budget = { decodedBytes: 0 }
  walkPressGraph(document, {
    content: (object, stream, replace, resources) => rewriteContent(state, object, stream, replace, resources),
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
  })
  let rule1 = 0
  for (const mask of state.masks) if (state.applied.has(mask)) rule1++
  let kept = 0
  for (const mask of state.masks) if (!state.applied.has(mask) && !state.ruleCMasks.has(mask)) kept++
  return { rule1, ruleC: state.appliedRuleC, rule2: 0, rule3: 0, rule4: 0, kept }
}

export async function rewriteEffectsPdf(bytes: Uint8Array): Promise<{ bytes: Uint8Array; report: EffectsReport }> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    const report = rewriteEffectsDocument(document)
    return { bytes: report.rule1 === 0 && report.ruleC === 0 ? bytes : await document.save(), report }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError('The PDF has unsupported malformed structure; supported: a valid PDF produced by the renderer.')
  }
}
