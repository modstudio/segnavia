import { deflateSync } from 'node:zlib'
import { PDFDict, PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import type { Color3, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor, pressColor } from './color-policy.ts'
import { rewriteContent } from './content.ts'
import { type PaintedBounds, recordPatternPaintedBounds } from './pattern-bounds.ts'
import { arrayNumbers, type ContentBudget, decodeContent, dictionaryOf, nameOf, numberOf, replaceArray, resolvedColorSpace } from './pdf-objects.ts'
import { type FunctionDecision, groupAction, shadingAction } from './policy.ts'
import { inspectPressPdf } from './report.ts'
import { replaceType1Function } from './sample-shading.ts'
import type { PressReport } from './types.ts'
import { walkPressGraph } from './visitor.ts'

export { inspectPressPdf } from './report.ts'

interface RewriteState {
  budget: ContentBudget
  convert: ReturnType<typeof cachedPressColor>
  document: PDFDocument
  painted: PaintedBounds
  profile: Profile
  seenGroups: WeakSet<PDFDict>
  seenShadings: WeakSet<PDFDict>
  totals: PressRewriteCounts
}

export interface PressRewriteCounts {
  fills: number
  gradientStops: number
  groups: number
  strokes: number
}

const key = (name: string): PDFName => PDFName.of(name)
const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const resolved = (state: RewriteState, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? state.document.context.lookup(object) : object

function convertFunction(state: RewriteState, fn: PDFDict | undefined, policy: FunctionDecision): void {
  if (policy.action === 'refuse') refuse(policy.found, policy.supported)
  if (!fn) return
  const type = numberOf(fn, 'FunctionType')
  if (type === 2) {
    for (const name of ['C0', 'C1']) replaceArray(fn, name, state.convert(arrayNumbers(fn, name, 3) as Color3))
    if (fn.has(key('Range'))) replaceArray(fn, 'Range', [0, 1, 0, 1, 0, 1, 0, 1])
    state.totals.gradientStops += 2
    return
  }
  if (fn.has(key('Range'))) replaceArray(fn, 'Range', [0, 1, 0, 1, 0, 1, 0, 1])
}

function functionTypeOf(state: RewriteState, shading: PDFDict): number | undefined {
  const fn = dictionaryOf(resolved(state, shading.get(key('Function'))))
  return fn ? numberOf(fn, 'FunctionType') : undefined
}

function convertShading(state: RewriteState, shading: PDFDict, pattern?: PDFDict): boolean {
  if (state.seenShadings.has(shading)) return false
  state.seenShadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  const functionType = functionTypeOf(state, shading)
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  const policy = shadingAction(space.kind, type, functionType)
  if (policy.action === 'refuse') {
    if (type === 1) refuse(`ShadingType 1 FunctionType ${functionType ?? 'missing'}`, policy.supported)
    refuse(`ShadingType ${type ?? 'missing'} color space ${space.label}`, policy.supported)
  }
  if (policy.action === 'keep') return false
  if (shading.has(key('Background'))) replaceArray(shading, 'Background', state.convert(arrayNumbers(shading, 'Background', 3) as Color3))
  shading.set(key('ColorSpace'), key('DeviceCMYK'))
  if (type === 1) {
    replaceType1Function(
      state.document,
      shading,
      pattern,
      (rgb) => pressColor(state.profile, rgb),
      state.budget,
      pattern ? state.painted.get(pattern) : undefined,
    )
    return false
  }
  return true
}

function convertGroup(state: RewriteState, owner: PDFDict, maskSource: boolean): void {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.seenGroups.has(group)) return
  state.seenGroups.add(group)
  const space = resolvedColorSpace(state.document, resolved(state, group.get(key('CS'))))
  const policy = groupAction(space.kind, space.label, maskSource)
  if (policy.action === 'refuse') refuse(`transparency group color space ${space.label}`, policy.supported)
  if (policy.action === 'convert') {
    group.set(key('CS'), key('DeviceCMYK'))
    state.totals.groups++
  }
}

function streamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = { Filter: key('Fl' + 'ateDecode') }
  for (const [name, value] of stream.dict.entries()) {
    const label = name.toString().slice(1)
    if (!['Filter', 'DecodeP' + 'arms', 'Length'].includes(label)) dictionary[label] = value
  }
  return dictionary
}

function resolveShadingPattern(state: RewriteState, resources: PDFDict | undefined, name: string): PDFDict | undefined {
  const patterns = resources?.lookupMaybe(key('Pattern'), PDFDict)
  const found = dictionaryOf(resolved(state, patterns?.get(PDFName.of(name))))
  if (found && numberOf(found, 'PatternType') === 2) return found
  return undefined
}

function resolveGraphicsState(state: RewriteState, resources: PDFDict | undefined, name: string): PDFDict | undefined {
  const states = resources?.lookupMaybe(key('ExtGState'), PDFDict)
  return dictionaryOf(resolved(state, states?.get(PDFName.of(name))))
}

function convertContent(
  state: RewriteState,
  object: PDFObject,
  stream: PDFRawStream,
  setDirect: (stream: PDFRawStream) => void,
  resources: PDFDict | undefined,
): void {
  const bytes = decodeContent(stream, state.budget)
  recordPatternPaintedBounds(
    bytes,
    (name) => resolveShadingPattern(state, resources, name),
    state.painted,
    (name) => resolveGraphicsState(state, resources, name),
  )
  const rewritten = rewriteContent(bytes, state.convert)
  state.totals.fills += rewritten.counts.fills
  state.totals.strokes += rewritten.counts.strokes
  const replacement = state.document.context.stream(deflateSync(rewritten.bytes), streamDictionary(stream))
  const reference = object instanceof PDFRef ? object : state.document.context.getObjectRef(object)
  if (reference) state.document.context.assign(reference, replacement)
  else setDirect(replacement)
}

function newState(document: PDFDocument, profile: Profile): RewriteState {
  return {
    budget: { decodedBytes: 0, shadingSamples: 0 },
    convert: cachedPressColor(profile),
    document,
    painted: new WeakMap(),
    profile,
    seenGroups: new WeakSet(),
    seenShadings: new WeakSet(),
    totals: { fills: 0, strokes: 0, gradientStops: 0, groups: 0 },
  }
}

export function rewritePressDocument(document: PDFDocument, profile: Profile): PressRewriteCounts {
  const state = newState(document, profile)
  walkPressGraph(document, {
    content: (object, stream, replace, resources) => convertContent(state, object, stream, replace, resources),
    function: (fn, decision) => convertFunction(state, fn, decision),
    group: (owner, _stream, maskSource) => convertGroup(state, owner, maskSource),
    image: () => undefined,
    shading: (shading, pattern) => convertShading(state, shading, pattern),
  })
  return state.totals
}

function addOutputIntent(document: PDFDocument, profile: Uint8Array): void {
  const profileRef = document.context.register(document.context.stream(profile, { N: 4 }))
  const intentRef = document.context.register(
    document.context.obj({ Type: 'OutputIntent', S: 'GTS_PDFX', OutputConditionIdentifier: PDFString.of('Custom'), DestOutputProfile: profileRef }),
  )
  document.catalog.set(key('OutputIntents'), document.context.obj([intentRef]))
}

export async function rewritePressPdf(bytes: Uint8Array, profileBytes: Uint8Array): Promise<{ bytes: Uint8Array; report: PressReport }> {
  try {
    const profile = readProfile(profileBytes)
    if (profile.colorSpace !== 'CMYK') refuse(`press profile color space ${profile.colorSpace}`, 'CMYK')
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    rewritePressDocument(document, profile)
    addOutputIntent(document, profileBytes)
    const output = await document.save({ useObjectStreams: false })
    return { bytes: output, report: await inspectPressPdf(output) }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError('The PDF has unsupported malformed structure; supported: a valid PDF produced by the renderer.')
  }
}
