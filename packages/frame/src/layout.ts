export const LAYOUT_ATTRIBUTE = 'data-segnavia-layout'
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
  const selects = provider?.selects ?? `[data-segnavia-layout~="${name}"]`
  if (!provider || typeof provider.script !== 'function' || !Number.isFinite(priority) || typeof selects !== 'string' || !selects) {
    throw new Error(`Layout provider ${JSON.stringify(name)} is invalid; pass { script, priority, selects } to clear this refusal.`)
  }
  const providers = registry()
  const previous = providers.get(name)
  providers.set(name, { script: provider.script, priority, selects, order: previous?.order ?? providers.size })
}

function selectedLayoutNames(html: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  const pattern = /\bdata-segnavia-layout\s*=\s*(["'])(.*?)\1/gi
  for (const match of html.matchAll(pattern)) {
    for (const name of (match[2] ?? '').trim().split(/\s+/)) {
      if (!name || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}

export function layoutsUsed(html: string): string[] {
  return selectedLayoutNames(html)
}

export async function loadLayoutScripts(html: string): Promise<LoadedLayoutScript[]> {
  const names = selectedLayoutNames(html)
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
    selected.map(async ({ name, provider }) => ({
      name,
      script: await provider.script(),
      priority: provider.priority,
      order: provider.order,
      selects: provider.selects,
    })),
  )
}

export function resetLayoutProvidersForTest(): void {
  registry().clear()
}
