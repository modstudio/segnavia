import { PDFArray, PDFDict, PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import type { Color3, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor } from './color-policy.ts'
import { rewriteContent } from './content.ts'
import { arrayNumbers, decodeContent, dictionaryOf, nameOf, numberOf, rawStreamOf, replaceArray, resolvedColorSpace } from './pdf-objects.ts'
import { inspectPressPdf } from './report.ts'
import type { PressReport } from './types.ts'

export { inspectPressPdf } from './report.ts'

interface RewriteState {
  convert: ReturnType<typeof cachedPressColor>
  document: PDFDocument
  maskSources: WeakSet<PDFRawStream>
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
    if (fn.has(key('Range'))) replaceArray(fn, 'Range', [0, 1, 0, 1, 0, 1, 0, 1])
    return stops
  }
  if (type !== 3) return refusal(`shading FunctionType ${type ?? 'missing'}`, 'FunctionType 2 or 3')
  const functions = fn.lookupMaybe(key('Functions'), PDFArray)
  if (!functions) return refusal('FunctionType 3 without Functions', 'a Functions array of FunctionType 2 or 3 functions')
  let stops = 0
  for (let index = 0; index < functions.size(); index++) stops += convertFunction(state, functions.get(index))
  if (fn.has(key('Range'))) replaceArray(fn, 'Range', [0, 1, 0, 1, 0, 1, 0, 1])
  return stops
}

function convertShading(state: RewriteState, object: PDFObject | undefined): number {
  const shading = dictResolved(state, object)
  if (!shading) return refusal('shading that is not a dictionary or stream', 'a ShadingType 2 or 3 dictionary')
  if (state.seenShadings.has(shading)) return 0
  state.seenShadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  if (type !== 2 && type !== 3) return refusal(`ShadingType ${type ?? 'missing'}`, 'ShadingType 2 or 3')
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  if (space.kind === 'cmyk') return 0
  if (space.kind !== 'rgb') return refusal(`shading color space ${space.label}`, 'DeviceRGB')
  const stops = convertFunction(state, shading.get(key('Function')))
  if (shading.has(key('Background'))) replaceArray(shading, 'Background', state.convert(arrayNumbers(shading, 'Background', 3) as Color3))
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

function replaceTarget(state: RewriteState, original: PDFObject, replacement: PDFRawStream, setDirect: (stream: PDFRawStream) => void): void {
  const reference = original instanceof PDFRef ? original : state.document.context.getObjectRef(original)
  if (reference) state.document.context.assign(reference, replacement)
  else setDirect(replacement)
}

function convertGroup(state: RewriteState, owner: PDFDict, stream?: PDFRawStream): number {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.seenGroups.has(group)) return 0
  state.seenGroups.add(group)
  const space = resolvedColorSpace(state.document, resolved(state, group.get(key('CS'))))
  if (space.kind === 'gray' || (stream && state.maskSources.has(stream) && (space.label === 'DeviceRGB' || space.label === 'missing'))) return 0
  if (space.kind === 'rgb' && space.label !== 'DeviceRGB')
    refusal(`transparency group color space ${space.label}`, 'DeviceRGB, DeviceCMYK, DeviceGray, or no declared space')
  if (space.kind === 'other' && space.label !== 'missing')
    refusal(`transparency group color space ${space.label}`, 'DeviceRGB, DeviceCMYK, DeviceGray, or no declared space')
  if (space.kind === 'cmyk') return 0
  group.set(key('CS'), key('DeviceCMYK'))
  return 1
}

function markMaskSources(state: RewriteState): void {
  for (const [, object] of state.document.context.enumerateIndirectObjects()) {
    const dictionary = dictionaryOf(object)
    const mask = dictionary ? dictResolved(state, dictionary.get(key('SMask'))) : undefined
    if (!mask) continue
    const source = rawResolved(state, mask.get(key('G')))
    if (source) state.maskSources.add(source)
  }
}

function convertStream(state: RewriteState, object: PDFObject, setDirect: (stream: PDFRawStream) => void): { fills: number; groups: number; strokes: number } {
  const stream = rawResolved(state, object)
  if (!stream || state.seenStreams.has(stream)) return { fills: 0, strokes: 0, groups: 0 }
  state.seenStreams.add(stream)
  const groups = convertGroup(state, stream.dict, stream)
  const rewritten = rewriteContent(decodeContent(stream), state.convert)
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
  walkFonts(state, resources.lookupMaybe(key('Font'), PDFDict), totals)
}

function markResourceLuminosityMasks(state: RewriteState, states: PDFDict | undefined): void {
  for (const [, stateObject] of states?.entries() ?? []) {
    const mask = dictResolved(state, dictResolved(state, stateObject)?.get(key('SMask')))
    if (!mask) continue
    const source = rawResolved(state, mask.get(key('G')))
    if (source) state.maskSources.add(source)
  }
}

function walkFonts(state: RewriteState, fonts: PDFDict | undefined, totals: PressRewriteCounts): void {
  for (const [, fontObject] of fonts?.entries() ?? []) {
    const font = dictResolved(state, fontObject)
    if (!font || nameOf(font.get(key('Subtype'))) !== 'Type3') continue
    const charProcs = font.lookupMaybe(key('CharProcs'), PDFDict)
    for (const [name, charObject] of charProcs?.entries() ?? []) {
      add(
        totals,
        convertStream(state, charObject, (replacement) => charProcs?.set(name, replacement)),
      )
      const glyph = rawResolved(state, charObject)
      walkResources(state, glyph?.dict.lookupMaybe(key('Resources'), PDFDict), totals)
    }
    walkResources(state, font.lookupMaybe(key('Resources'), PDFDict), totals)
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
  markMaskSources(state)
  for (const page of state.document.getPages()) {
    totals.groups += convertGroup(state, page.node)
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
    maskSources: new WeakSet(),
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
