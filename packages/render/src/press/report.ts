import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, type PDFObject, type PDFRawStream, PDFRef } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { rewriteContent } from './content.ts'
import { dictionaryOf, nameOf, numberOf, rawStreamOf } from './pdf-objects.ts'
import type { PressImage, PressReport } from './types.ts'

interface ReportState {
  document: PDFDocument
  functions: WeakSet<PDFDict>
  groups: WeakSet<PDFDict>
  resources: WeakSet<PDFDict>
  shadings: WeakSet<PDFDict>
  streams: WeakSet<PDFRawStream>
}

const key = (name: string): PDFName => PDFName.of(name)
function refuse(found: string, supported: string): never {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const resolved = (state: ReportState, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? state.document.context.lookup(object) : object
const dictionary = (state: ReportState, object: PDFObject | undefined): PDFDict | undefined => dictionaryOf(resolved(state, object))
const stream = (state: ReportState, object: PDFObject | undefined): PDFRawStream | undefined => rawStreamOf(resolved(state, object))

function colorSpace(state: ReportState, object: PDFObject | undefined): PressImage['colorSpace'] | 'DeviceGray' | 'DeviceCMYK' | undefined {
  const value = resolved(state, object)
  const name = nameOf(value)
  if (name === 'DeviceRGB' || name === 'CalRGB' || name === 'DeviceGray' || name === 'DeviceCMYK') return name
  if (!(value instanceof PDFArray)) return undefined
  const family = nameOf(resolved(state, value.get(0)))
  if (family === 'ICCBased') {
    const profile = stream(state, value.get(1))
    return profile?.dict.lookupMaybe(key('N'), PDFNumber)?.asNumber() === 3 ? 'ICCBased' : undefined
  }
  if (family === 'Indexed') {
    const base = colorSpace(state, value.get(1))
    return base === 'DeviceRGB' || base === 'CalRGB' || base === 'ICCBased' || base === 'Indexed' ? 'Indexed' : undefined
  }
  return undefined
}

const isRgb = (space: ReturnType<typeof colorSpace>): boolean => space === 'DeviceRGB' || space === 'CalRGB' || space === 'ICCBased' || space === 'Indexed'

function inspectImage(state: ReportState, image: PDFRawStream, report: PressReport): void {
  if (state.streams.has(image)) return
  state.streams.add(image)
  const space = colorSpace(state, image.dict.get(key('ColorSpace')))
  if (!isRgb(space)) return
  const width = numberOf(image.dict, 'Width')
  const height = numberOf(image.dict, 'Height')
  if (width === undefined || height === undefined) refuse('RGB image without pixel dimensions', 'Width and Height numbers')
  report.images.push({ width, height, colorSpace: space as PressImage['colorSpace'] })
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
  const space = colorSpace(state, shading.get(key('ColorSpace')))
  if (isRgb(space)) refuse(`RGB shading color space ${space}`, 'DeviceCMYK')
  if (space === 'DeviceCMYK') report.gradientStops += functionStops(state, shading.get(key('Function')))
}

function inspectGroup(state: ReportState, owner: PDFDict, report: PressReport): void {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.groups.has(group)) return
  state.groups.add(group)
  const space = colorSpace(state, group.get(key('CS')))
  if (isRgb(space)) refuse(`RGB transparency group color space ${space}`, 'DeviceCMYK or DeviceGray')
  if (space === 'DeviceCMYK') report.groups++
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
  inspectXObjects(state, resources.lookupMaybe(key('XObject'), PDFDict), report)
  inspectMasks(state, resources.lookupMaybe(key('ExtGState'), PDFDict), report)
}

function inspectPatterns(state: ReportState, patterns: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of patterns?.entries() ?? []) {
    const pattern = dictionary(state, object)
    if (!pattern) continue
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
      inspectGroup(state, found.dict, report)
      inspectResources(state, found.dict.lookupMaybe(key('Resources'), PDFDict), report)
    }
  }
}

function inspectMasks(state: ReportState, states: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of states?.entries() ?? []) {
    const mask = dictionary(state, dictionary(state, object)?.get(key('SMask')))
    const found = stream(state, mask?.get(key('G')))
    if (!found) continue
    inspectGroup(state, found.dict, report)
    inspectResources(state, found.dict.lookupMaybe(key('Resources'), PDFDict), report)
  }
}

function decoded(content: PDFRawStream): Uint8Array {
  const filter = content.dict.get(key('Filter'))
  if (filter && nameOf(filter) !== 'Fl' + 'ateDecode') return refuse(`content stream filter ${filter.toString()}`, 'Fl' + 'ateDecode or no filter')
  return filter ? decodePDFRawStream(content).decode() : content.contents
}

function inspectContent(state: ReportState, report: PressReport): void {
  const seen = new WeakSet<PDFRawStream>()
  const one = (object: PDFObject | undefined): void => {
    const found = stream(state, object)
    if (!found || seen.has(found) || nameOf(found.dict.get(key('Subtype'))) === 'Image') return
    seen.add(found)
    const counts = rewriteContent(decoded(found), () => refuse('RGB color operator after conversion', 'CMYK operators')).counts
    report.fills += counts.fills
    report.strokes += counts.strokes
  }
  for (const page of state.document.getPages()) {
    const contents = page.node.Contents()
    if (contents instanceof PDFArray) for (let index = 0; index < contents.size(); index++) one(contents.get(index))
    else one(contents)
  }
  for (const [, object] of state.document.context.enumerateIndirectObjects()) {
    const found = rawStreamOf(object)
    if (found && (nameOf(found.dict.get(key('Subtype'))) === 'Form' || numberOf(found.dict, 'PatternType') === 1)) one(found)
  }
}

export async function inspectPressPdf(bytes: Uint8Array): Promise<PressReport> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const state: ReportState = {
    document,
    functions: new WeakSet(),
    groups: new WeakSet(),
    resources: new WeakSet(),
    shadings: new WeakSet(),
    streams: new WeakSet(),
  }
  const report: PressReport = { images: [], fills: 0, strokes: 0, gradientStops: 0, groups: 0 }
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const found = dictionaryOf(object)
    if (found) {
      inspectShading(state, found, report)
      inspectGroup(state, found, report)
    }
  }
  for (const page of document.getPages()) inspectResources(state, page.node.Resources(), report)
  inspectContent(state, report)
  return report
}

export async function pressPdfContainsBlackInk(bytes: Uint8Array): Promise<boolean> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const found = rawStreamOf(object)
    if (!found || nameOf(found.dict.get(key('Subtype'))) === 'Image') continue
    try {
      if (/(?:^|\s)0 0 0 1 k(?:\s|$)/.test(new TextDecoder().decode(decodePDFRawStream(found).decode()))) return true
    } catch {
      // Non-content streams may use filters that this diagnostic does not read.
    }
  }
  return false
}
