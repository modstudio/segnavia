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
import { type Element, isTag, Text } from 'domhandler'
import { bindingNames, hasBindings } from './bindings.ts'
import { elements, parse, serialize } from './sanitize.ts'

export const MAX_SLOT_DECLARATIONS = 200
const ASSET_RESOLUTION_CONCURRENCY = 4

export interface PreparedSlots {
  report: SlotReport
  apply(html: string): string
}

export class SlotFillRefusedError extends Error {
  constructor(scripts: Exclude<Scripts, 'refuse'>) {
    super(
      `A fill was not applied because this item runs its own scripts (scripts: '${scripts}'), which could read the filled values. Set the item's scripts to 'refuse', or show it without a fill.`,
    )
    this.name = 'SlotFillRefusedError'
  }
}

/** Whether slot preparation can change an item's HTML. */
export function hasSlotWork(declarations: readonly SlotDeclaration[] | undefined, options: SlotsOptions | undefined): boolean {
  return Boolean(options?.fill && (declarations?.length || options.declarations?.length))
}

/** Refuses exposing filled values to an item's own scripts. */
export function slotFillRefusal(scripts: Scripts, work: boolean): SlotFillRefusedError | undefined {
  return scripts !== 'refuse' && work ? new SlotFillRefusedError(scripts) : undefined
}

interface ResolvedSlots {
  data: Record<string, string>
  report: SlotReport
  linkOrigins: Set<string>
  reportState?: (report: SlotReport) => void
}

const UNENCODED_TEXT_ELEMENTS = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript', 'textarea', 'title'])

function refusesValueBinding(tag: string): boolean {
  return UNENCODED_TEXT_ELEMENTS.has(tag)
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

function applyText(element: Element, name: string, data: Record<string, string>): void {
  const path = element.attribs[name]
  if (path === undefined) return
  delete element.attribs[name]
  const value = data[path]
  if (value === undefined) return
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
    return `Slot "${value}" uses a value binding on <${tag}>, whose raw-text content cannot be filled safely.`
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

function applyElement(element: Element, names: ReturnType<typeof bindingNames>, resolved: ResolvedSlots): void {
  applyText(element, names.value, resolved.data)
  applyUrl(element, 'href', names.href, resolved)
  applyUrl(element, 'src', names.src, resolved)
  for (const child of element.children) if (isTag(child)) applyElement(child, names, resolved)
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

async function resolveSlots(declarations: readonly SlotDeclaration[], options: SlotsOptions, signal: AbortSignal): Promise<ResolvedSlots> {
  const data: Record<string, string> = {}
  const states: Record<string, SlotState> = {}
  const linkOrigins = new Set<string>()
  const resolveAsset = assetResolver(options, signal)
  await Promise.all(
    declarations.map(async (slot) => {
      const resolved = await valueFor(slot, options.fill?.values[slot.key], resolveAsset)
      states[slot.key] = resolved.state
      if (resolved.value !== undefined) {
        data[slot.key] = resolved.value
        if (slot.type === 'link' && resolved.state === 'filled') linkOrigins.add(new URL(resolved.value).origin)
      }
    }),
  )
  signal.throwIfAborted()
  const report = { fill: options.fill?.id ?? null, slots: states }
  options.report?.(report)
  return { data, report, linkOrigins, reportState: options.report }
}

function applySlots(html: string, resolved: ResolvedSlots): string {
  if (Object.keys(resolved.report.slots).length === 0 || !hasBindings(html, 'slot')) return html
  const names = bindingNames('slot')
  const document = parse(html)
  const bound = elements(document.children).filter((element) => Object.values(names).some((name) => element.attribs[name] !== undefined))
  const roots = bound.filter((element) => {
    for (let parent = element.parent; parent; parent = parent.parent) if (isTag(parent) && bound.includes(parent)) return false
    return true
  })
  const refusal = bindingRefusal(roots, names, resolved)
  if (refusal) throw refusal
  for (const root of roots) applyElement(root, names, resolved)
  const replacements = roots
    .map((root) => ({ start: root.startIndex, end: root.endIndex, html: serialize(root) }))
    .filter((part): part is { start: number; end: number; html: string } => part.start !== null && part.end !== null)
    .sort((a, b) => b.start - a.start)
  return replacements.reduce((output, part) => `${output.slice(0, part.start)}${part.html}${output.slice(part.end + 1)}`, html)
}

async function prepared(declarations: SlotDeclaration[], options: SlotsOptions, signal: AbortSignal): Promise<PreparedSlots> {
  const resolved = await resolveSlots(declarations, options, signal)
  return { report: resolved.report, apply: (html) => applySlots(html, resolved) }
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
