import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import type { Color3, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor } from './color-policy.ts'
import { rewriteContent } from './content.ts'
import { arrayNumbers, dictionaryOf, nameOf, numberOf, rawStreamOf, replaceArray } from './pdf-objects.ts'
import type { PressImage, PressReport } from './types.ts'

interface RewriteState {
  convert: ReturnType<typeof cachedPressColor>
  document: PDFDocument
  luminosity: WeakSet<PDFRawStream>
  profile: Profile
  seenFunctions: WeakSet<PDFDict>
  seenGroups: WeakSet<PDFDict>
  seenResources: WeakSet<PDFDict>
  seenShadings: WeakSet<PDFDict>
  seenStreams: WeakSet<PDFRawStream>
}

const key = (name: string): PDFName => PDFName.of(name)

function refusal(found: string, supported: string): never {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}

function resolved(state: RewriteState, object: PDFObject | undefined): PDFObject | undefined {
  return object instanceof PDFRef ? state.document.context.lookup(object) : object
}

function rawResolved(state: RewriteState, object: PDFObject | undefined): PDFRawStream | undefined {
  return rawStreamOf(resolved(state, object))
}

function dictResolved(state: RewriteState, object: PDFObject | undefined): PDFDict | undefined {
  return dictionaryOf(resolved(state, object))
}

function colorSpaceKind(state: RewriteState, object: PDFObject | undefined): PressImage['colorSpace'] | 'DeviceGray' | 'DeviceCMYK' | undefined {
  const value = resolved(state, object)
  const name = nameOf(value)
  if (name === 'DeviceRGB' || name === 'CalRGB' || name === 'DeviceGray' || name === 'DeviceCMYK') return name
  if (!(value instanceof PDFArray)) return undefined
  const family = nameOf(resolved(state, value.get(0)))
  if (family === 'ICCBased') {
    const profile = rawResolved(state, value.get(1))
    return profile?.dict.lookupMaybe(key('N'), PDFNumber)?.asNumber() === 3 ? 'ICCBased' : undefined
  }
  if (family === 'Indexed') {
    const base = colorSpaceKind(state, value.get(1))
    return base === 'DeviceRGB' || base === 'CalRGB' || base === 'ICCBased' || base === 'Indexed' ? 'Indexed' : undefined
  }
  return undefined
}

function convertFunction(state: RewriteState, object: PDFObject | undefined): number {
  const fn = dictResolved(state, object)
  if (!fn) return refusal('shading function that is not a dictionary or stream', 'FunctionType 2 or 3')
  if (state.seenFunctions.has(fn)) return 0
  state.seenFunctions.add(fn)
  const type = numberOf(fn, 'FunctionType')
  if (type === 2) {
    let stops = 0
    for (const name of ['C0', 'C1']) {
      const rgb = arrayNumbers(fn, name, 3) as Color3
      replaceArray(fn, name, state.convert(rgb))
      stops++
    }
    return stops
  }
  if (type !== 3) return refusal(`shading FunctionType ${type ?? 'missing'}`, 'FunctionType 2 or 3')
  const functions = fn.lookupMaybe(key('Functions'), PDFArray)
  if (!functions) return refusal('FunctionType 3 without Functions', 'a Functions array of FunctionType 2 or 3 functions')
  let stops = 0
  for (let index = 0; index < functions.size(); index++) stops += convertFunction(state, functions.get(index))
  return stops
}

function convertShading(state: RewriteState, object: PDFObject | undefined): number {
  const shading = dictResolved(state, object)
  if (!shading) return refusal('shading that is not a dictionary or stream', 'a ShadingType 2 or 3 dictionary')
  if (state.seenShadings.has(shading)) return 0
  state.seenShadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  if (type !== 2 && type !== 3) return refusal(`ShadingType ${type ?? 'missing'}`, 'ShadingType 2 or 3')
  const space = colorSpaceKind(state, shading.get(key('ColorSpace')))
  if (space === 'DeviceCMYK') return 0
  if (space !== 'DeviceRGB') return refusal(`shading color space ${space ?? shading.get(key('ColorSpace'))?.toString() ?? 'missing'}`, 'DeviceRGB')
  const stops = convertFunction(state, shading.get(key('Function')))
  shading.set(key('ColorSpace'), key('DeviceCMYK'))
  return stops
}

function copyStreamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = {}
  for (const [name, value] of stream.dict.entries()) {
    const text = name.toString().slice(1)
    if (!['Filter', 'DecodeParms', 'Length'].includes(text)) dictionary[text] = value
  }
  return dictionary
}

function decodedContent(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.get(key('Filter'))
  if (filter && nameOf(filter) !== 'FlateDecode') refusal(`content stream filter ${filter.toString()}`, 'FlateDecode or no filter')
  try {
    return filter ? decodePDFRawStream(stream).decode() : stream.contents
  } catch (error) {
    return refusal(`content stream that could not be decoded (${(error as Error).message})`, 'a valid FlateDecode or unfiltered stream')
  }
}

function replaceTarget(state: RewriteState, original: PDFObject, replacement: PDFRawStream, setDirect: (stream: PDFRawStream) => void): void {
  const reference = original instanceof PDFRef ? original : state.document.context.getObjectRef(original)
  if (reference) state.document.context.assign(reference, replacement)
  else setDirect(replacement)
}

function convertGroup(state: RewriteState, stream: PDFRawStream): number {
  const group = stream.dict.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.seenGroups.has(group)) return 0
  state.seenGroups.add(group)
  const space = colorSpaceKind(state, group.get(key('CS')))
  if (state.luminosity.has(stream)) {
    if (space !== 'DeviceGray') refusal(`luminosity mask group color space ${space ?? 'missing'}`, 'DeviceGray')
    return 0
  }
  if (space && space !== 'DeviceRGB' && space !== 'DeviceCMYK')
    refusal(`transparency group color space ${space}`, 'DeviceRGB, DeviceCMYK, or no declared space')
  if (space === 'DeviceCMYK') return 0
  group.set(key('CS'), key('DeviceCMYK'))
  return 1
}

function markLuminosityMasks(state: RewriteState): void {
  for (const [, object] of state.document.context.enumerateIndirectObjects()) {
    const dictionary = dictionaryOf(object)
    const mask = dictionary ? dictResolved(state, dictionary.get(key('SMask'))) : undefined
    if (!mask || nameOf(mask.get(key('S'))) !== 'Luminosity') continue
    const source = rawResolved(state, mask.get(key('G')))
    if (source) state.luminosity.add(source)
  }
}

function convertStream(state: RewriteState, object: PDFObject, setDirect: (stream: PDFRawStream) => void): { fills: number; groups: number; strokes: number } {
  const stream = rawResolved(state, object)
  if (!stream || state.seenStreams.has(stream)) return { fills: 0, strokes: 0, groups: 0 }
  state.seenStreams.add(stream)
  const groups = convertGroup(state, stream)
  const rewritten = rewriteContent(decodedContent(stream), state.convert)
  const replacement = state.document.context.flateStream(rewritten.bytes, copyStreamDictionary(stream))
  state.seenStreams.add(replacement)
  replaceTarget(state, object, replacement, setDirect)
  return { ...rewritten.counts, groups }
}

interface Totals {
  fills: number
  gradientStops: number
  groups: number
  strokes: number
}

const emptyTotals = (): Totals => ({ fills: 0, strokes: 0, gradientStops: 0, groups: 0 })
const add = (totals: Totals, values: Partial<Totals>): void => {
  for (const name of ['fills', 'strokes', 'gradientStops', 'groups'] as const) totals[name] += values[name] ?? 0
}

function walkResources(state: RewriteState, resources: PDFDict | undefined, totals: Totals): void {
  if (!resources || state.seenResources.has(resources)) return
  state.seenResources.add(resources)
  const shadings = resources.lookupMaybe(key('Shading'), PDFDict)
  for (const [, shading] of shadings?.entries() ?? []) totals.gradientStops += convertShading(state, shading)
  const graphicsStates = resources.lookupMaybe(key('ExtGState'), PDFDict)
  markResourceLuminosityMasks(state, graphicsStates)
  walkPatterns(state, resources.lookupMaybe(key('Pattern'), PDFDict), totals)
  walkXObjects(state, resources.lookupMaybe(key('XObject'), PDFDict), totals)
  walkSoftMasks(state, graphicsStates, totals)
}

function markResourceLuminosityMasks(state: RewriteState, states: PDFDict | undefined): void {
  for (const [, stateObject] of states?.entries() ?? []) {
    const mask = dictResolved(state, dictResolved(state, stateObject)?.get(key('SMask')))
    if (!mask || nameOf(mask.get(key('S'))) !== 'Luminosity') continue
    const source = rawResolved(state, mask.get(key('G')))
    if (source) state.luminosity.add(source)
  }
}

function walkPatterns(state: RewriteState, patterns: PDFDict | undefined, totals: Totals): void {
  for (const [name, patternObject] of patterns?.entries() ?? []) {
    const pattern = rawResolved(state, patternObject)
    const dictionary = dictResolved(state, patternObject)
    if (!dictionary) continue
    if (numberOf(dictionary, 'PatternType') === 2) totals.gradientStops += convertShading(state, dictionary.get(key('Shading')))
    else if (pattern)
      add(
        totals,
        convertStream(state, patternObject, (replacement) => patterns?.set(name, replacement)),
      )
    walkResources(state, dictionary.lookupMaybe(key('Resources'), PDFDict), totals)
  }
}

function walkXObjects(state: RewriteState, xObjects: PDFDict | undefined, totals: Totals): void {
  for (const [name, object] of xObjects?.entries() ?? []) {
    const stream = rawResolved(state, object)
    if (!stream || nameOf(stream.dict.get(key('Subtype'))) === 'Image') continue
    add(
      totals,
      convertStream(state, object, (replacement) => xObjects?.set(name, replacement)),
    )
    walkResources(state, stream.dict.lookupMaybe(key('Resources'), PDFDict), totals)
  }
}

function walkSoftMasks(state: RewriteState, states: PDFDict | undefined, totals: Totals): void {
  for (const [, stateObject] of states?.entries() ?? []) {
    const mask = dictResolved(state, dictResolved(state, stateObject)?.get(key('SMask')))
    const sourceObject = mask?.get(key('G'))
    const source = rawResolved(state, sourceObject)
    if (!source || !sourceObject) continue
    add(
      totals,
      convertStream(state, sourceObject, () => refusal('direct soft-mask stream', 'an indirect soft-mask stream')),
    )
    walkResources(state, source.dict.lookupMaybe(key('Resources'), PDFDict), totals)
  }
}

function rewriteDocument(state: RewriteState): Totals {
  const totals = emptyTotals()
  markLuminosityMasks(state)
  for (const page of state.document.getPages()) {
    const contents = page.node.Contents()
    if (contents instanceof PDFArray) {
      for (let index = 0; index < contents.size(); index++) {
        const object = contents.get(index)
        add(
          totals,
          convertStream(state, object, (replacement) => contents.set(index, replacement)),
        )
      }
    } else if (contents)
      add(
        totals,
        convertStream(state, contents, (replacement) => page.node.set(key('Contents'), replacement)),
      )
    walkResources(state, page.node.Resources(), totals)
  }
  return totals
}

function addOutputIntent(document: PDFDocument, profile: Uint8Array): void {
  const profileStream = document.context.flateStream(profile, { N: 4 })
  const profileRef = document.context.register(profileStream)
  const intent = document.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of('Custom'),
    DestOutputProfile: profileRef,
  })
  const intentRef = document.context.register(intent)
  document.catalog.set(key('OutputIntents'), document.context.obj([intentRef]))
}

function newState(document: PDFDocument, profile: Profile): RewriteState {
  return {
    document,
    profile,
    convert: cachedPressColor(profile),
    luminosity: new WeakSet(),
    seenFunctions: new WeakSet(),
    seenGroups: new WeakSet(),
    seenResources: new WeakSet(),
    seenShadings: new WeakSet(),
    seenStreams: new WeakSet(),
  }
}

export async function rewritePressPdf(bytes: Uint8Array, profileBytes: Uint8Array): Promise<{ bytes: Uint8Array; report: PressReport }> {
  try {
    const profile = readProfile(profileBytes)
    if (profile.colorSpace !== 'CMYK') refusal(`press profile color space ${profile.colorSpace}`, 'CMYK')
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    rewriteDocument(newState(document, profile))
    addOutputIntent(document, profileBytes)
    const output = await document.save()
    return { bytes: output, report: await inspectPressPdf(output) }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError((error as Error).message)
  }
}

function imageReport(state: RewriteState, stream: PDFRawStream): PressImage | undefined {
  const colorSpace = colorSpaceKind(state, stream.dict.get(key('ColorSpace')))
  if (!colorSpace || colorSpace === 'DeviceGray' || colorSpace === 'DeviceCMYK') return undefined
  const width = numberOf(stream.dict, 'Width')
  const height = numberOf(stream.dict, 'Height')
  if (width === undefined || height === undefined) refusal('RGB image without pixel dimensions', 'Width and Height numbers')
  return { width, height, colorSpace }
}

export async function inspectPressPdf(bytes: Uint8Array): Promise<PressReport> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const state = newState(document, {} as Profile)
  const report: PressReport = { images: [], fills: 0, strokes: 0, gradientStops: 0, groups: 0 }
  for (const [, object] of document.context.enumerateIndirectObjects()) inspectObject(state, object, report)
  for (const page of document.getPages()) inspectResources(state, page.node.Resources(), report)
  const totals = inspectPageStreams(state)
  report.fills = totals.fills
  report.strokes = totals.strokes
  return report
}

export async function pressPdfContainsBlackInk(bytes: Uint8Array): Promise<boolean> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const stream = rawStreamOf(object)
    if (!stream || nameOf(stream.dict.get(key('Subtype'))) === 'Image') continue
    try {
      if (/(?:^|\s)0 0 0 1 k(?:\s|$)/.test(new TextDecoder().decode(decodePDFRawStream(stream).decode()))) return true
    } catch {
      // Non-content streams may use filters that this diagnostic does not read.
    }
  }
  return false
}

function isRgbSpace(space: ReturnType<typeof colorSpaceKind>): boolean {
  return space === 'DeviceRGB' || space === 'CalRGB' || space === 'ICCBased' || space === 'Indexed'
}

function inspectObject(state: RewriteState, object: PDFObject, report: PressReport): void {
  const stream = rawStreamOf(object)
  if (stream && nameOf(stream.dict.get(key('Subtype'))) === 'Image') {
    inspectImage(state, stream, report)
    return
  }
  const dictionary = dictionaryOf(object)
  if (!dictionary) return
  inspectShading(state, dictionary, report)
  inspectGroup(state, dictionary, report)
}

function inspectShading(state: RewriteState, dictionary: PDFDict, report: PressReport): void {
  if (!dictionary.has(key('ShadingType'))) return
  if (state.seenShadings.has(dictionary)) return
  state.seenShadings.add(dictionary)
  const space = colorSpaceKind(state, dictionary.get(key('ColorSpace')))
  if (isRgbSpace(space)) refusal(`RGB shading color space ${space}`, 'DeviceCMYK')
  if (space === 'DeviceCMYK') report.gradientStops += countFunctionStops(state, dictionary.get(key('Function')), state.seenFunctions)
}

function inspectGroup(state: RewriteState, dictionary: PDFDict, report: PressReport): void {
  const group = dictionary.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency') return
  if (state.seenGroups.has(group)) return
  state.seenGroups.add(group)
  const space = colorSpaceKind(state, group.get(key('CS')))
  if (isRgbSpace(space)) refusal(`RGB transparency group color space ${space}`, 'DeviceCMYK or DeviceGray')
  if (space === 'DeviceCMYK') report.groups++
}

function inspectImage(state: RewriteState, stream: PDFRawStream, report: PressReport): void {
  if (state.seenStreams.has(stream)) return
  state.seenStreams.add(stream)
  const image = imageReport(state, stream)
  if (image) report.images.push(image)
}

function inspectResources(state: RewriteState, resources: PDFDict | undefined, report: PressReport): void {
  if (!resources || state.seenResources.has(resources)) return
  state.seenResources.add(resources)
  const shadings = resources.lookupMaybe(key('Shading'), PDFDict)
  for (const [, object] of shadings?.entries() ?? []) {
    const dictionary = dictResolved(state, object)
    if (dictionary) inspectShading(state, dictionary, report)
  }
  inspectPatternResources(state, resources.lookupMaybe(key('Pattern'), PDFDict), report)
  inspectXObjectResources(state, resources.lookupMaybe(key('XObject'), PDFDict), report)
  inspectMaskResources(state, resources.lookupMaybe(key('ExtGState'), PDFDict), report)
}

function inspectPatternResources(state: RewriteState, patterns: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of patterns?.entries() ?? []) {
    const dictionary = dictResolved(state, object)
    if (!dictionary) continue
    const shading = dictResolved(state, dictionary.get(key('Shading')))
    if (shading) inspectShading(state, shading, report)
    inspectResources(state, dictionary.lookupMaybe(key('Resources'), PDFDict), report)
  }
}

function inspectXObjectResources(state: RewriteState, xObjects: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of xObjects?.entries() ?? []) {
    const stream = rawResolved(state, object)
    if (!stream) continue
    if (nameOf(stream.dict.get(key('Subtype'))) === 'Image') inspectImage(state, stream, report)
    else {
      inspectGroup(state, stream.dict, report)
      inspectResources(state, stream.dict.lookupMaybe(key('Resources'), PDFDict), report)
    }
  }
}

function inspectMaskResources(state: RewriteState, states: PDFDict | undefined, report: PressReport): void {
  for (const [, object] of states?.entries() ?? []) {
    const mask = dictResolved(state, dictResolved(state, object)?.get(key('SMask')))
    const stream = rawResolved(state, mask?.get(key('G')))
    if (!stream) continue
    inspectGroup(state, stream.dict, report)
    inspectResources(state, stream.dict.lookupMaybe(key('Resources'), PDFDict), report)
  }
}

function countFunctionStops(state: RewriteState, object: PDFObject | undefined, seen: WeakSet<PDFDict>): number {
  const fn = dictResolved(state, object)
  if (!fn || seen.has(fn)) return 0
  seen.add(fn)
  const type = numberOf(fn, 'FunctionType')
  if (type === 2) return 2
  if (type !== 3) return refusal(`shading FunctionType ${type ?? 'missing'}`, 'FunctionType 2 or 3')
  const functions = fn.lookupMaybe(key('Functions'), PDFArray)
  if (!functions) return refusal('FunctionType 3 without Functions', 'a Functions array')
  let count = 0
  for (let index = 0; index < functions.size(); index++) count += countFunctionStops(state, functions.get(index), seen)
  return count
}

function inspectPageStreams(state: RewriteState): { fills: number; strokes: number } {
  const totals = { fills: 0, strokes: 0 }
  const seen = new WeakSet<PDFRawStream>()
  const inspect = (object: PDFObject | undefined): void => {
    const stream = rawResolved(state, object)
    if (!stream || seen.has(stream) || nameOf(stream.dict.get(key('Subtype'))) === 'Image') return
    seen.add(stream)
    const counts = rewriteContent(decodedContent(stream), () => refusal('RGB color operator after conversion', 'CMYK operators')).counts
    totals.fills += counts.fills
    totals.strokes += counts.strokes
  }
  for (const page of state.document.getPages()) {
    const contents = page.node.Contents()
    if (contents instanceof PDFArray) for (let index = 0; index < contents.size(); index++) inspect(contents.get(index))
    else inspect(contents)
  }
  for (const [, object] of state.document.context.enumerateIndirectObjects()) {
    const stream = rawStreamOf(object)
    if (stream && nameOf(stream.dict.get(key('Subtype'))) === 'Form') inspect(stream)
  }
  return totals
}
