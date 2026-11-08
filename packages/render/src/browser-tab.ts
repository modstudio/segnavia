import { Buffer } from 'node:buffer'
import { dependencyDecision, dependencyOriginSet, type FontFailure } from '@segnavia/format'
import { FONT_FAILURE_ATTRIBUTE, fontFailuresAttribute } from '@segnavia/frame/bridge'
import type { PreparedSlots } from '@segnavia/html'
import type { Browser, BrowserContext, Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { DependencyAnswer, DependencyCache } from './options.ts'
import { withinBound } from './render-deadline.ts'
import { RENDER_READY_BINDING, type RenderReadiness, readinessRefusal, waitsForReadiness } from './render-readiness.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'
import { installSlotFitCapture, mergeCapturedSlotFit } from './slot-fit.ts'

export interface BrowserTabSetup {
  viewport: { width: number; height: number }
  scripts: boolean
  scale?: number
  html: string
  readiness: RenderReadiness
  beforeOutput?: (tab: Tab) => Promise<void>
  dependencyOrigins?: Iterable<string>
  dependencies?: DependencyCache
  fontFailures?: FontFailure[]
  fontLoadReport?: (report: { failures: FontFailure[] }) => void
}

export const fontLoadSetup = (
  failures: FontFailure[],
  report: BrowserTabSetup['fontLoadReport'],
): Pick<BrowserTabSetup, 'fontFailures' | 'fontLoadReport'> => ({
  fontFailures: failures,
  fontLoadReport: report,
})

export type DependencyRouteDecision =
  | { action: 'continue' }
  | { action: 'abort' }
  | { action: 'missing'; url: string }
  | ({ action: 'fulfill' } & DependencyAnswer)

export function mergedFontFailures(initial: readonly FontFailure[], attribute: string | null): FontFailure[] {
  return [...initial, ...fontFailuresAttribute(attribute)]
}

export async function dependencyRouteDecision(
  url: string,
  dependencyOrigins: ReadonlySet<string>,
  lookup: DependencyCache | undefined,
): Promise<DependencyRouteDecision> {
  if (url.startsWith('data:')) return { action: 'continue' }
  if (!dependencyDecision(url, dependencyOrigins).allowed) return { action: 'abort' }
  const answer = await lookup?.(url)
  return answer ? { action: 'fulfill', ...answer } : { action: 'missing', url }
}

export async function renderInBrowserTab<T>(
  browser: Browser,
  setup: BrowserTabSetup,
  measureSlots: PreparedSlots | undefined,
  state: { settled(): boolean; opened(context: BrowserContext): void; crashed(): void },
  body: (tab: Tab) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    viewport: setup.viewport,
    deviceScaleFactor: setup.scale ?? 1,
    javaScriptEnabled: setup.scripts,
    offline: true,
  })
  state.opened(context)
  if (state.settled()) {
    await context.close().catch(() => {})
    return undefined as T
  }
  if (measureSlots) await installSlotFitCapture(context)
  const missing = new Set<string>()
  const dependencyOrigins = dependencyOriginSet(setup.dependencyOrigins)
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    const decision = await dependencyRouteDecision(url, dependencyOrigins, setup.dependencies)
    if (decision.action === 'continue') await route.continue()
    else if (decision.action === 'fulfill') await route.fulfill({ body: Buffer.from(decision.body), contentType: decision.contentType })
    else {
      if (decision.action === 'missing') missing.add(decision.url)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => socket.close())
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
  await tab.setContent(setup.html, { waitUntil: 'load' })
  const refuseMissing = () => {
    if (missing.size > 0) throw new RenderRefusedError(`The host cache did not answer approved dependencies: ${[...missing].join(', ')}.`)
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
  return body(tab)
}
