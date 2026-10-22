import {
  mergeSlotDeclarations,
  type Scripts,
  type SlotDeclaration,
  type SlotReport,
  type SlotState,
  SlotsInput,
  type SlotsOptions,
  type SlotValue,
} from '@segnavia/format'
import { type ChildNode, type Element, isTag, Text } from 'domhandler'
import { bindingNames, hasBindings } from './bindings.ts'
import { qrPayload, qrSvg } from './qr.ts'
import { elements, parse, serialize } from './sanitize.ts'

export const MAX_SLOT_DECLARATIONS = 200
const ASSET_RESOLUTION_CONCURRENCY = 4

export interface PreparedSlots {
  declarations: SlotDeclaration[]
  report: SlotReport
  /** For each slot key, how many applications (one per rendered frame) marked it for measurement. */
  marked: ReadonlyMap<string, number>
  apply(html: string): string
  mergeFit(slots: Record<string, 'fit' | 'shrunk' | 'overflowed'>): SlotReport
}

export class SlotFillRefusedError extends Error {
  readonly scripts: Exclude<Scripts, 'refuse'>

  constructor(scripts: Exclude<Scripts, 'refuse'>) {
    super(
      `A fill was not applied because this item runs its own scripts (scripts: '${scripts}'), which could read the filled values. Set the item's scripts to 'refuse', or show it without a fill.`,
    )
    this.name = 'SlotFillRefusedError'
    this.scripts = scripts
  }
}

export {
  mergeSlotFitResults,
  RequiredSlotsRefusedError,
  requiredSlotRefusal,
  UnmeasuredSlotsRefusedError,
  unmeasuredSlotRefusal,
} from './slot-policy.ts'

import { mergeSlotFitResults } from './slot-policy.ts'

/** Whether an item needs slot preparation for declarations, filling, asset resolution or reporting. */
export function hasSlotWork(declarations: readonly SlotDeclaration[] | undefined, options: SlotsOptions | undefined): boolean {
  return Boolean(declarations?.length || options?.declarations?.length || options?.fill || options?.source || options?.resolveAsset || options?.report)
}

/** Refuses exposing filled values to an item's own scripts. */
export function slotFillRefusal(
  scripts: Scripts,
  declarations: readonly SlotDeclaration[] | undefined,
  options: SlotsOptions | undefined,
): SlotFillRefusedError | undefined {
  const fillsValues = (options?.fill || options?.source) && (declarations?.length || options.declarations?.length)
  return scripts !== 'refuse' && fillsValues ? new SlotFillRefusedError(scripts) : undefined
}

interface ResolvedSlots {
  data: Record<string, string>
  types: Record<string, SlotDeclaration['type']>
  report: SlotReport
  linkOrigins: Set<string>
  reportState?: (report: SlotReport) => void
  declarations: Map<string, SlotDeclaration>
  marked: Map<string, number>
  markedHere: Set<string>
}

const UNENCODED_TEXT_ELEMENTS = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript', 'textarea', 'title'])

// Void elements have no content to fill: a value bound to one would serialize after it.
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

function refusesValueBinding(tag: string): boolean {
  return UNENCODED_TEXT_ELEMENTS.has(tag) || VOID_ELEMENTS.has(tag)
}

function assertDeclarationLimit(declarations: readonly SlotDeclaration[], subject: string): void {
  if (declarations.length > MAX_SLOT_DECLARATIONS) {
    throw new RangeError(`${subject} declares ${declarations.length} slots; the limit is ${MAX_SLOT_DECLARATIONS}.`)
  }
}

function parsedHostDeclarations(options: SlotsOptions): SlotDeclaration[] {
  const declarations = options.declarations === undefined ? [] : SlotsInput.parse(options.declarations)
  assertDeclarationLimit(declarations, 'The host')
  return declarations
}

function mergedDeclarations(groups: ReadonlyArray<readonly SlotDeclaration[]>, options: SlotsOptions): SlotDeclaration[] {
  groups.forEach((group, index) => {
    assertDeclarationLimit(group, groups.length === 1 ? 'The item' : `Item ${index + 1}`)
  })
  return mergeSlotDeclarations(parsedHostDeclarations(options), ...groups)
}

function applyValue(element: Element, name: string, resolved: ResolvedSlots): void {
  const path = element.attribs[name]
  if (path === undefined) return
  delete element.attribs[name]
  const value = resolved.data[path]
  if (value === undefined) return
  if (resolved.types[path] === 'qr') {
    const svg = qrSvg(value)
    svg.parent = element
    element.children = [svg]
    return
  }
  const text = new Text(value)
  text.parent = element
  element.children = [text]
  if (element.attribs.dir === undefined) element.attribs.dir = 'auto'
}

function invalidBinding(element: Element, names: ReturnType<typeof bindingNames>, report: SlotReport): string | undefined {
  const tag = element.name.toLowerCase()
  const value = element.attribs[names.value]
  if (value !== undefined && report.slots[value] !== undefined && refusesValueBinding(tag)) {
    report.slots[value] = 'invalid'
    return `Slot "${value}" uses a value binding on <${tag}>, whose content cannot be filled safely.`
  }
  const src = element.attribs[names.src]
  if (src !== undefined && report.slots[src] !== undefined && tag !== 'img') {
    report.slots[src] = 'invalid'
    return `Slot "${src}" uses a src binding on <${tag}>; src bindings are allowed only on <img>.`
  }
  const href = element.attribs[names.href]
  if (href !== undefined && report.slots[href] !== undefined && tag !== 'a' && tag !== 'area') {
    report.slots[href] = 'invalid'
    return `Slot "${href}" uses an href binding on <${tag}>; href bindings are allowed only on <a> and <area>.`
  }
  return undefined
}

function applyUrl(element: Element, attribute: 'href' | 'src', name: string, resolved: ResolvedSlots): void {
  const path = element.attribs[name]
  if (path === undefined) return
  delete element.attribs[name]
  const value = resolved.data[path]
  if (typeof value !== 'string') return
  if (attribute === 'src') {
    if (/^data:image\//i.test(value)) element.attribs.src = value
    return
  }
  try {
    if (resolved.linkOrigins.has(new URL(value).origin)) element.attribs.href = value
  } catch {}
}

// Without a fill the design shows as authored, placeholders included; an element
// collapses only when a fill leaves its slot empty.
function applyPresent(element: Element, name: string, report: SlotReport): boolean {
  const path = element.attribs[name]
  if (path === undefined) return true
  delete element.attribs[name]
  return report.fill === null || report.slots[path] === 'filled'
}

function markOverflow(element: Element, names: ReturnType<typeof bindingNames>, resolved: ResolvedSlots): void {
  if (resolved.report.fill === null) return
  for (const binding of Object.values(names)) {
    const key = element.attribs[binding]
    if (key === undefined) continue
    const declaration = resolved.declarations.get(key)
    const overflow = declaration?.overflow ?? 'wrap'
    // Only a value the fill supplied is measured: the design's placeholder text says nothing about the fill.
    if (!declaration || overflow === 'wrap' || resolved.report.slots[key] !== 'filled') continue
    element.attribs['data-slot-overflow'] = `${encodeURIComponent(key)}:${overflow}${overflow === 'shrink' ? `:${declaration.minSize ?? 6}` : ''}`
    resolved.markedHere.add(key)
    return
  }
}

function applyElements(elements: Element[], names: ReturnType<typeof bindingNames>, resolved: ResolvedSlots): Element[] {
  return elements.flatMap((element) => {
    if (!applyPresent(element, names.present, resolved.report)) return []
    // Overflow markers are bridge instructions owned by this library, so authored values cannot survive slot application.
    delete element.attribs['data-slot-overflow']
    markOverflow(element, names, resolved)
    applyValue(element, names.value, resolved)
    applyUrl(element, 'href', names.href, resolved)
    applyUrl(element, 'src', names.src, resolved)
    element.children = element.children.flatMap((child): ChildNode[] => {
      if (!isTag(child)) return [child]
      return applyElements([child], names, resolved).map((kept) => {
        kept.parent = element
        return kept
      })
    })
    return [element]
  })
}

function bindingRefusal(roots: Element[], names: ReturnType<typeof bindingNames>, resolved: ResolvedSlots): RangeError | undefined {
  const reasons: string[] = []
  const visit = (element: Element) => {
    const reason = invalidBinding(element, names, resolved.report)
    if (reason) reasons.push(reason)
    for (const child of element.children) if (isTag(child)) visit(child)
  }
  for (const root of roots) visit(root)
  if (reasons.length === 0) return undefined
  resolved.reportState?.(resolved.report)
  return new RangeError(reasons.join(' '))
}

function validString(type: SlotDeclaration['type'], value: string): boolean {
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  if (type === 'qr') return qrPayload(value) !== undefined
  if (type === 'link') {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }
  if (type === 'image') return /^data:image\//i.test(value)
  return true
}

function assetResolver(options: SlotsOptions, signal: AbortSignal): (ref: string) => Promise<string | undefined> {
  const cached = new Map<string, Promise<string | undefined>>()
  const waiting: Array<() => void> = []
  let running = 0
  const acquire = () => {
    if (running < ASSET_RESOLUTION_CONCURRENCY) {
      running++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => waiting.push(resolve))
  }
  const release = () => {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
  return (ref) => {
    const held = cached.get(ref)
    if (held) return held
    const resolution = (async () => {
      if (!options.resolveAsset) return undefined
      await acquire()
      try {
        return await options.resolveAsset(ref, { signal })
      } catch {
        return undefined
      } finally {
        release()
      }
    })()
    cached.set(ref, resolution)
    return resolution
  }
}

async function valueFor(
  slot: SlotDeclaration,
  value: SlotValue | undefined,
  resolveAsset: (ref: string) => Promise<string | undefined>,
): Promise<{ value?: string; state: SlotState }> {
  if (value === undefined) {
    if (slot.placeholder === undefined) return { state: 'unavailable' }
    return validString(slot.type, slot.placeholder) ? { value: slot.placeholder, state: 'placeholder' } : { state: 'invalid' }
  }
  if (typeof value === 'string') return validString(slot.type, value) ? { value, state: 'filled' } : { state: 'invalid' }
  if (slot.type !== 'image' || !value || typeof value.asset !== 'string') return { state: 'invalid' }
  const resolved = await resolveAsset(value.asset)
  if (resolved === undefined) return { state: 'unavailable' }
  return /^data:image\//i.test(resolved) ? { value: resolved, state: 'filled' } : { state: 'invalid' }
}

function layeredValue(key: string, options: SlotsOptions): { value?: SlotValue; origin?: 'hand' | 'source' } {
  const hand = options.fill?.values[key]
  if (hand !== undefined && hand !== '') return { value: hand, origin: 'hand' }
  const source = options.source?.values[key]
  if (source !== undefined && source !== '') return { value: source, origin: 'source' }
  return {}
}

async function resolveSlots(declarations: readonly SlotDeclaration[], options: SlotsOptions, signal: AbortSignal): Promise<ResolvedSlots> {
  const data: Record<string, string> = {}
  const types: Record<string, SlotDeclaration['type']> = {}
  const states: Record<string, SlotState> = {}
  const origins: SlotReport['origins'] = {}
  const linkOrigins = new Set<string>()
  const resolveAsset = assetResolver(options, signal)
  await Promise.all(
    declarations.map(async (slot) => {
      types[slot.key] = slot.type
      const selected = layeredValue(slot.key, options)
      const resolved = await valueFor(slot, selected.value, resolveAsset)
      states[slot.key] = resolved.state
      if (selected.origin) origins[slot.key] = selected.origin
      if (resolved.value !== undefined) {
        data[slot.key] = resolved.value
        if (slot.type === 'link' && resolved.state === 'filled') linkOrigins.add(new URL(resolved.value).origin)
      }
    }),
  )
  signal.throwIfAborted()
  const report = { fill: options.fill?.id ?? options.source?.id ?? null, slots: states, origins }
  options.report?.(report)
  return {
    data,
    types,
    report,
    linkOrigins,
    reportState: options.report,
    declarations: new Map(declarations.map((slot) => [slot.key, slot])),
    marked: new Map(),
    markedHere: new Set(),
  }
}

function applySlots(html: string, resolved: ResolvedSlots): string {
  if (!hasBindings(html, 'slot') && !html.includes('data-slot-overflow')) return html
  const names = bindingNames('slot')
  const document = parse(html)
  const bound = elements(document.children).filter(
    (element) => element.attribs['data-slot-overflow'] !== undefined || Object.values(names).some((name) => element.attribs[name] !== undefined),
  )
  const roots = bound.filter((element) => {
    for (let parent = element.parent; parent; parent = parent.parent) if (isTag(parent) && bound.includes(parent)) return false
    return true
  })
  const refusal = bindingRefusal(roots, names, resolved)
  if (refusal) throw refusal
  resolved.markedHere.clear()
  const kept = applyElements(roots, names, resolved)
  // Each application becomes one frame, and each frame reports a key at most once.
  for (const key of resolved.markedHere) resolved.marked.set(key, (resolved.marked.get(key) ?? 0) + 1)
  const replacements = roots
    .map((root) => ({ start: root.startIndex, end: root.endIndex, html: kept.includes(root) ? serialize(root) : '' }))
    .filter((part): part is { start: number; end: number; html: string } => part.start !== null && part.end !== null)
    .sort((a, b) => b.start - a.start)
  return replacements.reduce((output, part) => `${output.slice(0, part.start)}${part.html}${output.slice(part.end + 1)}`, html)
}

async function prepared(declarations: SlotDeclaration[], options: SlotsOptions, signal: AbortSignal): Promise<PreparedSlots> {
  const resolved = await resolveSlots(declarations, options, signal)
  const result: PreparedSlots = {
    declarations,
    report: resolved.report,
    marked: resolved.marked,
    apply: (html) => applySlots(html, resolved),
    mergeFit: (slots) => {
      const report = mergeSlotFitResults(declarations, result.report, slots)
      result.report = report
      resolved.report = report
      options.report?.(report)
      return report
    },
  }
  return result
}

/** Prepares and applies the slots declared by one item. */
export async function prepareSlots(
  declarations: readonly SlotDeclaration[] | undefined,
  options: SlotsOptions = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<PreparedSlots> {
  return prepared(mergedDeclarations([declarations ?? []], options), options, signal)
}

/** Prepares one shared fill for a collection, merging each item's declarations exactly once. */
export async function prepareSlotCollection(
  groups: ReadonlyArray<readonly SlotDeclaration[] | undefined>,
  options: SlotsOptions = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<PreparedSlots> {
  return prepared(
    mergedDeclarations(
      groups.map((group) => group ?? []),
      options,
    ),
    options,
    signal,
  )
}
