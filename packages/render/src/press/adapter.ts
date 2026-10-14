import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import type { Color3, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor } from './color-policy.ts'
import { rewriteContent } from './content.ts'
import { arrayNumbers, dictionaryOf, nameOf, numberOf, rawStreamOf, replaceArray } from './pdf-objects.ts'
import { inspectPressPdf } from './report.ts'
import type { PressImage, PressReport } from './types.ts'

export { inspectPressPdf } from './report.ts'

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
    if (!['Filter', 'DecodeP' + 'arms', 'Length'].includes(text)) dictionary[text] = value
  }
  return dictionary
}

function decodedContent(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.get(key('Filter'))
  if (filter && nameOf(filter) !== 'Fl' + 'ateDecode') refusal(`content stream filter ${filter.toString()}`, 'Fl' + 'ateDecode or no filter')
  try {
    return filter ? decodePDFRawStream(stream).decode() : stream.contents
  } catch (error) {
    return refusal(`content stream that could not be decoded (${(error as Error).message})`, 'a valid Fl' + 'ateDecode or unfiltered stream')
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
  const replacement = state.document.context.stream(rewritten.bytes, copyStreamDictionary(stream))
  state.seenStreams.add(replacement)
  replaceTarget(state, object, replacement, setDirect)
  return { ...rewritten.counts, groups }
}

export interface PressRewriteCounts {
  fills: number
  gradientStops: number
  groups: number
  strokes: number
}

const emptyTotals = (): PressRewriteCounts => ({ fills: 0, strokes: 0, gradientStops: 0, groups: 0 })
const add = (totals: PressRewriteCounts, values: Partial<PressRewriteCounts>): void => {
  for (const name of ['fills', 'strokes', 'gradientStops', 'groups'] as const) totals[name] += values[name] ?? 0
}

function walkResources(state: RewriteState, resources: PDFDict | undefined, totals: PressRewriteCounts): void {
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

function walkPatterns(state: RewriteState, patterns: PDFDict | undefined, totals: PressRewriteCounts): void {
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

function walkXObjects(state: RewriteState, xObjects: PDFDict | undefined, totals: PressRewriteCounts): void {
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

function walkSoftMasks(state: RewriteState, states: PDFDict | undefined, totals: PressRewriteCounts): void {
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

function rewriteDocument(state: RewriteState): PressRewriteCounts {
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

export function rewritePressDocument(document: PDFDocument, profile: Profile): PressRewriteCounts {
  return rewriteDocument(newState(document, profile))
}

function addOutputIntent(document: PDFDocument, profile: Uint8Array): void {
  const profileStream = document.context.stream(profile, { N: 4 })
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
    rewritePressDocument(document, profile)
    addOutputIntent(document, profileBytes)
    const output = await document.save()
    return { bytes: output, report: await inspectPressPdf(output) }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError((error as Error).message)
  }
}
