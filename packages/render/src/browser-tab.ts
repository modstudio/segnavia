import { Buffer } from 'node:buffer'
import {
  type FetchKind,
  type FontFailure,
  type LimitExceeded,
  type Limits,
  limitExceeded,
  type OriginApproval,
  originDecision,
  type ResolvedLimits,
  resolveLimits,
} from '@segnavia/format'
import { FONT_FAILURE_ATTRIBUTE, fontFailuresAttribute } from '@segnavia/frame/bridge'
import { assetOriginRefusals, type PreparedSlots } from '@segnavia/html'
import type { Browser, BrowserContext, BrowserContextOptions, Page as Tab } from 'playwright-core'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import type { AssetAnswer, AssetBudget, Assets } from './options.ts'
import { type RenderDeadline, withinBound } from './render-deadline.ts'
import { RENDER_READY_BINDING, type RenderReadiness, readinessRefusal, waitsForReadiness } from './render-readiness.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'
import { RENDER_PROGRESS_BINDING, reportRenderProgress } from './progress.ts'
import { installSlotFitCapture, mergeCapturedSlotFit } from './slot-fit.ts'

export interface BrowserTabSetup {
  viewport: { width: number; height: number }
  scripts: boolean
  scale?: number
  html: string
  readiness: RenderReadiness
  beforeOutput?: (tab: Tab) => Promise<void>
  origins?: Iterable<OriginApproval>
  assets?: Assets
  assetBudget?: AssetBudget
  limits?: Limits
  fontFailures?: FontFailure[]
  fontLoadReport?: (report: { failures: FontFailure[] }) => void
  progressReport?: (progress: { pages: number; total: number }) => void
}

export type TabRunner = <T>(
  setup: BrowserTabSetup & { boundMs?: number; deadline?: RenderDeadline; slots?: PreparedSlots },
  body: (tab: Tab) => Promise<T>,
) => Promise<T>

export const fontLoadSetup = (
  failures: FontFailure[],
  report: BrowserTabSetup['fontLoadReport'],
): Pick<BrowserTabSetup, 'fontFailures' | 'fontLoadReport'> => ({
  fontFailures: failures,
  fontLoadReport: report,
})

export type AssetRouteDecision =
  | { action: 'continue' }
  | { action: 'abort'; reason: string }
  | { action: 'missing'; url: string }
  | ({ action: 'fulfill' } & AssetAnswer)

export function mergedFontFailures(initial: readonly FontFailure[], attribute: string | null): FontFailure[] {
  return [...initial, ...fontFailuresAttribute(attribute)]
}

export async function assetRouteDecision(
  url: string,
  kind: FetchKind | undefined,
  origins: Iterable<OriginApproval> | undefined,
  lookup: Assets | undefined,
  signal: AbortSignal,
  scripts = true,
): Promise<AssetRouteDecision> {
  if (url.startsWith('data:') || url === 'about:blank') return { action: 'continue' }
  if (!kind) return { action: 'abort', reason: `${url} uses unsupported fetching; no asset kind can approve it` }
  const policy = originDecision(url, kind, origins, scripts)
  if (!policy.allowed) return { action: 'abort', reason: policy.reason }
  let answer: AssetAnswer | undefined
  try {
    answer = await lookup?.(url, { kind, signal })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { action: 'abort', reason: `The host assets option rejected ${url}: ${message}; answer the approved asset to clear this refusal` }
  }
  if (signal.aborted)
    return { action: 'abort', reason: `${url} answered after its asset request was aborted; settle assets before the render ends to clear this refusal` }
  return answer ? { action: 'fulfill', ...answer } : { action: 'missing', url }
}

export function assetLimitRefusal(url: string, bytes: number, total: number, limits: ResolvedLimits['assets']): LimitExceeded | undefined {
  if (bytes > limits.each) {
    return limitExceeded('assets.each', bytes, limits.each, { where: url, setting: 'limits.assets.each' })
  }
  if (total + bytes > limits.bytes) {
    return limitExceeded('assets.bytes', total + bytes, limits.bytes, { where: url, setting: 'limits.assets.bytes' })
  }
  return undefined
}

export function fetchKind(resourceType: string): FetchKind | undefined {
  if (resourceType === 'script') return 'script'
  if (resourceType === 'stylesheet') return 'style'
  if (resourceType === 'font') return 'font'
  if (resourceType === 'image') return 'image'
  return undefined
}

export function browserContextOptions(setup: Pick<BrowserTabSetup, 'viewport' | 'scale' | 'scripts'>): BrowserContextOptions {
  return {
    viewport: setup.viewport,
    deviceScaleFactor: setup.scale ?? 1,
    javaScriptEnabled: setup.scripts,
    offline: true,
    serviceWorkers: 'block',
  }
}

export async function renderInBrowserTab<T>(
  browser: Browser,
  setup: BrowserTabSetup,
  measureSlots: PreparedSlots | undefined,
  state: { settled(): boolean; opened(context: BrowserContext): void; crashed(): void },
  body: (tab: Tab) => Promise<T>,
): Promise<T> {
  const markupRefusals = assetOriginRefusals(setup.html, { keepScripts: setup.scripts, origins: setup.origins })
  if (markupRefusals.length > 0) throw new RenderRefusedError([...new Set(markupRefusals)].join('; '))
  const context = await browser.newContext(browserContextOptions(setup))
  state.opened(context)
  if (state.settled()) {
    await context.close().catch(() => {})
    return undefined as T
  }
  if (measureSlots) await installSlotFitCapture(context)
  const refused = new Set<string>()
  const exceeded = new Map<string, LimitExceeded>()
  const missing = new Set<string>()
  const controller = new AbortController()
  const assetLimits = resolveLimits(undefined, setup.limits).assets
  const assetBudget = setup.assetBudget ?? { bytes: 0 }
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    const kind = fetchKind(route.request().resourceType())
    const decision = await assetRouteDecision(url, kind, setup.origins, setup.assets, controller.signal, setup.scripts)
    if (decision.action === 'continue') await route.continue()
    else if (decision.action === 'abort') {
      refused.add(decision.reason)
      await route.abort('blockedbyclient')
    } else if (decision.action === 'fulfill') {
      const bytes = decision.body.byteLength
      const limitRefusal = assetLimitRefusal(url, bytes, assetBudget.bytes, assetLimits)
      if (limitRefusal) {
        refused.add(limitRefusal.message)
        exceeded.set(limitRefusal.message, limitRefusal)
        await route.abort('blockedbyclient')
      } else {
        assetBudget.bytes += bytes
        await route.fulfill({ body: Buffer.from(decision.body), contentType: decision.contentType })
      }
    } else {
      missing.add(decision.url)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    refused.add(`${socket.url()} uses unsupported websocket fetching; no asset kind can approve it`)
    socket.close()
  })
  const tab = await context.newPage()
  tab.on('crash', state.crashed)
  let authorReady = !setup.readiness.author
  let diagramsReady = !setup.readiness.diagrams
  let resolveAuthor: (() => void) | undefined
  let resolveDiagrams: (() => void) | undefined
  const authorPromise = new Promise<void>((resolve) => {
    resolveAuthor = resolve
  })
  const diagramPromise = new Promise<void>((resolve) => {
    resolveDiagrams = resolve
  })
  if (setup.readiness.author) {
    await tab.exposeFunction('pageReady', () => {
      authorReady = true
      resolveAuthor?.()
    })
  }
  if (setup.readiness.diagrams) {
    await tab.exposeFunction(RENDER_READY_BINDING, () => {
      diagramsReady = true
      resolveDiagrams?.()
    })
  }
  if (setup.progressReport) {
    await tab.exposeFunction(RENDER_PROGRESS_BINDING, (progress: unknown) => reportRenderProgress(progress, setup.progressReport))
  }
  await tab.setContent(setup.html, { waitUntil: 'load' })
  const refuseMissing = () => {
    if (refused.size > 0) {
      const message = [...refused].join('; ')
      const limitEntries = [...refused].flatMap((reason) => {
        const entry = exceeded.get(reason)
        return entry ? [entry] : []
      })
      if (limitEntries.length > 0) throw new RenderLimitError(limitEntries as [LimitExceeded, ...LimitExceeded[]], message)
      throw new RenderRefusedError(message)
    }
    if (missing.size > 0) throw new RenderRefusedError(`The host assets option did not answer approved requests: ${[...missing].join(', ')}.`)
  }
  refuseMissing()
  if (waitsForReadiness(setup.readiness)) {
    const waits: Promise<void>[] = []
    if (setup.readiness.author) waits.push(authorPromise)
    if (setup.readiness.diagrams) waits.push(diagramPromise)
    await withinBound(PAGE_READY_BOUND_MS, Promise.all(waits)).catch(() => {
      throw new RenderRefusedError(readinessRefusal(setup.readiness, { author: authorReady, diagrams: diagramsReady }, PAGE_READY_BOUND_MS / 1000))
    })
  }
  await tab.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  if (setup.fontLoadReport) {
    const value = await tab.evaluate((attribute) => document.documentElement.getAttribute(attribute), FONT_FAILURE_ATTRIBUTE)
    setup.fontLoadReport({ failures: mergedFontFailures(setup.fontFailures ?? [], value) })
  }
  if (measureSlots) await mergeCapturedSlotFit(tab, measureSlots, PAGE_READY_BOUND_MS)
  await setup.beforeOutput?.(tab)
  refuseMissing()
  try {
    const result = await body(tab)
    refuseMissing()
    return result
  } finally {
    controller.abort()
  }
}
