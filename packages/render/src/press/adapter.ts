import { deflateSync } from 'node:zlib'
import { PDFDict, PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import type { Color3, Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor } from './color-policy.ts'
import { rewriteContent } from './content.ts'
import { arrayNumbers, type ContentBudget, decodeContent, nameOf, numberOf, replaceArray, resolvedColorSpace } from './pdf-objects.ts'
import { type FunctionDecision, groupAction, shadingAction } from './policy.ts'
import { inspectPressPdf } from './report.ts'
import type { PressReport } from './types.ts'
import { walkPressGraph } from './visitor.ts'

export { inspectPressPdf } from './report.ts'

interface RewriteState {
  budget: ContentBudget
  convert: ReturnType<typeof cachedPressColor>
  document: PDFDocument
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

function convertShading(state: RewriteState, shading: PDFDict): boolean {
  if (state.seenShadings.has(shading)) return false
  state.seenShadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  const policy = shadingAction(space.kind, type)
  if (policy.action === 'refuse') refuse(`ShadingType ${type ?? 'missing'} color space ${space.label}`, policy.supported)
  if (policy.action === 'keep') return false
  if (shading.has(key('Background'))) replaceArray(shading, 'Background', state.convert(arrayNumbers(shading, 'Background', 3) as Color3))
  shading.set(key('ColorSpace'), key('DeviceCMYK'))
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

function convertContent(state: RewriteState, object: PDFObject, stream: PDFRawStream, setDirect: (stream: PDFRawStream) => void): void {
  const rewritten = rewriteContent(decodeContent(stream, state.budget), state.convert)
  state.totals.fills += rewritten.counts.fills
  state.totals.strokes += rewritten.counts.strokes
  const replacement = state.document.context.stream(deflateSync(rewritten.bytes), streamDictionary(stream))
  const reference = object instanceof PDFRef ? object : state.document.context.getObjectRef(object)
  if (reference) state.document.context.assign(reference, replacement)
  else setDirect(replacement)
}

function newState(document: PDFDocument, profile: Profile): RewriteState {
  return {
    budget: { decodedBytes: 0 },
    convert: cachedPressColor(profile),
    document,
    seenGroups: new WeakSet(),
    seenShadings: new WeakSet(),
    totals: { fills: 0, strokes: 0, gradientStops: 0, groups: 0 },
  }
}

export function rewritePressDocument(document: PDFDocument, profile: Profile): PressRewriteCounts {
  const state = newState(document, profile)
  walkPressGraph(document, {
    content: (object, stream, replace) => convertContent(state, object, stream, replace),
    function: (fn, decision) => convertFunction(state, fn, decision),
    group: (owner, _stream, maskSource) => convertGroup(state, owner, maskSource),
    image: () => undefined,
    shading: (shading) => convertShading(state, shading),
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
