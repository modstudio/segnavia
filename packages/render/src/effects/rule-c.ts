import { deflateSync } from 'node:zlib'
import { PDFArray, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { applyAffine, IDENTITY_MATRIX } from '../press/affine.ts'
import { type ContentOperation, visitContentOperations } from '../press/content.ts'
import { type ContentBudget, decodeContent, dictionaryOf, nameOf, numberOf, resolvedColorSpace } from '../press/pdf-objects.ts'
import { chargeShadingSamples, MAX_DOCUMENT_CALCULATOR_OPERATIONS, MAX_SHADING_SAMPLES, SHADING_SAMPLE_SPACING_PT } from '../press/sample-shading.ts'
import { functionEvaluator } from './function-evaluator.ts'
import { type EffectStructure, effectFormStructure, effectGraphicsStateStructure, effectOpacity } from './structure.ts'
import { GENERATED_EFFECT_IMAGE_KEY } from './types.ts'

const key = (name: string): PDFName => PDFName.of(name)
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

interface Layer {
  axis: Axis
  channels: number
  evaluate: (position: number) => number[]
}
interface Axis {
  end: { x: number; y: number }
  start: { x: number; y: number }
}
type Coverage = { kind: 'constant'; value: number } | { kind: 'layer'; layer: Layer; opacity: number; transfer: 'identity' | 'invert' }
interface Paint {
  graphicsState?: PDFDict
  operation: ContentOperation
  pattern?: PDFObject
  xObject?: PDFObject
}
export interface RuleCPlan {
  bbox: number[]
  color: Layer
  coverage: Coverage[]
  masks: PDFDict[]
}
export type RuleCFacts = 'shared' | 'different' | 'non-shading'
export interface RuleCCandidate {
  nested: boolean
  oneAxis: RuleCFacts
  plan?: RuleCPlan
  structure: EffectStructure
}
interface RuleCContext {
  structure: EffectStructure
}

export const MAX_EFFECT_COVERAGE_LAYERS = 4096

function arrayNumbers(dictionary: PDFDict, label: string): number[] | undefined {
  const array = dictionary.lookupMaybe(key(label), PDFArray)
  if (!array) return undefined
  const values: number[] = []
  for (let index = 0; index < array.size(); index++) {
    const value = array.lookupMaybe(index, PDFNumber)?.asNumber()
    if (value === undefined || !Number.isFinite(value)) return undefined
    values.push(value)
  }
  return values
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function axialLayer(document: PDFDocument, pattern: PDFDict): Layer | undefined {
  if (numberOf(pattern, 'PatternType') !== 2) return undefined
  const shading = dictionaryOf(resolved(document, pattern.get(key('Shading'))))
  if (!shading || numberOf(shading, 'ShadingType') !== 2) return undefined
  const space = resolvedColorSpace(document, resolved(document, shading.get(key('ColorSpace')))).kind
  const channels = space === 'rgb' ? 3 : space === 'gray' ? 1 : 0
  const coords = arrayNumbers(shading, 'Coords')
  const matrix = arrayNumbers(pattern, 'Matrix') ?? IDENTITY_MATRIX
  const domain = arrayNumbers(shading, 'Domain') ?? [0, 1]
  const evaluate = functionEvaluator(document, shading.get(key('Function')), channels)
  if (!channels || coords?.length !== 4 || matrix.length !== 6 || domain.length !== 2 || !evaluate) return undefined
  const start = applyAffine(matrix, coords[0] ?? 0, coords[1] ?? 0)
  const end = applyAffine(matrix, coords[2] ?? 0, coords[3] ?? 0)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length2 = dx * dx + dy * dy
  if (!(length2 > 0)) return undefined
  return {
    axis: { start, end },
    channels,
    evaluate: (position) => evaluate((domain[0] ?? 0) + position * ((domain[1] ?? 1) - (domain[0] ?? 0))).map(clamp),
  }
}

function operations(stream: PDFRawStream, budget: ContentBudget): ContentOperation[] {
  const found: ContentOperation[] = []
  visitContentOperations(decodeContent(stream, budget), (operation) => found.push(operation))
  return found
}

function simplePaintStream(stream: PDFRawStream, budget: ContentBudget): boolean {
  const source = new TextDecoder('latin1').decode(decodeContent(stream, budget))
  return !/[()]/.test(source) && !/(?:^|\s)(?:BT|ET|Tj|TJ)(?:\s|$)/.test(source)
}

function paints(document: PDFDocument, stream: PDFRawStream, inherited: PDFDict | undefined, budget: ContentBudget): Paint[] {
  const resources = stream.dict.lookupMaybe(key('Resources'), PDFDict) ?? inherited
  const states = resources?.lookupMaybe(key('ExtGState'), PDFDict)
  const patterns = resources?.lookupMaybe(key('Pattern'), PDFDict)
  const xObjects = resources?.lookupMaybe(key('XObject'), PDFDict)
  const stack: Array<{ graphicsState?: PDFDict; pattern?: PDFObject }> = []
  let graphicsState: PDFDict | undefined
  let pattern: PDFObject | undefined
  const result: Paint[] = []
  for (const operation of operations(stream, budget)) {
    const name = operation.operands.at(-1)?.kind === 'name' ? operation.operands.at(-1)?.raw.slice(1) : undefined
    if (operation.operator === 'q') stack.push({ graphicsState, pattern })
    else if (operation.operator === 'Q') ({ graphicsState, pattern } = stack.pop() ?? {})
    else if (operation.operator === 'gs' && name) graphicsState = dictionaryOf(resolved(document, states?.get(key(name))))
    else if (['scn', 'SCN'].includes(operation.operator) && name) pattern = resolved(document, patterns?.get(key(name)))
    else if (operation.operator === 'Do' && name) result.push({ graphicsState, operation, xObject: resolved(document, xObjects?.get(key(name))) })
    else if (['f', 'f*', 'F'].includes(operation.operator)) result.push({ graphicsState, operation, pattern })
  }
  return result
}

function inspectForm(context: RuleCContext, stream: PDFRawStream): void {
  if (nameOf(stream.dict.get(key('Subtype'))) === 'Form' && effectFormStructure(stream.dict) === 'other') context.structure = 'other'
}

function inspectGraphicsState(context: RuleCContext, graphicsState: PDFDict | undefined): void {
  if (effectGraphicsStateStructure(graphicsState) === 'other') context.structure = 'other'
}

function singleLayer(document: PDFDocument, stream: PDFRawStream, budget: ContentBudget, context: RuleCContext, depth = 0): Layer | undefined {
  inspectForm(context, stream)
  if (depth > 12 || !simplePaintStream(stream, budget)) return undefined
  const items = paints(document, stream, undefined, budget)
  for (const item of items) inspectGraphicsState(context, item.graphicsState)
  if (items.length !== 1 || items[0]?.graphicsState?.has(key('SMask'))) return undefined
  const item = items[0]
  if (!item) return undefined
  if (item.pattern instanceof PDFDict) {
    const axial = axialLayer(document, item.pattern)
    if (axial) return axial
    if (item.pattern instanceof PDFRawStream) return singleLayer(document, item.pattern, budget, context, depth + 1)
  }
  return item.xObject instanceof PDFRawStream ? singleLayer(document, item.xObject, budget, context, depth + 1) : undefined
}

function transfer(document: PDFDocument, mask: PDFDict): 'identity' | 'invert' | undefined {
  const object = resolved(document, mask.get(key('TR')))
  if (!object || nameOf(object) === 'Identity') return 'identity'
  if (!(object instanceof PDFRawStream) || numberOf(object.dict, 'FunctionType') !== 4) return undefined
  const source = new TextDecoder('latin1').decode(object.contents).replace(/\s+/g, ' ').trim()
  return source === '{1 exch sub}' ? 'invert' : undefined
}

function mappedCoverage(coverage: Coverage, mapped: 'identity' | 'invert'): Coverage {
  if (mapped === 'identity') return coverage
  return coverage.kind === 'constant'
    ? { kind: 'constant', value: 1 - coverage.value }
    : { ...coverage, transfer: coverage.transfer === 'identity' ? 'invert' : 'identity' }
}

function scaledCoverage(coverage: Coverage, opacity: number): Coverage {
  return coverage.kind === 'constant' ? { kind: 'constant', value: coverage.value * opacity } : { ...coverage, opacity: coverage.opacity * opacity }
}

function maskCoverage(
  document: PDFDocument,
  mask: PDFDict,
  budget: ContentBudget,
  masks: PDFDict[],
  context: RuleCContext,
  depth: number,
): Coverage | undefined {
  masks.push(mask)
  const source = resolved(document, mask.get(key('G')))
  if (!(source instanceof PDFRawStream)) return undefined
  const mode = nameOf(mask.get(key('S')))
  const mapped = transfer(document, mask)
  if (!mapped) return undefined
  if (mode === 'Alpha') {
    const coverage = alphaCoverage(document, source, budget, masks, context, depth + 1)
    return coverage ? mappedCoverage(coverage, mapped) : undefined
  }
  if (mode !== 'Luminosity') return undefined
  const layer = singleLayer(document, source, budget, context, depth + 1)
  const gray =
    layer?.channels === 1 ||
    (layer?.channels === 3 &&
      [0, 0.5, 1].every((position) => {
        const sample = layer.evaluate(position)
        return sample.every((value) => Math.abs(value - (sample[0] ?? 0)) < 0.001)
      }))
  return layer && gray ? { kind: 'layer', layer, opacity: 1, transfer: mapped } : undefined
}

function alphaCoverage(
  document: PDFDocument,
  stream: PDFRawStream,
  budget: ContentBudget,
  masks: PDFDict[],
  context: RuleCContext,
  depth = 0,
): Coverage | undefined {
  inspectForm(context, stream)
  if (depth > 12 || !simplePaintStream(stream, budget)) return undefined
  const items = paints(document, stream, undefined, budget)
  for (const found of items) inspectGraphicsState(context, found.graphicsState)
  if (items.length !== 1) return undefined
  const item = items[0]
  if (!item) return undefined
  const opacity = effectOpacity(item.graphicsState)
  if (opacity === undefined) return undefined
  const mask = dictionaryOf(resolved(document, item.graphicsState?.get(key('SMask'))))
  if (mask) {
    const found = maskCoverage(document, mask, budget, masks, context, depth)
    return found ? scaledCoverage(found, opacity) : undefined
  }
  if (item.xObject instanceof PDFRawStream) {
    const found = alphaCoverage(document, item.xObject, budget, masks, context, depth + 1)
    return found ? scaledCoverage(found, opacity) : undefined
  }
  if (item.pattern instanceof PDFRawStream) {
    const found = alphaCoverage(document, item.pattern, budget, masks, context, depth + 1)
    return found ? scaledCoverage(found, opacity) : undefined
  }
  return item.pattern instanceof PDFDict || ['f', 'f*', 'F'].includes(item.operation.operator) ? { kind: 'constant', value: opacity } : undefined
}

function sameAxis(left: Axis, right: Axis): boolean {
  const lx = left.end.x - left.start.x
  const ly = left.end.y - left.start.y
  const rx = right.end.x - right.start.x
  const ry = right.end.y - right.start.y
  const scale = Math.hypot(lx, ly) * Math.hypot(rx, ry)
  if (!(scale > 0) || Math.abs(lx * ry - ly * rx) > scale * 0.0001) return false
  return Math.abs((right.start.x - left.start.x) * ly - (right.start.y - left.start.y) * lx) <= scale * 0.0001
}

function compositeCoverage(
  document: PDFDocument,
  items: Paint[],
  budget: ContentBudget,
  context: RuleCContext,
): { coverage: Coverage[]; masks: PDFDict[] } | undefined {
  if (items.length > MAX_EFFECT_COVERAGE_LAYERS) return undefined
  const masks: PDFDict[] = []
  const coverage: Coverage[] = []
  for (const item of items) {
    inspectGraphicsState(context, item.graphicsState)
    const opacity = effectOpacity(item.graphicsState)
    const mask = dictionaryOf(resolved(document, item.graphicsState?.get(key('SMask'))))
    const source = resolved(document, mask?.get(key('G')))
    if (opacity === undefined || !mask || !(source instanceof PDFRawStream) || nameOf(mask.get(key('S'))) !== 'Alpha') return undefined
    masks.push(mask)
    const found = alphaCoverage(document, source, budget, masks, context)
    const mapped = transfer(document, mask)
    if (!found || !mapped) return undefined
    coverage.push(scaledCoverage(mappedCoverage(found, mapped), opacity))
  }
  return { coverage, masks }
}

function candidate(context: RuleCContext, nested: boolean, oneAxis: RuleCFacts, plan?: RuleCPlan): RuleCCandidate {
  return { nested, oneAxis, plan, structure: context.structure }
}

export function ruleCPlan(document: PDFDocument, form: PDFRawStream, outerGraphicsState: PDFDict, budget: ContentBudget): RuleCCandidate {
  const context: RuleCContext = { structure: 'allowed' }
  inspectGraphicsState(context, outerGraphicsState)
  inspectForm(context, form)
  if (!simplePaintStream(form, budget)) return candidate(context, false, 'non-shading')
  const bbox = arrayNumbers(form.dict, 'BBox')
  const items = paints(document, form, undefined, budget)
  const nested = items.some((item) => dictionaryOf(resolved(document, item.graphicsState?.get(key('SMask')))) !== undefined)
  if (bbox?.length !== 4 || items.length < 1 || items.some((item) => !(item.xObject instanceof PDFRawStream))) return candidate(context, nested, 'non-shading')
  const colorObject = items[0]?.xObject
  if (!(colorObject instanceof PDFRawStream) || nameOf(colorObject.dict.get(key('Subtype'))) !== 'Form') return candidate(context, nested, 'non-shading')
  const color = singleLayer(document, colorObject, budget, context)
  if (color?.channels !== 3 || items.some((item) => item.xObject !== colorObject)) return candidate(context, nested, 'non-shading')
  const combined = compositeCoverage(document, items, budget, context)
  if (!combined) return candidate(context, nested, 'non-shading')
  const { coverage, masks } = combined
  const layers = coverage.filter((value): value is Extract<Coverage, { kind: 'layer' }> => value.kind === 'layer')
  if (layers.length === 0) return candidate(context, nested, 'non-shading')
  if (layers.some(({ layer }) => !sameAxis(color.axis, layer.axis))) return candidate(context, nested, 'different')
  const plan = { bbox, color, coverage, masks }
  return candidate(context, nested, 'shared', plan)
}

function positionOnAxis(axis: Axis, x: number, y: number): number {
  const dx = axis.end.x - axis.start.x
  const dy = axis.end.y - axis.start.y
  return ((x - axis.start.x) * dx + (y - axis.start.y) * dy) / (dx * dx + dy * dy)
}

export function buildRuleCImage(
  document: PDFDocument,
  plan: RuleCPlan,
  opacity: number,
  budget: ContentBudget,
  printMatrix: number[],
): { image: PDFRef; matrix: number[] } | undefined {
  const dx = plan.color.axis.end.x - plan.color.axis.start.x
  const dy = plan.color.axis.end.y - plan.color.axis.start.y
  const length = Math.hypot(dx, dy)
  if (!(length > 0)) return undefined
  const ux = dx / length
  const uy = dy / length
  const vx = -uy
  const vy = ux
  const [left = 0, bottom = 0, right = 0, top = 0] = plan.bbox
  const corners = [
    [left, bottom],
    [left, top],
    [right, bottom],
    [right, top],
  ]
  const along = corners.map(([x = 0, y = 0]) => x * ux + y * uy)
  const across = corners.map(([x = 0, y = 0]) => x * vx + y * vy)
  const amin = Math.min(...along)
  const amax = Math.max(...along)
  const vmin = Math.min(...across)
  const vmax = Math.max(...across)
  const printStart = applyAffine(printMatrix, plan.color.axis.start.x, plan.color.axis.start.y)
  const printEnd = applyAffine(printMatrix, plan.color.axis.end.x, plan.color.axis.end.y)
  const printScale = Math.hypot(printEnd.x - printStart.x, printEnd.y - printStart.y) / length
  const rows = Math.ceil(((amax - amin) * printScale) / SHADING_SAMPLE_SPACING_PT) + 1
  if (rows > MAX_SHADING_SAMPLES) return undefined
  const operations = rows * (1 + plan.coverage.length)
  if ((budget.calculatorOperations ?? 0) + operations > MAX_DOCUMENT_CALCULATOR_OPERATIONS) return undefined
  chargeShadingSamples(budget, rows, operations)
  const rgb = new Uint8Array(rows * 3)
  const gray = new Uint8Array(rows)
  for (let row = 0; row < rows; row++) {
    const distance = amin + ((amax - amin) * row) / Math.max(1, rows - 1)
    const x = ux * distance + vx * ((vmin + vmax) / 2)
    const y = uy * distance + vy * ((vmin + vmax) / 2)
    const colorPosition = positionOnAxis(plan.color.axis, x, y)
    const color = plan.color.evaluate(colorPosition)
    rgb.set(
      color.map((value) => Math.round(clamp(value) * 255)),
      (rows - row - 1) * 3,
    )
    let alpha = 0
    for (const coverage of plan.coverage) {
      let value = coverage.kind === 'constant' ? coverage.value : (coverage.layer.evaluate(positionOnAxis(coverage.layer.axis, x, y))[0] ?? 0)
      if (coverage.kind === 'layer' && coverage.transfer === 'invert') value = 1 - value
      if (coverage.kind === 'layer') value *= coverage.opacity
      alpha = alpha + clamp(value) * (1 - alpha)
    }
    gray[rows - row - 1] = Math.round(clamp(alpha * opacity) * 255)
  }
  const mask = document.context.register(
    document.context.stream(deflateSync(gray), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: rows,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
      Interpolate: true,
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const image = document.context.register(
    document.context.stream(deflateSync(rgb), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: rows,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Interpolate: true,
      Filter: 'Fl' + 'ateDecode',
      SMask: mask,
      [GENERATED_EFFECT_IMAGE_KEY]: true,
    }),
  )
  return { image, matrix: [vx * (vmax - vmin), vy * (vmax - vmin), ux * (amax - amin), uy * (amax - amin), vx * vmin + ux * amin, vy * vmin + uy * amin] }
}
