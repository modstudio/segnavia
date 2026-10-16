import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { inspectContent } from './content.ts'
import { type ContentBudget, decodeContent, dictionaryOf, nameOf, numberOf, rawStreamOf, resolvedColorSpace } from './pdf-objects.ts'
import { type FunctionDecision, groupAction, shadingAction } from './policy.ts'
import type { PressDestination, PressImage, PressReport } from './types.ts'
import { type MaskContext, walkPressGraph } from './visitor.ts'

interface ReportState {
  budget: ContentBudget
  document: PDFDocument
  groups: WeakSet<PDFDict>
  images: WeakSet<PDFRawStream>
  report: PressReport
  shadings: WeakSet<PDFDict>
}

const key = (name: string): PDFName => PDFName.of(name)
const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const resolved = (state: ReportState, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? state.document.context.lookup(object) : object
const requiredDimension = (value: number | undefined, name: string): number => value ?? refuse(`RGB image ${name} missing`, `a ${name} number`)

function inspectImage(state: ReportState, image: PDFRawStream): void {
  if (state.images.has(image)) return
  state.images.add(image)
  const space = resolvedColorSpace(state.document, resolved(state, image.dict.get(key('ColorSpace'))))
  if (state.report.destination === 'gray' && (space.kind === 'rgb' || space.kind === 'cmyk'))
    refuse(`image color space ${space.label}`, 'DeviceGray or Indexed over DeviceGray')
  if (space.kind !== 'rgb') return
  const width = requiredDimension(numberOf(image.dict, 'Width'), 'Width')
  const height = requiredDimension(numberOf(image.dict, 'Height'), 'Height')
  state.report.images.push({ width, height, colorSpace: space.label as PressImage['colorSpace'] })
}

function inspectFunction(state: ReportState, fn: PDFDict | undefined, policy: FunctionDecision, _mask: MaskContext): void {
  if (policy.action === 'refuse') refuse(policy.found, policy.supported)
  if (fn && numberOf(fn, 'FunctionType') === 2) state.report.gradientStops += 2
}

function inspectShading(state: ReportState, shading: PDFDict, _mask: MaskContext): boolean {
  if (state.shadings.has(shading)) return false
  state.shadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  const fn = dictionaryOf(resolved(state, shading.get(key('Function'))))
  const functionType = fn ? numberOf(fn, 'FunctionType') : undefined
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  const destination = state.report.destination
  const policy = shadingAction(space.kind, type, functionType, destination)
  if (policy.action !== 'keep') {
    if (type === 1) refuse(`ShadingType 1 FunctionType ${functionType ?? 'missing'} color space ${space.label}`, policy.supported)
    refuse(`ShadingType ${type ?? 'missing'} color space ${space.label}`, policy.supported)
  }
  if (type === 1) {
    state.report.sampledShadings++
    return false
  }
  return true
}

function inspectGroup(state: ReportState, owner: PDFDict, mask: MaskContext): void {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.groups.has(group)) return
  state.groups.add(group)
  const space = resolvedColorSpace(state.document, resolved(state, group.get(key('CS'))))
  const destination = state.report.destination
  const policy = groupAction(space.kind, space.label, mask !== 'none', destination)
  if (policy.action !== 'keep') refuse(`transparency group color space ${space.label}`, policy.supported)
  if (space.kind === destination) state.report.groups++
}

function outputDestination(document: PDFDocument): PressDestination {
  const intents = document.catalog.lookupMaybe(key('OutputIntents'), PDFArray)
  const intent = intents?.lookup(0, PDFDict)
  const profile = rawStreamOf(intent?.get(key('DestOutputProfile')) ? document.context.lookup(intent.get(key('DestOutputProfile')) as PDFObject) : undefined)
  return profile && numberOf(profile.dict, 'N') === 1 ? 'gray' : 'cmyk'
}

export async function inspectPressPdf(bytes: Uint8Array, requested?: PressDestination): Promise<PressReport> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const destination = requested ?? outputDestination(document)
  const state: ReportState = {
    budget: { decodedBytes: 0 },
    document,
    groups: new WeakSet(),
    images: new WeakSet(),
    report: { destination, images: [], convertedImages: 0, fills: 0, strokes: 0, gradientStops: 0, sampledShadings: 0, groups: 0, neutralColors: 0 },
    shadings: new WeakSet(),
  }
  walkPressGraph(document, {
    content: (_object, stream) => {
      const counts = inspectContent(decodeContent(stream, state.budget), destination)
      state.report.fills += counts.fills
      state.report.strokes += counts.strokes
    },
    function: (fn, decision, mask) => inspectFunction(state, fn, decision, mask),
    group: (owner, _stream, mask) => inspectGroup(state, owner, mask),
    image: (image) => inspectImage(state, image),
    shading: (shading, _pattern, mask) => inspectShading(state, shading, mask),
  })
  return state.report
}
