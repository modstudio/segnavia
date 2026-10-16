import { deflateSync } from 'node:zlib'
import { PDFDict, PDFDocument, PDFHexString, PDFName, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import type { Color, Color3, Profile } from '../color/types.ts'
import { GENERATED_EFFECT_IMAGE_KEY } from '../effects/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor, DEFAULT_NEUTRAL_TOLERANCE, destinationColor, newlySnapsToNeutral, pdfMaskLuminosity, pressDestination } from './color-policy.ts'
import { rewriteContent } from './content.ts'
import { convertedImageCount, convertSuppliedImage, createImageState, type ImageState, type JpegDecoder } from './image.ts'
import { createPaintedBoundsTracker, type PaintedBounds, type PaintedBoundsTracker, type PatternPaint, recordPatternPaintedBounds } from './pattern-bounds.ts'
import { arrayNumbers, type ContentBudget, decodeContent, dictionaryOf, nameOf, numberOf, replaceArray, resolvedColorSpace } from './pdf-objects.ts'
import { type FunctionDecision, groupAction, shadingAction } from './policy.ts'
import { inspectPressPdf } from './report.ts'
import { replaceType1Function, sampleDomainForUses, shadingDeviceMatrix, shadingDomainOf, shadingSampleGridForUses } from './sample-shading.ts'
import type { PressDestination, PressReport } from './types.ts'
import { type MaskContext, walkPressGraph } from './visitor.ts'

export { inspectPressPdf } from './report.ts'

interface RewriteState {
  budget: ContentBudget
  convert: ReturnType<typeof cachedPressColor>
  destination: PressDestination
  document: PDFDocument
  painted: PaintedBounds
  profile: Profile
  sampleConvert: (rgb: Color3) => Color
  seenGroups: WeakSet<PDFDict>
  seenShadings: WeakSet<PDFDict>
  sequence?: PaintedBoundsTracker
  shadingPainted: PaintedBounds
  shadingPatterns: WeakMap<PDFDict, PDFDict[]>
  totals: PressRewriteCounts
}

export interface PressRewriteCounts {
  fills: number
  gradientStops: number
  groups: number
  strokes: number
  neutralColors: number
}

const key = (name: string): PDFName => PDFName.of(name)
const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const resolved = (state: RewriteState, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? state.document.context.lookup(object) : object
const isGrayMask = (state: RewriteState, mask: MaskContext): boolean => state.destination === 'gray' && mask !== 'none'
const converterFor = (state: RewriteState, mask: MaskContext): ((rgb: Color3) => Color) => (isGrayMask(state, mask) ? pdfMaskLuminosity : state.convert)

function convertFunction(state: RewriteState, fn: PDFDict | undefined, policy: FunctionDecision, mask: MaskContext): void {
  if (policy.action === 'refuse') refuse(policy.found, policy.supported)
  if (!fn) return
  const type = numberOf(fn, 'FunctionType')
  if (type === 2) {
    for (const name of ['C0', 'C1']) replaceArray(fn, name, converterFor(state, mask)(arrayNumbers(fn, name, 3) as Color3))
    if (fn.has(key('Range'))) replaceArray(fn, 'Range', state.destination === 'gray' ? [0, 1] : [0, 1, 0, 1, 0, 1, 0, 1])
    state.totals.gradientStops += 2
    return
  }
  if (fn.has(key('Range'))) replaceArray(fn, 'Range', state.destination === 'gray' ? [0, 1] : [0, 1, 0, 1, 0, 1, 0, 1])
}

function functionTypeOf(state: RewriteState, shading: PDFDict): number | undefined {
  const fn = dictionaryOf(resolved(state, shading.get(key('Function'))))
  return fn ? numberOf(fn, 'FunctionType') : undefined
}

function indexShadingPattern(state: RewriteState, shading: PDFDict, pattern?: PDFDict): boolean {
  if (!pattern) return false
  const list = state.shadingPatterns.get(shading) ?? []
  if (!list.includes(pattern)) list.push(pattern)
  state.shadingPatterns.set(shading, list)
  return false
}

function shadingUses(
  state: RewriteState,
  shading: PDFDict,
  pattern?: PDFDict,
): Array<{ matrix: number[]; painted: PatternPaint | undefined; pattern?: PDFDict }> {
  const patterns = [...(state.shadingPatterns.get(shading) ?? [])]
  if (pattern && !patterns.includes(pattern)) patterns.push(pattern)
  const uses: Array<{ matrix: number[]; painted: PatternPaint | undefined; pattern?: PDFDict }> = patterns.map((found) => ({
    matrix: shadingDeviceMatrix(shading, found),
    painted: state.painted.get(found),
    pattern: found,
  }))
  const shPaint = state.shadingPainted.get(shading)
  if (shPaint !== undefined) uses.push({ matrix: shadingDeviceMatrix(shading, undefined), painted: shPaint })
  return uses.filter((use) => use.painted !== undefined)
}

function convertType1Shading(state: RewriteState, shading: PDFDict, pattern: PDFDict | undefined, mask: MaskContext): void {
  const uses = shadingUses(state, shading, pattern)
  const domain = sampleDomainForUses(shadingDomainOf(shading), uses)
  const matrices = uses.length > 0 ? uses.map((use) => use.matrix) : [shadingDeviceMatrix(shading, pattern)]
  const size = shadingSampleGridForUses(domain, matrices)
  // Sampling owns its conversion through the 8-bit, capped converter and must remain uncached.
  replaceType1Function(
    state.document,
    shading,
    pattern,
    isGrayMask(state, mask) ? pdfMaskLuminosity : state.sampleConvert,
    state.budget,
    undefined,
    domain,
    size,
    state.destination === 'gray' ? 1 : 4,
  )
}

function convertShading(state: RewriteState, shading: PDFDict, pattern: PDFDict | undefined, mask: MaskContext): boolean {
  if (state.seenShadings.has(shading)) return false
  state.seenShadings.add(shading)
  const type = numberOf(shading, 'ShadingType')
  const functionType = functionTypeOf(state, shading)
  const space = resolvedColorSpace(state.document, resolved(state, shading.get(key('ColorSpace'))))
  const destination = state.destination
  const policy = shadingAction(space.kind, type, functionType, destination)
  if (policy.action === 'refuse') {
    if (type === 1) refuse(`ShadingType 1 FunctionType ${functionType ?? 'missing'}`, policy.supported)
    refuse(`ShadingType ${type ?? 'missing'} color space ${space.label}`, policy.supported)
  }
  if (policy.action === 'keep') return false
  if (shading.has(key('Background'))) replaceArray(shading, 'Background', converterFor(state, mask)(arrayNumbers(shading, 'Background', 3) as Color3))
  shading.set(key('ColorSpace'), key(destination === 'gray' ? 'DeviceGray' : 'DeviceCMYK'))
  if (type === 1) {
    convertType1Shading(state, shading, pattern, mask)
    return false
  }
  return true
}

function convertGroup(state: RewriteState, owner: PDFDict, mask: MaskContext): void {
  const group = owner.lookupMaybe(key('Group'), PDFDict)
  if (!group || nameOf(group.get(key('S'))) !== 'Transparency' || state.seenGroups.has(group)) return
  state.seenGroups.add(group)
  const space = resolvedColorSpace(state.document, resolved(state, group.get(key('CS'))))
  const destination = state.destination
  const policy = groupAction(space.kind, space.label, mask !== 'none', destination)
  if (policy.action === 'refuse') refuse(`transparency group color space ${space.label}`, policy.supported)
  if (policy.action === 'convert') {
    group.set(key('CS'), key(destination === 'gray' ? 'DeviceGray' : 'DeviceCMYK'))
    state.totals.groups++
  }
}

function convertRuleCImage(
  state: RewriteState,
  image: PDFRawStream,
  width: number,
  height: number,
  dictionary: Record<string, PDFObject>,
  convert: (rgb: Color3) => Color,
): void {
  const source = decodeContent(image, state.budget)
  if (source.length !== width * height * 3) refuse('effect image sample length', 'three 8-bit RGB samples per pixel')
  const channels = state.destination === 'gray' ? 1 : 4
  const converted = new Uint8Array(width * height * channels)
  for (let pixel = 0; pixel < width * height; pixel++) {
    const color = convert([(source[pixel * 3] ?? 0) / 255, (source[pixel * 3 + 1] ?? 0) / 255, (source[pixel * 3 + 2] ?? 0) / 255])
    for (let channel = 0; channel < channels; channel++) converted[pixel * channels + channel] = Math.round(Math.max(0, Math.min(1, color[channel] ?? 0)) * 255)
  }
  dictionary.ColorSpace = key(state.destination === 'gray' ? 'DeviceGray' : 'DeviceCMYK')
  const replacement = state.document.context.stream(deflateSync(converted), dictionary)
  const reference = state.document.context.getObjectRef(image)
  if (reference) state.document.context.assign(reference, replacement)
}

function convertEffectImage(state: RewriteState, image: PDFRawStream, mask: MaskContext): void {
  if (!image.dict.has(key(GENERATED_EFFECT_IMAGE_KEY)) || resolvedColorSpace(state.document, resolved(state, image.dict.get(key('ColorSpace')))).kind !== 'rgb')
    return
  const width = numberOf(image.dict, 'Width') ?? refuse('effect image Width missing', 'a positive Width number')
  const height = numberOf(image.dict, 'Height') ?? refuse('effect image Height missing', 'a positive Height number')
  if (width <= 0 || height <= 0) refuse('effect image dimensions', 'positive Width and Height numbers')
  const dictionary = streamDictionary(image)
  const convert = converterFor(state, mask)
  if (!image.dict.has(key('SegnaviaEffectColor'))) {
    convertRuleCImage(state, image, width, height, dictionary, convert)
    return
  }
  const source = arrayNumbers(image.dict, 'SegnaviaEffectColor', 3) as Color3
  const color = convert(source)
  const palette = color.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255))
  dictionary.ColorSpace = state.document.context.obj([
    'Indexed',
    state.destination === 'gray' ? 'DeviceGray' : 'DeviceCMYK',
    0,
    PDFHexString.of(Buffer.from(palette).toString('hex')),
  ])
  dictionary.SegnaviaEffectColor = state.document.context.obj(color)
  const replacement = state.document.context.stream(image.contents, dictionary)
  const reference = state.document.context.getObjectRef(image)
  if (reference) state.document.context.assign(reference, replacement)
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

function resolveShadingResource(state: RewriteState, resources: PDFDict | undefined, name: string): PDFDict | undefined {
  const shadings = resources?.lookupMaybe(key('Shading'), PDFDict)
  return dictionaryOf(resolved(state, shadings?.get(PDFName.of(name))))
}

function recordContentBounds(state: RewriteState, stream: PDFRawStream, resources: PDFDict | undefined, budget: ContentBudget): void {
  const bytes = decodeContent(stream, budget)
  const resolve = (name: string) => resolveShadingPattern(state, resources, name)
  const resolveGs = (name: string) => resolveGraphicsState(state, resources, name)
  const resolveShading = (name: string) => resolveShadingResource(state, resources, name)
  if (state.sequence) state.sequence.feed(bytes, resolve, resolveGs, resolveShading)
  else recordPatternPaintedBounds(bytes, resolve, state.painted, resolveGs, resolveShading, state.shadingPainted)
}

function convertContent(state: RewriteState, object: PDFObject, stream: PDFRawStream, setDirect: (stream: PDFRawStream) => void, mask: MaskContext): void {
  const bytes = decodeContent(stream, state.budget)
  const destination = state.destination
  const rewritten = rewriteContent(bytes, converterFor(state, mask), destination)
  state.totals.fills += rewritten.counts.fills
  state.totals.strokes += rewritten.counts.strokes
  const replacement = state.document.context.stream(deflateSync(rewritten.bytes), streamDictionary(stream))
  const reference = object instanceof PDFRef ? object : state.document.context.getObjectRef(object)
  if (reference) state.document.context.assign(reference, replacement)
  else setDirect(replacement)
}

function newState(document: PDFDocument, profile: Profile, tolerance: number): RewriteState {
  const cached = cachedPressColor(profile, tolerance)
  const totals: PressRewriteCounts = { fills: 0, strokes: 0, gradientStops: 0, groups: 0, neutralColors: 0 }
  return {
    budget: { calculatorOperations: 0, decodedBytes: 0, shadingSamples: 0 },
    convert: (rgb) => {
      if (profile.colorSpace === 'CMYK' && newlySnapsToNeutral(rgb, tolerance)) totals.neutralColors++
      return cached(rgb)
    },
    destination: pressDestination(profile),
    document,
    painted: new WeakMap(),
    profile,
    sampleConvert: (rgb) => {
      if (profile.colorSpace === 'CMYK' && newlySnapsToNeutral(rgb, tolerance)) totals.neutralColors++
      return destinationColor(profile, rgb, tolerance)
    },
    seenGroups: new WeakSet(),
    seenShadings: new WeakSet(),
    shadingPainted: new WeakMap(),
    shadingPatterns: new WeakMap(),
    totals,
  }
}

export function rewritePressDocument(document: PDFDocument, profile: Profile, tolerance = DEFAULT_NEUTRAL_TOLERANCE): PressRewriteCounts {
  const state = newState(document, profile, tolerance)
  // Each pass has its own 128 MiB decoded-content ceiling so a stream is not charged twice in one budget.
  const boundsBudget: ContentBudget = { decodedBytes: 0 }
  // Painted bounds are gathered for the whole document before any Type 1 function is replaced.
  walkPressGraph(document, {
    beginContentsSequence: () => {
      state.sequence = createPaintedBoundsTracker(state.painted, state.shadingPainted)
    },
    content: (_object, stream, _replace, resources) => {
      recordContentBounds(state, stream, resources, boundsBudget)
    },
    endContentsSequence: () => {
      state.sequence = undefined
    },
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    replayPageContents: true,
    shading: (shading, pattern) => indexShadingPattern(state, shading, pattern),
  })
  walkPressGraph(document, {
    content: (object, stream, replace, _resources, mask) => convertContent(state, object, stream, replace, mask),
    function: (fn, decision, mask) => convertFunction(state, fn, decision, mask),
    group: (owner, _stream, mask) => convertGroup(state, owner, mask),
    image: (image, mask) => convertEffectImage(state, image, mask),
    shading: (shading, pattern, mask) => convertShading(state, shading, pattern, mask),
  })
  return state.totals
}

function addOutputIntent(document: PDFDocument, profile: Uint8Array, channels: 1 | 4): void {
  const profileRef = document.context.register(document.context.stream(profile, { N: channels }))
  const intentRef = document.context.register(
    document.context.obj({ Type: 'OutputIntent', S: 'GTS_PDFX', OutputConditionIdentifier: PDFString.of('Custom'), DestOutputProfile: profileRef }),
  )
  document.catalog.set(key('OutputIntents'), document.context.obj([intentRef]))
}

interface SuppliedImageUse {
  image: PDFRawStream
  mask: MaskContext
  replace: (object: PDFObject) => void
}

function replaceSourceImage(document: PDFDocument, image: PDFRawStream, uses: SuppliedImageUse[], replacement: PDFRawStream): void {
  const reference = document.context.getObjectRef(image)
  if (reference) document.context.assign(reference, replacement)
  else for (const use of uses) use.replace(replacement)
}

async function convertImageUses(state: ImageState, image: PDFRawStream, uses: SuppliedImageUse[]): Promise<void> {
  const normal = uses.filter((use) => use.mask === 'none')
  const masks = uses.filter((use) => use.mask !== 'none')
  if (normal.length > 0) {
    const replacement = await convertSuppliedImage(state, image, 'none')
    if (!replacement) return
    replaceSourceImage(state.document, image, normal, replacement)
  }
  if (masks.length === 0) return
  const replacement = await convertSuppliedImage(state, image, masks[0]?.mask ?? 'luminosity')
  if (!replacement) return
  if (normal.length === 0) replaceSourceImage(state.document, image, masks, replacement)
  else {
    const reference = state.document.context.getObjectRef(replacement) ?? state.document.context.register(replacement)
    for (const use of masks) use.replace(reference)
  }
}

async function convertGrayImages(document: PDFDocument, profile: Profile, decodeJpeg?: JpegDecoder): Promise<number> {
  const state = createImageState(document, profile, decodeJpeg)
  const images: SuppliedImageUse[] = []
  walkPressGraph(document, {
    content: () => undefined,
    function: () => undefined,
    group: () => undefined,
    image: (image, mask, replace) => images.push({ image, mask, replace }),
    shading: () => false,
  })
  const uses = new Map<PDFRawStream, SuppliedImageUse[]>()
  for (const found of images) uses.set(found.image, [...(uses.get(found.image) ?? []), found])
  for (const [image, found] of uses) await convertImageUses(state, image, found)
  return convertedImageCount(state)
}

export async function rewritePressPdf(
  bytes: Uint8Array,
  profileBytes: Uint8Array,
  tolerance = DEFAULT_NEUTRAL_TOLERANCE,
  decodeJpeg?: JpegDecoder,
): Promise<{ bytes: Uint8Array; report: PressReport }> {
  try {
    const profile = readProfile(profileBytes)
    if (profile.colorSpace !== 'CMYK' && profile.colorSpace !== 'GRAY') refuse(`press profile color space ${profile.colorSpace}`, 'CMYK or GRAY')
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    const counts = rewritePressDocument(document, profile, tolerance)
    let convertedImages = 0
    const destination = pressDestination(profile)
    if (destination === 'gray') convertedImages = await convertGrayImages(document, profile, decodeJpeg)
    addOutputIntent(document, profileBytes, destination === 'gray' ? 1 : 4)
    const output = await document.save({ useObjectStreams: false })
    const report = await inspectPressPdf(output, destination)
    report.neutralColors = counts.neutralColors
    report.convertedImages = convertedImages
    return { bytes: output, report }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError('The PDF has unsupported malformed structure; supported: a valid PDF produced by the renderer.')
  }
}
