import { type HtmlElementAttributes, htmlElementAttributes } from '@segnavia/html'
import { matchingLayoutMarkers } from './layout-markers.ts'
import { type LayoutSelection, parseSelection, selectionMatches } from './layout-selection.ts'

export const LAYOUT_ATTRIBUTE = 'data-segnavia-layout'
export const LAYOUT_FRAME_ATTRIBUTE = 'data-segnavia-layout-frame'
export const LAYOUT_PHASE_TIMEOUT_MS = 10_000

export interface LayoutProvider {
  readonly script: () => Promise<string>
  readonly priority?: number
  readonly selects?: string
}

export interface LoadedLayoutScript {
  readonly name: string
  readonly script: string
  readonly priority: number
  readonly order: number
  readonly selects: string
}

interface RegisteredLayoutProvider {
  readonly script: () => Promise<string>
  readonly priority: number
  readonly selects: string
  readonly order: number
  readonly selection: LayoutSelection
}

const LAYOUT_PROVIDERS_KEY = Symbol.for('segnavia.layout-providers')
type LayoutRegistryGlobal = typeof globalThis & { [LAYOUT_PROVIDERS_KEY]?: Map<string, RegisteredLayoutProvider> }

function registry(): Map<string, RegisteredLayoutProvider> {
  const held = globalThis as LayoutRegistryGlobal
  const existing = held[LAYOUT_PROVIDERS_KEY]
  if (existing) return existing
  const created = new Map<string, RegisteredLayoutProvider>()
  held[LAYOUT_PROVIDERS_KEY] = created
  return created
}

function validName(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name)
}

export function registerLayoutProvider(name: string, provider: LayoutProvider): void {
  if (!validName(name)) throw new Error(`Layout provider name ${JSON.stringify(name)} is invalid; use a lowercase CSS identifier to clear this refusal.`)
  const priority = provider?.priority ?? 0
  const selects = provider?.selects ?? `[${LAYOUT_ATTRIBUTE}~="${name}"]`
  const selection = typeof selects === 'string' ? parseSelection(selects) : undefined
  if (!provider || typeof provider.script !== 'function' || !Number.isFinite(priority) || !selection) {
    throw new Error(
      `Layout provider ${JSON.stringify(name)} is invalid; pass { script, priority, selects } with selects as one compound tag and attribute selector to clear this refusal.`,
    )
  }
  const providers = registry()
  const previous = providers.get(name)
  providers.set(name, { script: provider.script, priority, selects, selection, order: previous?.order ?? providers.size })
}

export function hasLayoutProvider(name: string): boolean {
  return registry().has(name)
}

function selectedLayoutNames(elements: readonly HtmlElementAttributes[]): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const value of elements.flatMap((element) => element.attributes[LAYOUT_ATTRIBUTE] ?? [])) {
    for (const name of value.trim().split(/\s+/)) {
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

function layoutsForElements(elements: readonly HtmlElementAttributes[], markers = matchingLayoutMarkers(elements)): string[] {
  const names = selectedLayoutNames(elements)
  const seen = new Set(names)
  for (const marker of markers) {
    if (seen.has(marker.name)) continue
    seen.add(marker.name)
    names.push(marker.name)
  }
  for (const [name, provider] of registry()) {
    if (!seen.has(name) && elements.some((element) => selectionMatches(provider.selection, element))) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

export function layoutsUsed(html: string): string[] {
  return layoutsForElements(htmlElementAttributes(html))
}

export function layoutsForHtml(html: string, scripts: readonly LoadedLayoutScript[]): readonly LoadedLayoutScript[] {
  const names = new Set(layoutsUsed(html))
  return scripts.filter((script) => names.has(script.name))
}

export async function loadLayoutScripts(html: string): Promise<LoadedLayoutScript[]> {
  const elements = htmlElementAttributes(html)
  const matchedMarkers = matchingLayoutMarkers(elements)
  const names = layoutsForElements(elements, matchedMarkers)
  if (names.length === 0) return []
  const providers = registry()
  const markers = new Map(matchedMarkers.map((marker) => [marker.name, marker]))
  const selected = names.map((name) => {
    const provider = providers.get(name)
    if (!provider) {
      const marker = markers.get(name)
      if (marker) {
        throw new Error(`This content uses layout provider ${JSON.stringify(name)}, but it is not registered. To clear this refusal: ${marker.remedy}.`)
      }
      throw new Error(
        `This content selects layout provider ${JSON.stringify(name)}, but it is not registered. Call registerLayoutProvider(${JSON.stringify(name)}, …) from '@segnavia/frame/layout' to clear this refusal.`,
      )
    }
    return { name, provider }
  })
  selected.sort((left, right) => left.provider.priority - right.provider.priority || left.provider.order - right.provider.order)
  return Promise.all(
    selected.map(async ({ name, provider }) => {
      const script = await provider.script()
      if (/<\/script/i.test(script)) {
        throw new Error(`Layout provider ${name} returned a script containing </script; remove or escape that sequence to clear this refusal.`)
      }
      return { name, script, priority: provider.priority, order: provider.order, selects: provider.selects }
    }),
  )
}

export function resetLayoutProvidersForTest(): void {
  registry().clear()
}
