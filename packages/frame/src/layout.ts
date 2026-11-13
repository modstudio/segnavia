import { attributeValues, type HtmlElementAttributes, htmlElementAttributes } from '@segnavia/html'

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
  readonly selection: ProviderSelection
}

interface ProviderSelection {
  readonly tag?: string
  readonly attributes: readonly { name: string; operator: 'present' | 'exact' | 'token'; value?: string }[]
}

function parseSelection(selects: string): ProviderSelection | undefined {
  const match = /^([a-z][a-z0-9-]*)?((?:\[[a-z][a-z0-9-]*(?:(?:=|~=)"[^"]*")?\])+)$/i.exec(selects)
  if (!match) return undefined
  const attributes = Array.from(match[2]?.matchAll(/\[([a-z][a-z0-9-]*)(?:(=|~=)"([^"]*)")?\]/gi) ?? [], (held) => ({
    name: held[1]?.toLowerCase() ?? '',
    operator: held[2] === '=' ? ('exact' as const) : held[2] === '~=' ? ('token' as const) : ('present' as const),
    ...(held[3] === undefined ? {} : { value: held[3] }),
  }))
  return attributes.length > 0 ? { ...(match[1] ? { tag: match[1].toLowerCase() } : {}), attributes } : undefined
}

function selectionMatches(selection: ProviderSelection, element: HtmlElementAttributes): boolean {
  if (selection.tag && selection.tag !== element.name) return false
  return selection.attributes.every(({ name, operator, value }) => {
    const held = element.attributes[name]
    if (held === undefined) return false
    if (operator === 'present') return true
    if (operator === 'exact') return held === value
    return held.split(/\s+/).includes(value ?? '')
  })
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

function selectedLayoutNames(html: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const value of attributeValues(html, LAYOUT_ATTRIBUTE)) {
    for (const name of value.trim().split(/\s+/)) {
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

export function layoutsUsed(html: string): string[] {
  const names = selectedLayoutNames(html)
  const seen = new Set(names)
  const elements = htmlElementAttributes(html)
  for (const [name, provider] of registry()) {
    if (!seen.has(name) && elements.some((element) => selectionMatches(provider.selection, element))) {
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

export async function loadLayoutScripts(html: string): Promise<LoadedLayoutScript[]> {
  const names = layoutsUsed(html)
  if (names.length === 0) return []
  const providers = registry()
  const selected = names.map((name) => {
    const provider = providers.get(name)
    if (!provider) {
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
