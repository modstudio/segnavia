import { PDFArray, PDFDict, type PDFDocument, PDFName, type PDFObject, type PDFRawStream, PDFRef } from 'pdf-lib'
import { dictionaryOf, nameOf, numberOf, rawStreamOf } from './pdf-objects.ts'

export interface PressGraphActions {
  content: (object: PDFObject, stream: PDFRawStream, replace: (stream: PDFRawStream) => void) => void
  group: (owner: PDFDict, stream: PDFRawStream | undefined, maskSource: boolean) => void
  image: (stream: PDFRawStream) => void
  shading: (shading: PDFDict) => void
}

interface WalkState {
  actions?: PressGraphActions
  document: PDFDocument
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

function visitContent(state: WalkState, object: PDFObject | undefined, replace: (value: PDFRawStream) => void): void {
  if (!object) return
  if (object instanceof PDFRef) {
    const label = object.toString()
    if (state.references.has(label)) return
    state.references.add(label)
  }
  const found = stream(state, object)
  if (!found || state.streams.has(found)) return
  state.streams.add(found)
  state.actions?.group(found.dict, found, state.maskSources.has(found))
  state.actions?.content(object, found, replace)
  visitResources(state, found.dict.lookupMaybe(key('Resources'), PDFDict))
}

function visitSoftMask(state: WalkState, object: PDFObject | undefined): void {
  const mask = dictionary(state, dictionary(state, object)?.get(key('SMask')))
  const sourceObject = mask?.get(key('G'))
  const source = stream(state, sourceObject)
  if (!source || !sourceObject) return
  state.maskSources.add(source)
  visitContent(state, sourceObject, (replacement) => mask?.set(key('G'), replacement))
}

function visitAppearances(state: WalkState, page: PDFDict): void {
  const annotations = resolved(state, page.get(key('Annots')))
  if (!(annotations instanceof PDFArray)) return
  for (let index = 0; index < annotations.size(); index++) {
    const appearance = dictionary(state, dictionary(state, annotations.get(index))?.get(key('AP')))
    for (const name of ['N', 'R', 'D']) {
      const object = appearance?.get(key(name))
      if (!object) continue
      if (stream(state, object)) visitContent(state, object, (replacement) => appearance?.set(key(name), replacement))
      else {
        const states = dictionary(state, object)
        for (const [stateName, stateObject] of states?.entries() ?? []) visitContent(state, stateObject, (replacement) => states?.set(stateName, replacement))
      }
    }
  }
}

function visitShadings(state: WalkState, resources: PDFDict): void {
  const shadings = resources.lookupMaybe(key('Shading'), PDFDict)
  for (const [, object] of shadings?.entries() ?? []) {
    const found = dictionary(state, object)
    if (found) state.actions?.shading(found)
  }
}

function visitPatterns(state: WalkState, resources: PDFDict): void {
  const patterns = resources.lookupMaybe(key('Pattern'), PDFDict)
  for (const [name, object] of patterns?.entries() ?? []) {
    const found = dictionary(state, object)
    if (!found) continue
    if (numberOf(found, 'PatternType') === 2) {
      const shading = dictionary(state, found.get(key('Shading')))
      if (shading) state.actions?.shading(shading)
    } else visitContent(state, object, (replacement) => patterns?.set(name, replacement))
    visitResources(state, found.lookupMaybe(key('Resources'), PDFDict))
  }
}

function visitGraphicsStates(state: WalkState, resources: PDFDict): void {
  const graphicsStates = resources.lookupMaybe(key('ExtGState'), PDFDict)
  for (const [, object] of graphicsStates?.entries() ?? []) visitSoftMask(state, object)
}

function visitXObjects(state: WalkState, resources: PDFDict): void {
  const xObjects = resources.lookupMaybe(key('XObject'), PDFDict)
  for (const [name, object] of xObjects?.entries() ?? []) {
    const found = stream(state, object)
    if (!found) continue
    if (nameOf(found.dict.get(key('Subtype'))) === 'Image') state.actions?.image(found)
    else visitContent(state, object, (replacement) => xObjects?.set(name, replacement))
  }
}

function visitFonts(state: WalkState, resources: PDFDict): void {
  const fonts = resources.lookupMaybe(key('Font'), PDFDict)
  for (const [, object] of fonts?.entries() ?? []) {
    const font = dictionary(state, object)
    if (!font || nameOf(font.get(key('Subtype'))) !== 'Type3') continue
    const charProcs = font.lookupMaybe(key('CharProcs'), PDFDict)
    for (const [name, glyph] of charProcs?.entries() ?? []) visitContent(state, glyph, (replacement) => charProcs?.set(name, replacement))
    visitResources(state, font.lookupMaybe(key('Resources'), PDFDict))
  }
}

function visitResources(state: WalkState, resources: PDFDict | undefined): void {
  if (!resources || state.resources.has(resources)) return
  state.resources.add(resources)
  visitShadings(state, resources)
  visitPatterns(state, resources)
  visitGraphicsStates(state, resources)
  visitXObjects(state, resources)
  visitFonts(state, resources)
}

function traverse(document: PDFDocument, maskSources: WeakSet<PDFRawStream>, actions?: PressGraphActions): void {
  const state: WalkState = { document, maskSources, actions, references: new Set(), resources: new WeakSet(), streams: new WeakSet() }
  for (const page of document.getPages()) {
    actions?.group(page.node, undefined, false)
    const contents = page.node.Contents()
    if (contents instanceof PDFArray) {
      for (let index = 0; index < contents.size(); index++) visitContent(state, contents.get(index), (replacement) => contents.set(index, replacement))
    } else visitContent(state, contents, (replacement) => page.node.set(key('Contents'), replacement))
    visitResources(state, page.node.Resources())
    visitAppearances(state, page.node)
  }
}

export function walkPressGraph(document: PDFDocument, actions: PressGraphActions): void {
  const maskSources = new WeakSet<PDFRawStream>()
  traverse(document, maskSources)
  traverse(document, maskSources, actions)
}
