import {
  chooseMotifVersion,
  type FontReference,
  MOTIF_ATTRIBUTE,
  type Motif,
  type MotifPlacement,
  type MotifSource,
  motifFieldAttribute,
  resolveDirection,
  type Scripts,
} from '@segnavia/format'
import { type ChildNode, type Document, type Element, isTag } from 'domhandler'
import { fill, hasBindings } from './bindings.ts'
import { parse, sanitize, serialize } from './sanitize.ts'

export const MOTIF_DEPTH_LIMIT = 8
export const MOTIF_PLACEMENT_LIMIT = 256

export interface ExpandMotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  lang?: string
  scripts: Scripts
  prefix: string
  linkOrigins?: Iterable<string>
  signal: AbortSignal
}

export interface PlacedMotif extends MotifPlacement {
  version: number
}

export interface ExpandedMotifs {
  html: string
  placed: PlacedMotif[]
  fonts: FontReference[]
  unavailable: string[]
}

export class MotifRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MotifRefusedError'
  }
}

interface ExpansionState {
  options: ExpandMotifsOptions
  validateOnly: boolean
  refusals: string[]
  placed: PlacedMotif[]
  fonts: Map<string, FontReference>
  unavailable: Set<string>
  motifCache: Map<string, Promise<Motif | undefined>>
  placements: number
}

function placementName(element: Element): string {
  const attributes = Object.entries(element.attribs)
    .filter(([name]) => name === MOTIF_ATTRIBUTE || name.startsWith(`${MOTIF_ATTRIBUTE}-`))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(', ')
  return `motif placement ${attributes || `${MOTIF_ATTRIBUTE}=""`}`
}

function refusal(element: Element, problem: string, remedy: string): string {
  return `${placementName(element)} could not establish ${problem}; ${remedy} to clear this refusal.`
}

function refuse(state: ExpansionState, element: Element, problem: string, remedy: string): false {
  const message = refusal(element, problem, remedy)
  if (!state.validateOnly) throw new MotifRefusedError(message)
  state.refusals.push(message)
  return false
}

function placementValues(element: Element, motif: Motif, inheritedLang: string | undefined, state: ExpansionState): Record<string, string> | undefined {
  const known = new Set(motif.fields.map((field) => motifFieldAttribute(field.key).toLowerCase()))
  known.add(motifFieldAttribute('lang').toLowerCase())
  const unknown = Object.keys(element.attribs).filter((name) => name.startsWith(`${MOTIF_ATTRIBUTE}-`) && !known.has(name))
  if (unknown.length > 0) {
    refuse(state, element, `fields for ${unknown.join(', ')}`, 'remove the unknown field attributes')
    return undefined
  }

  const values: Record<string, string> = {}
  for (const field of motif.fields) {
    const value = element.attribs[motifFieldAttribute(field.key).toLowerCase()] ?? field.default
    if (value === undefined) {
      if (field.required) {
        refuse(state, element, `a value for required field "${field.key}"`, `set ${motifFieldAttribute(field.key)}`)
        return undefined
      }
      continue
    }
    if (field.choices && !field.choices.includes(value)) {
      refuse(state, element, `an allowed value for field "${field.key}"`, `set ${motifFieldAttribute(field.key)} to one of ${field.choices.join(', ')}`)
      return undefined
    }
    values[field.key] = value
  }
  const lang = element.attribs[motifFieldAttribute('lang')] ?? inheritedLang
  if (lang !== undefined) values.lang = lang
  return values
}

function replaceChildren(element: Element, html: string): void {
  const children = parse(html).children
  for (const child of children) child.parent = element
  element.children = children
}

async function motifFor(element: Element, state: ExpansionState): Promise<Motif | undefined> {
  const key = element.attribs[MOTIF_ATTRIBUTE] ?? ''
  if (!key) {
    refuse(state, element, 'a motif key', `set ${MOTIF_ATTRIBUTE} to a known motif key`)
    return undefined
  }
  const revision = state.options.pins && Object.hasOwn(state.options.pins, key) ? state.options.pins[key] : undefined
  const cacheKey = JSON.stringify([key, revision])
  let request = state.motifCache.get(cacheKey)
  if (!request) {
    request = state.options.source.motif(key, { ...(revision === undefined ? {} : { revision }), signal: state.options.signal })
    state.motifCache.set(cacheKey, request)
  }
  const motif = await request
  state.options.signal.throwIfAborted()
  if (!motif) {
    refuse(state, element, `motif "${key}"${revision ? ` at revision "${revision}"` : ''}`, 'make that motif available from the source')
    return undefined
  }
  return motif
}

async function expandPlacement(element: Element, inheritedLang: string | undefined, stack: string[], state: ExpansionState): Promise<void> {
  state.options.signal.throwIfAborted()
  state.placements += 1
  if (state.placements > MOTIF_PLACEMENT_LIMIT) {
    refuse(state, element, `at most ${MOTIF_PLACEMENT_LIMIT} expanded motif placements`, 'reduce the number of motif placements')
    return
  }
  const motif = await motifFor(element, state)
  if (!motif) return
  if (stack.includes(motif.key)) {
    refuse(state, element, `an acyclic motif path because "${motif.key}" occurs in ${[...stack, motif.key].join(' -> ')}`, 'remove the motif cycle')
    return
  }
  if (stack.length >= MOTIF_DEPTH_LIMIT) {
    refuse(state, element, `a nesting depth within ${MOTIF_DEPTH_LIMIT}`, 'reduce the motif nesting depth')
    return
  }

  const values = placementValues(element, motif, inheritedLang, state)
  if (!values) return
  const choice = chooseMotifVersion(motif, values)
  if (!choice.ok) {
    refuse(state, element, `a unique matching version: ${choice.reason}`, 'add or revise a matching motif version or its placement values')
    return
  }
  const bound = hasBindings(choice.version.html, state.options.prefix)
  if (bound && state.options.scripts !== 'refuse') {
    refuse(state, element, 'a data-free motif version for a scripted page', 'remove its bindings or refuse page scripts')
    return
  }
  if (bound && !state.options.source.data) {
    refuse(state, element, 'data for the motif version bindings', 'provide MotifSource.data or remove the bindings')
    return
  }

  const lang = choice.version.lang
  const fields = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'lang'))
  const placement = { key: motif.key, revision: motif.revision, lang, fields }
  let versionHtml = sanitize(choice.version.html, { linkOrigins: state.options.linkOrigins })
  if (bound && !state.validateOnly) {
    const data = await state.options.source.data?.(placement, { signal: state.options.signal })
    state.options.signal.throwIfAborted()
    const filled = fill(versionHtml, {
      prefix: state.options.prefix,
      data: data ?? {},
      linkOrigins: state.options.linkOrigins,
      registerHrefOrigins: true,
    })
    versionHtml = filled.html
    for (const path of filled.unavailable) state.unavailable.add(path)
  }

  element.attribs.lang = lang
  element.attribs.dir = choice.version.dir ?? resolveDirection(undefined, lang, versionHtml)
  replaceChildren(element, versionHtml)
  if (!state.validateOnly) {
    state.placed.push({ ...placement, version: choice.index })
    for (const font of motif.fonts) state.fonts.set(JSON.stringify(font), font)
  }
  await expandNodes(element.children, lang, [...stack, motif.key], state)
}

async function expandNodes(nodes: ChildNode[], inheritedLang: string | undefined, stack: string[], state: ExpansionState): Promise<void> {
  for (const node of [...nodes]) {
    state.options.signal.throwIfAborted()
    if (!isTag(node)) continue
    if (Object.hasOwn(node.attribs, MOTIF_ATTRIBUTE)) await expandPlacement(node, inheritedLang, stack, state)
    else await expandNodes(node.children, inheritedLang, stack, state)
  }
}

async function run(html: string, options: ExpandMotifsOptions, validateOnly: boolean): Promise<{ document: Document; state: ExpansionState }> {
  const document = parse(html)
  const state: ExpansionState = {
    options,
    validateOnly,
    refusals: [],
    placed: [],
    fonts: new Map(),
    unavailable: new Set(),
    motifCache: new Map(),
    placements: 0,
  }
  await expandNodes(document.children, options.lang, [], state)
  return { document, state }
}

export async function expandMotifs(html: string, options: ExpandMotifsOptions): Promise<ExpandedMotifs> {
  const { document, state } = await run(html, options, false)
  return { html: serialize(document), placed: state.placed, fonts: [...state.fonts.values()], unavailable: [...state.unavailable] }
}

export async function motifPlacementRefusals(html: string, options: ExpandMotifsOptions): Promise<string[]> {
  return (await run(html, options, true)).state.refusals
}
