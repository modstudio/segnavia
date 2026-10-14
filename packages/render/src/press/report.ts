import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { inspectContent } from './content.ts'
import { decodeContent, dictionaryOf, nameOf, numberOf, rawStreamOf, resolvedColorSpace } from './pdf-objects.ts'
import type { PressImage, PressReport } from './types.ts'

interface ReportState {
  document: PDFDocument
  functions: WeakSet<PDFDict>
  groups: WeakSet<PDFDict>
  maskSources: WeakSet<PDFRawStream>
  resources: WeakSet<PDFDict>
  shadings: WeakSet<PDFDict>
  streams: WeakSet<PDFRawStream>
  contentStreams: WeakSet<PDFRawStream>
}

const key = (name: string): PDFName => PDFName.of(name)
function refuse(found: string, supported: string): never {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const resolved = (state: ReportState, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? state.document.context.lookup(object) : object
const dictionary = (state: ReportState, object: PDFObject | undefined): PDFDict | undefined => dictionaryOf(resolved(state, object))
const stream = (state: ReportState, object: PDFObject | undefined): PDFRawStream | undefined => rawStreamOf(resolved(state, object))

function inspectImage(state: ReportState, image: PDFRawStream, report: PressReport): void {
  if (state.streams.has(image)) return
  state.streams.add(image)
  const space = resolvedColorSpace(state.document, resolved(state, image.dict.get(key('ColorSpace'))))
  if (space.kind !== 'rgb') return
  const width = numberOf(image.dict, 'Width')
  const height = numberOf(image.dict, 'Height')
  if (width === undefined || height === undefined) refuse('RGB image without pixel dimensions', 'Width and Height numbers')
  report.images.push({ width, height, colorSpace: space.label as PressImage['colorSpace'] })
}

function functionStops(state: ReportState, object: PDFObject | undefined): number {
  const fn = dictionary(state, object)
  if (!fn || state.functions.has(fn)) return 0
  state.functions.add(fn)
  const type = numberOf(fn, 'FunctionType')
  if (type === 2) return 2
  if (type !== 3) return refuse(`shading FunctionType ${type ?? 'missing'}`, 'FunctionType 2 or 3')
  const functions = fn.lookupMaybe(key('Functions'), PDFArray)
  if (!functions) return refuse('FunctionType 3 without Functions', 'a Functions array')
  let count = 0
  for (let index = 0; index < functions.size(); index++) count += functionStops(state, functions.get(index))
  return count
}

function inspectShading(state: ReportState, shading: PDFDict, report: PressReport): void {
  if (!shading.has(key('ShadingType')) || state.shadings.has(shading)) return
  state.shadings.add(shading)
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  if (space.kind === 'rgb') refuse(`RGB shading color space ${space.label}`, 'DeviceCMYK')
  if (space.kind === 'cmyk') report.gradientStops += functionStops(state, shading.get(key('Function')))
}

function inspectGroup(state: ReportState, owner: PDFDict, report: PressReport, streamOwner?: PDFRawStream): void {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.groups.has(group)) return
  state.groups.add(group)
  const space = resolvedColorSpace(state.document, resolved(state, group.get(key('CS'))))
  if (space.kind === 'rgb' && space.label !== 'DeviceRGB')
    refuse(`transparency group color space ${space.label}`, 'DeviceCMYK, DeviceGray, DeviceRGB mask source, or no declared space')
  if (space.kind === 'rgb' && (!streamOwner || !state.maskSources.has(streamOwner)))
    refuse(`RGB transparency group color space ${space.label}`, 'DeviceCMYK or DeviceGray')
  if (space.kind === 'other' && space.label !== 'missing')
    refuse(`transparency group color space ${space.label}`, 'DeviceCMYK, DeviceGray, or no declared space')
  if (space.kind === 'cmyk') report.groups++
}

function inspectResources(state: ReportState, resources: PDFDict | undefined, report: PressReport): void {
  if (!resources || state.resources.has(resources)) return
  state.resources.add(resources)
  const shadings = resources.lookupMaybe(key('Shading'), PDFDict)
  for (const [, object] of shadings?.entries() ?? []) {
    const found = dictionary(state, object)
    if (found) inspectShading(state, found, report)
  }
  inspectPatterns(state, resources.lookupMaybe(key('Pattern'), PDFDict), report)
  inspectMasks(state, resources.lookupMaybe(key('ExtGState'), PDFDict), report)
  inspectXObjects(state, resources.lookupMaybe(key('XObject'), PDFDict), report)
  inspectFonts(state, resources.lookupMaybe(key('Font'), PDFDict), report)
}

function inspectPatterns(state: ReportState, patterns: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of patterns?.entries() ?? []) {
    const pattern = dictionary(state, object)
    if (!pattern) continue
    inspectOneContent(state, stream(state, object), report)
    const shading = dictionary(state, pattern.get(key('Shading')))
    if (shading) inspectShading(state, shading, report)
    inspectResources(state, pattern.lookupMaybe(key('Resources'), PDFDict), report)
  }
}

function inspectXObjects(state: ReportState, xObjects: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of xObjects?.entries() ?? []) {
    const found = stream(state, object)
    if (!found) continue
    if (nameOf(found.dict.get(key('Subtype'))) === 'Image') inspectImage(state, found, report)
    else {
      inspectOneContent(state, found, report)
      inspectGroup(state, found.dict, report, found)
      inspectResources(state, found.dict.lookupMaybe(key('Resources'), PDFDict), report)
    }
  }
}

function inspectMasks(state: ReportState, states: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of states?.entries() ?? []) {
    const mask = dictionary(state, dictionary(state, object)?.get(key('SMask')))
    const found = stream(state, mask?.get(key('G')))
    if (!found) continue
    state.maskSources.add(found)
    inspectOneContent(state, found, report)
    inspectGroup(state, found.dict, report, found)
    inspectResources(state, found.dict.lookupMaybe(key('Resources'), PDFDict), report)
  }
}

function inspectOneContent(state: ReportState, found: PDFRawStream | undefined, report: PressReport): void {
  if (!found || state.contentStreams.has(found) || nameOf(found.dict.get(key('Subtype'))) === 'Image') return
  state.contentStreams.add(found)
  const counts = inspectContent(decodeContent(found))
  report.fills += counts.fills
  report.strokes += counts.strokes
}

function inspectFonts(state: ReportState, fonts: PDFDict | undefined, report: PressReport): void {
  for (const [, fontObject] of fonts?.entries() ?? []) {
    const font = dictionary(state, fontObject)
    if (!font || nameOf(font.get(key('Subtype'))) !== 'Type3') continue
    const charProcs = font.lookupMaybe(key('CharProcs'), PDFDict)
    for (const [, charObject] of charProcs?.entries() ?? []) {
      const glyph = stream(state, charObject)
      inspectOneContent(state, glyph, report)
      inspectResources(state, glyph?.dict.lookupMaybe(key('Resources'), PDFDict), report)
    }
    inspectResources(state, font.lookupMaybe(key('Resources'), PDFDict), report)
  }
}

function inspectPageContent(state: ReportState, report: PressReport): void {
  for (const page of state.document.getPages()) {
    const contents = page.node.Contents()
    if (contents instanceof PDFArray) for (let index = 0; index < contents.size(); index++) inspectOneContent(state, stream(state, contents.get(index)), report)
    else inspectOneContent(state, stream(state, contents), report)
  }
}

export async function inspectPressPdf(bytes: Uint8Array): Promise<PressReport> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const state: ReportState = {
    document,
    contentStreams: new WeakSet(),
    functions: new WeakSet(),
    groups: new WeakSet(),
    maskSources: new WeakSet(),
    resources: new WeakSet(),
    shadings: new WeakSet(),
    streams: new WeakSet(),
  }
  const report: PressReport = { images: [], fills: 0, strokes: 0, gradientStops: 0, groups: 0 }
  for (const page of document.getPages()) {
    inspectGroup(state, page.node, report)
    inspectResources(state, page.node.Resources(), report)
  }
  inspectPageContent(state, report)
  return report
}
