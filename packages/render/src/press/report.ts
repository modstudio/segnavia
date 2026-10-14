import { PDFDict, PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { inspectContent } from './content.ts'
import { type ContentBudget, decodeContent, nameOf, numberOf, resolvedColorSpace } from './pdf-objects.ts'
import { type FunctionDecision, groupAction, shadingAction } from './policy.ts'
import type { PressImage, PressReport } from './types.ts'
import { walkPressGraph } from './visitor.ts'

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
  if (space.kind !== 'rgb') return
  const width = requiredDimension(numberOf(image.dict, 'Width'), 'Width')
  const height = requiredDimension(numberOf(image.dict, 'Height'), 'Height')
  state.report.images.push({ width, height, colorSpace: space.label as PressImage['colorSpace'] })
}

function inspectFunction(state: ReportState, fn: PDFDict | undefined, policy: FunctionDecision): void {
  if (policy.action === 'refuse') refuse(policy.found, policy.supported)
  if (fn && numberOf(fn, 'FunctionType') === 2) state.report.gradientStops += 2
}

function inspectShading(state: ReportState, shading: PDFDict): boolean {
  if (state.shadings.has(shading)) return false
  state.shadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  const policy = shadingAction(space.kind, type)
  if (policy.action === 'refuse' || policy.action === 'convert') refuse(`ShadingType ${type ?? 'missing'} color space ${space.label}`, policy.supported)
  return true
}

function inspectGroup(state: ReportState, owner: PDFDict, maskSource: boolean): void {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.groups.has(group)) return
  state.groups.add(group)
  const space = resolvedColorSpace(state.document, resolved(state, group.get(key('CS'))))
  const policy = groupAction(space.kind, space.label, maskSource)
  if (policy.action !== 'keep') refuse(`transparency group color space ${space.label}`, policy.supported)
  if (space.kind === 'cmyk') state.report.groups++
}

export async function inspectPressPdf(bytes: Uint8Array): Promise<PressReport> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const state: ReportState = {
    budget: { decodedBytes: 0 },
    document,
    groups: new WeakSet(),
    images: new WeakSet(),
    report: { images: [], fills: 0, strokes: 0, gradientStops: 0, groups: 0 },
    shadings: new WeakSet(),
  }
  walkPressGraph(document, {
    content: (_object, stream) => {
      const counts = inspectContent(decodeContent(stream, state.budget))
      state.report.fills += counts.fills
      state.report.strokes += counts.strokes
    },
    function: (fn, decision) => inspectFunction(state, fn, decision),
    group: (owner, _stream, maskSource) => inspectGroup(state, owner, maskSource),
    image: (image) => inspectImage(state, image),
    shading: (shading) => inspectShading(state, shading),
  })
  return state.report
}
