import { deflateSync } from 'node:zlib'
import { PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { loadPdf } from '../pdf-load.ts'
import { IDENTITY_MATRIX, multiplyAffine } from '../press/affine.ts'
import { type ContentOperation, visitContentOperations } from '../press/content.ts'
import { type ContentBudget, decodeContent, dictionaryOf, nameOf, resolvedColorSpace } from '../press/pdf-objects.ts'
import { walkPressGraph } from '../press/visitor.ts'
import { replaceRanges, streamDictionary } from './content-replacement.ts'
import { type SoftMaskFacts, softMaskAction } from './policy.ts'
import { type PaintColor, type Rule1Plan, rule1EffectImage } from './rule-1.ts'
import { buildRuleCImage, type RuleCPlan, ruleCPlan } from './rule-c.ts'
import {
  advanceEffectGraphicsState,
  type EffectGraphicsState,
  type EffectStructure,
  EMPTY_EFFECT_GRAPHICS_STATE,
  effectFormStructure,
  effectGraphicsStateOpacity,
  effectGraphicsStateStructure,
  effectOpacity,
} from './structure.ts'
import type { EffectsReport } from './types.ts'

interface Rule1Candidate {
  backdrop: SoftMaskFacts['backdrop']
  colorSpace: SoftMaskFacts['colorSpace']
  contents: SoftMaskFacts['contents']
  plan?: Rule1Plan
  structure: SoftMaskFacts['structure']
  subtype: SoftMaskFacts['subtype']
}
interface EffectsState {
  applied: WeakSet<PDFDict>
  appliedRuleC: number
  budget: ContentBudget
  document: PDFDocument
  masks: Set<PDFDict>
  rule1Candidates: WeakMap<PDFDict, Rule1Candidate>
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
): { image?: PDFRawStream; kind: 'single-image' | 'vector' | 'other'; structure: EffectStructure } {
  const operations: ContentOperation[] = []
  visitContentOperations(decodeContent(source, budget), (operation) => operations.push(operation))
  const states = resources?.lookupMaybe(key('ExtGState'), PDFDict)
  const stack: EffectGraphicsState[] = []
  let graphicsState = EMPTY_EFFECT_GRAPHICS_STATE
  let structure: EffectStructure = 'allowed'
  let paintState = EMPTY_EFFECT_GRAPHICS_STATE
  for (const operation of operations) {
    graphicsState = advanceEffectGraphicsState(document, operation, states, graphicsState, stack)
    if (graphicsState.structure === 'other') structure = 'other'
    if (operation.operator === 'Do') paintState = graphicsState
  }
  const paints = operations.filter(({ operator }) => ['Do', 'sh', 'f', 'f*', 'F', 'S', 'B', 'B*', 'b', 'b*'].includes(operator))
  if (paints.length !== 1 || paints[0]?.operator !== 'Do' || paints[0].operands.length !== 1 || paints[0].operands[0]?.kind !== 'name') {
    return { kind: paints.some(({ operator }) => operator !== 'Do') ? 'vector' : 'other', structure: 'other' }
  }
  const xObjects = resources?.lookupMaybe(key('XObject'), PDFDict)
  const image = resolved(document, xObjects?.get(PDFName.of(paints[0].operands[0].raw.slice(1))))
  if (!(image instanceof PDFRawStream) || nameOf(image.dict.get(key('Subtype'))) !== 'Image') return { kind: 'vector', structure: 'other' }
  if (resolvedColorSpace(document, resolved(document, image.dict.get(key('ColorSpace')))).kind !== 'gray' || image.dict.has(key('SMask'))) {
    return { kind: 'other', structure: 'other' }
  }
  if (effectGraphicsStateOpacity(paintState) !== 1) structure = 'other'
  return { image, kind: 'single-image', structure }
}

function classifyMask(state: EffectsState, graphicsState: PDFDict, mask: PDFDict, source: PDFRawStream, resources: PDFDict | undefined): void {
  state.masks.add(mask)
  const group = source.dict.lookupMaybe(key('Group'), PDFDict)
  const contents = groupContents(state.document, source, resources, state.budget)
  const image = contents.image
  const nested = hasNestedMask(state.document, resources)
  const opacity = effectOpacity(graphicsState)
  const structure = rule1Structure(state.document, graphicsState, mask, source, contents.structure, nested)
  const candidate: Rule1Candidate = {
    backdrop: blackBackdrop(mask) ? 'black' : 'other',
    colorSpace: group && resolvedColorSpace(state.document, resolved(state.document, group.get(key('CS')))).kind === 'gray' ? 'gray' : 'other',
    contents: contents.kind,
    structure,
    subtype: nameOf(mask.get(key('S'))) === 'Luminosity' ? 'luminosity' : 'other',
  }
  const bbox = numbers(source.dict.lookupMaybe(key('BBox'), PDFArray))
  const plan = image && bbox?.length === 4 && opacity !== undefined ? { bbox, image, mask, opacity } : undefined
  state.rule1Candidates.set(graphicsState, { ...candidate, plan })
}

function rule1Structure(
  document: PDFDocument,
  graphicsState: PDFDict,
  mask: PDFDict,
  source: PDFRawStream,
  contents: EffectStructure,
  nested: boolean,
): EffectStructure {
  const transfer = !mask.has(key('TR')) || nameOf(resolved(document, mask.get(key('TR')))) === 'Identity'
  return transfer &&
    !nested &&
    contents === 'allowed' &&
    effectGraphicsStateStructure(graphicsState) === 'allowed' &&
    effectFormStructure(source.dict) === 'allowed'
    ? 'allowed'
    : 'other'
}

function finiteNumberEntry(dictionary: PDFDict, label: string): number | undefined {
  const object = dictionary.get(key(label))
  const value = object instanceof PDFRef ? dictionary.context.lookup(object) : object
  const number = value instanceof PDFNumber ? value.asNumber() : undefined
  return number !== undefined && Number.isFinite(number) ? number : undefined
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

function opacityGraphicsStateName(resources: PDFDict, opacity: number): string | undefined {
  if (opacity === 1) return undefined
  let states = resources.lookupMaybe(key('ExtGState'), PDFDict)
  if (!states) {
    states = resources.context.obj({})
    resources.set(key('ExtGState'), states)
  }
  let index = 1
  while (states.has(key(`SegnaviaEffectOpacity${index}`))) index++
  const name = `SegnaviaEffectOpacity${index}`
  states.set(key(name), resources.context.obj({ Type: 'ExtGState', ca: opacity }))
  return name
}

function ruleCCandidate(
  state: EffectsState,
  next: ContentOperation | undefined,
  graphicsState: PDFDict | undefined,
  resources: PDFDict,
): ReturnType<typeof ruleCPlan> | undefined {
  if (!graphicsState || next?.operator !== 'Do' || next.operands.length !== 1 || next.operands[0]?.kind !== 'name') return undefined
  const xObjects = resources.lookupMaybe(key('XObject'), PDFDict)
  const form = resolved(state.document, xObjects?.get(PDFName.of(next.operands[0].raw.slice(1))))
  if (!(form instanceof PDFRawStream) || nameOf(form.dict.get(key('Subtype'))) !== 'Form') return undefined
  return ruleCPlan(state.document, form, graphicsState, state.budget)
}

function ruleCReplacement(
  state: EffectsState,
  next: ContentOperation,
  graphicsState: PDFDict,
  resources: PDFDict,
  printMatrix: number[],
  plan: RuleCPlan,
): { end: number; text: string } | undefined {
  const opacity = graphicsState.has(key('ca')) ? finiteNumberEntry(graphicsState, 'ca') : 1
  const built = opacity !== undefined ? buildRuleCImage(state.document, plan, opacity, state.budget, printMatrix) : undefined
  if (!built) return undefined
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

function effectReplacement(
  state: EffectsState,
  next: ContentOperation | undefined,
  following: ContentOperation | undefined,
  graphicsState: PDFDict,
  resources: PDFDict,
  graphics: ContentGraphics,
): { consumed: number; end: number; text: string } | undefined {
  const ruleC = ruleCCandidate(state, next, graphicsState, resources)
  const rule1 = state.rule1Candidates.get(graphicsState)
  if (!rule1 && !ruleC?.nested) return undefined
  const facts: SoftMaskFacts = {
    backdrop: rule1?.backdrop ?? 'other',
    colorSpace: rule1?.colorSpace ?? 'other',
    contents: rule1?.contents ?? 'other',
    nested: ruleC?.nested ?? false,
    oneAxis: ruleC?.nested ? ruleC.oneAxis : 'unknown',
    structure: ruleC?.nested ? ruleC.structure : (rule1?.structure ?? 'other'),
    subtype: rule1?.subtype ?? 'other',
  }
  const decision = softMaskAction(facts)
  if (decision === 'ruleC' && ruleC?.plan && next) {
    const replacement = ruleCReplacement(state, next, graphicsState, resources, graphics.matrix, ruleC.plan)
    return replacement ? { consumed: 1, ...replacement } : undefined
  }
  const plan = rule1?.plan
  if (
    decision !== 'rule1' ||
    !plan ||
    !graphics.color ||
    !next ||
    !following ||
    next.operator !== 're' ||
    !['f', 'f*', 'F'].includes(following.operator) ||
    !matchingRectangle(next, plan.bbox)
  )
    return undefined
  const image = rule1EffectImage(state.document, state.budget, plan, graphics.color)
  const name = xObjectName(resources, image)
  const opacityName = opacityGraphicsStateName(resources, plan.opacity)
  const [left = 0, bottom = 0, right = 0, top = 0] = plan.bbox
  state.applied.add(plan.mask)
  const opacity = opacityName ? `/${opacityName} gs ` : ''
  return { consumed: 2, end: following.end, text: `q ${opacity}${right - left} 0 0 ${bottom - top} ${left} ${top} cm /${name} Do Q` }
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
    if (!graphicsState) continue
    const replacement = effectReplacement(state, operations[index + 1], operations[index + 2], graphicsState, resources, graphics)
    if (!replacement) continue
    replacements.push({ start: operand.start, ...replacement })
    index += replacement.consumed
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
    masks: new Set(),
    rule1Candidates: new WeakMap(),
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
  return { rule1, ruleC: state.appliedRuleC, kept }
}

export async function rewriteEffectsPdf(bytes: Uint8Array): Promise<{ bytes: Uint8Array; report: EffectsReport }> {
  try {
    const document = await loadPdf(bytes, { updateMetadata: false })
    const report = rewriteEffectsDocument(document)
    return { bytes: report.rule1 === 0 && report.ruleC === 0 ? bytes : await document.save(), report }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError('The PDF has unsupported malformed structure; supported: a valid PDF produced by the renderer.')
  }
}
