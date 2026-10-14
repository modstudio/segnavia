import { PDFArray, PDFDict, type PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef } from 'pdf-lib'
import { dictionaryOf, nameOf, numberOf, rawStreamOf } from './pdf-objects.ts'
import { type FunctionDecision, shadingFunctionAction } from './policy.ts'

export interface PressGraphActions {
  beginContentsSequence?: () => void
  content: (object: PDFObject, stream: PDFRawStream, replace: (stream: PDFRawStream) => void, resources: PDFDict | undefined) => void
  endContentsSequence?: () => void
  function: (fn: PDFDict | undefined, decision: FunctionDecision) => void
  group: (owner: PDFDict, stream: PDFRawStream | undefined, maskSource: boolean) => void
  image: (stream: PDFRawStream) => void
  // When set, each page Contents stream is fed every time it appears; the convert pass leaves this unset so streams stay unique.
  replayPageContents?: boolean
  shading: (shading: PDFDict, pattern?: PDFDict) => boolean
}

interface WalkState {
  actions?: PressGraphActions
  document: PDFDocument
  functions: WeakSet<PDFDict>
  maskSources: WeakSet<PDFRawStream>
  resources: WeakSet<PDFDict>
  references: Set<string>
  streams: WeakSet<PDFRawStream>
}

const key = (name: string): PDFName => PDFName.of(name)
const resolved = (state: WalkState, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? state.document.context.lookup(object) : object
const dictionary = (state: WalkState, object: PDFObject | undefined): PDFDict | undefined => dictionaryOf(resolved(state, object))
const stream = (state: WalkState, object: PDFObject | undefined): PDFRawStream | undefined => rawStreamOf(resolved(state, object))

function rememberRef(state: WalkState, object: PDFObject): boolean {
  if (!(object instanceof PDFRef)) return false
  const label = object.toString()
  if (state.references.has(label)) return true
  state.references.add(label)
  return false
}

function visitContent(
  state: WalkState,
  object: PDFObject | undefined,
  replace: (value: PDFRawStream) => void,
  enclosing?: PDFDict,
  replay = false,
  nestResources = true,
): void {
  if (!object) return
  const seenRef = rememberRef(state, object)
  const found = stream(state, object)
  if (!found) return
  const seenStream = state.streams.has(found)
  if (!seenStream) state.streams.add(found)
  if ((seenRef || seenStream) && !replay) return
  const own = found.dict.lookupMaybe(key('Resources'), PDFDict)
  if (!seenRef && !seenStream) state.actions?.group(found.dict, found, state.maskSources.has(found))
  state.actions?.content(object, found, replace, own ?? enclosing)
  if (nestResources && !seenRef && !seenStream) visitResources(state, own)
}

function visitSoftMask(state: WalkState, object: PDFObject | undefined, enclosing?: PDFDict): void {
  const mask = dictionary(state, dictionary(state, object)?.get(key('SMask')))
  const sourceObject = mask?.get(key('G'))
  const source = stream(state, sourceObject)
  if (!source || !sourceObject) return
  state.maskSources.add(source)
  visitContent(state, sourceObject, (replacement) => mask?.set(key('G'), replacement), enclosing)
}

function visitAppearances(state: WalkState, page: PDFDict, enclosing?: PDFDict): void {
  const annotations = resolved(state, page.get(key('Annots')))
  if (!(annotations instanceof PDFArray)) return
  for (let index = 0; index < annotations.size(); index++) {
    const appearance = dictionary(state, dictionary(state, annotations.get(index))?.get(key('AP')))
    for (const name of ['N', 'R', 'D']) {
      const object = appearance?.get(key(name))
      if (!object) continue
      if (stream(state, object)) visitContent(state, object, (replacement) => appearance?.set(key(name), replacement), enclosing)
      else {
        const states = dictionary(state, object)
        for (const [stateName, stateObject] of states?.entries() ?? [])
          visitContent(state, stateObject, (replacement) => states?.set(stateName, replacement), enclosing)
      }
    }
  }
}

function visitFunction(state: WalkState, object: PDFObject | undefined): void {
  const fn = dictionary(state, object)
  if (fn && state.functions.has(fn)) return
  if (fn) state.functions.add(fn)
  const type = fn ? numberOf(fn, 'FunctionType') : undefined
  const functions = type === 3 ? fn?.lookupMaybe(key('Functions'), PDFArray) : undefined
  const decision = shadingFunctionAction(type, Boolean(fn), type !== 3 || Boolean(functions))
  state.actions?.function(fn, decision)
  for (let index = 0; index < (functions?.size() ?? 0); index++) visitFunction(state, functions?.get(index))
}

function visitShading(state: WalkState, shading: PDFDict, pattern?: PDFDict): void {
  if (state.actions?.shading(shading, pattern)) visitFunction(state, shading.get(key('Function')))
}

function visitShadings(state: WalkState, resources: PDFDict): void {
  const shadings = resources.lookupMaybe(key('Shading'), PDFDict)
  for (const [, object] of shadings?.entries() ?? []) {
    const found = dictionary(state, object)
    if (found) visitShading(state, found)
  }
}

function visitPatterns(state: WalkState, resources: PDFDict): void {
  const patterns = resources.lookupMaybe(key('Pattern'), PDFDict)
  for (const [name, object] of patterns?.entries() ?? []) {
    const found = dictionary(state, object)
    if (!found) continue
    if (numberOf(found, 'PatternType') === 2) {
      const shading = dictionary(state, found.get(key('Shading')))
      if (shading) visitShading(state, shading, found)
    } else visitContent(state, object, (replacement) => patterns?.set(name, replacement), found.lookupMaybe(key('Resources'), PDFDict) ?? resources)
    visitResources(state, found.lookupMaybe(key('Resources'), PDFDict))
  }
}

function visitGraphicsStates(state: WalkState, resources: PDFDict): void {
  const graphicsStates = resources.lookupMaybe(key('ExtGState'), PDFDict)
  for (const [, object] of graphicsStates?.entries() ?? []) visitSoftMask(state, object, resources)
}

function visitXObjects(state: WalkState, resources: PDFDict): void {
  const xObjects = resources.lookupMaybe(key('XObject'), PDFDict)
  for (const [name, object] of xObjects?.entries() ?? []) {
    const found = stream(state, object)
    if (!found) continue
    if (nameOf(found.dict.get(key('Subtype'))) === 'Image') state.actions?.image(found)
    else visitContent(state, object, (replacement) => xObjects?.set(name, replacement), found.dict.lookupMaybe(key('Resources'), PDFDict) ?? resources)
  }
}

function visitFonts(state: WalkState, resources: PDFDict): void {
  const fonts = resources.lookupMaybe(key('Font'), PDFDict)
  for (const [, object] of fonts?.entries() ?? []) {
    const font = dictionary(state, object)
    if (!font || nameOf(font.get(key('Subtype'))) !== 'Type3') continue
    const charProcs = font.lookupMaybe(key('CharProcs'), PDFDict)
    for (const [name, glyph] of charProcs?.entries() ?? [])
      visitContent(state, glyph, (replacement) => charProcs?.set(name, replacement), font.lookupMaybe(key('Resources'), PDFDict) ?? resources)
    visitResources(state, font.lookupMaybe(key('Resources'), PDFDict))
  }
}

function visitResources(state: WalkState, resources: PDFDict | undefined): void {
  if (!resources || state.resources.has(resources)) return
  state.resources.add(resources)
  // XObjects and Type 3 glyphs are content streams; walk them with other content before listing shadings and patterns.
  visitGraphicsStates(state, resources)
  visitXObjects(state, resources)
  visitFonts(state, resources)
  visitShadings(state, resources)
  visitPatterns(state, resources)
}

function visitPageContents(state: WalkState, page: PDFDict, contents: PDFObject | undefined, pageResources: PDFDict | undefined): void {
  const replay = Boolean(state.actions?.replayPageContents)
  const nested: PDFDict[] = []
  const feed = (object: PDFObject | undefined, replace: (value: PDFRawStream) => void) => {
    visitContent(state, object, replace, pageResources, replay, false)
    const own = stream(state, object)?.dict.lookupMaybe(key('Resources'), PDFDict)
    if (own) nested.push(own)
  }
  if (contents instanceof PDFArray) {
    // A page Contents array is one graphics-state sequence (PDF 7.8.2). Nested resources are walked after it ends so they do not share that tracker.
    state.actions?.beginContentsSequence?.()
    for (let index = 0; index < contents.size(); index++)
      feed(contents.get(index), (replacement) => contents.set(index, replacement))
    state.actions?.endContentsSequence?.()
  } else feed(contents, (replacement) => page.set(key('Contents'), replacement))
  for (const resources of nested) visitResources(state, resources)
}

function traverse(document: PDFDocument, maskSources: WeakSet<PDFRawStream>, actions?: PressGraphActions): void {
  const state: WalkState = { document, maskSources, actions, functions: new WeakSet(), references: new Set(), resources: new WeakSet(), streams: new WeakSet() }
  for (const page of document.getPages()) {
    actions?.group(page.node, undefined, false)
    const pageResources = page.node.Resources()
    visitPageContents(state, page.node, page.node.Contents(), pageResources)
    visitResources(state, pageResources)
    visitAppearances(state, page.node, pageResources)
  }
}

export function walkPressGraph(document: PDFDocument, actions: PressGraphActions): void {
  const maskSources = new WeakSet<PDFRawStream>()
  // The first traversal only records mask sources so the action traversal can distinguish their groups from ordinary transparency groups.
  traverse(document, maskSources)
  traverse(document, maskSources, actions)
}
