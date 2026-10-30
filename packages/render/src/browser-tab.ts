import { Buffer } from 'node:buffer'
import { dependencyDecision, dependencyOriginSet } from '@segnavia/format'
import type { PreparedSlots } from '@segnavia/html'
import type { Browser, BrowserContext, Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import type { DependencyAnswer, DependencyCache } from './options.ts'
import { withinBound } from './render-deadline.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'
import { installSlotFitCapture, mergeCapturedSlotFit } from './slot-fit.ts'

export interface BrowserTabSetup {
  viewport: { width: number; height: number }
  scripts: boolean
  scale?: number
  html: string
  waitForReady: boolean
  beforeOutput?: (tab: Tab) => Promise<void>
  dependencyOrigins?: Iterable<string>
  dependencies?: DependencyCache
}

export type DependencyRouteDecision =
  | { action: 'continue' }
  | { action: 'abort' }
  | { action: 'missing'; url: string }
  | ({ action: 'fulfill' } & DependencyAnswer)

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
  let ready: (() => void) | undefined
  const readyPromise = new Promise<void>((resolve) => {
    ready = resolve
  })
  if (setup.waitForReady) await tab.exposeFunction('pageReady', () => ready?.())
  await tab.setContent(setup.html, { waitUntil: 'load' })
  const refuseMissing = () => {
    if (missing.size > 0) throw new RenderRefusedError(`The host cache did not answer approved dependencies: ${[...missing].join(', ')}.`)
  }
  refuseMissing()
  if (setup.waitForReady) {
    await withinBound(PAGE_READY_BOUND_MS, readyPromise).catch(() => {
      throw new RenderRefusedError(`The page did not call window.pageReady() within ${PAGE_READY_BOUND_MS / 1000}s.`)
    })
  }
  await tab.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  if (measureSlots) await mergeCapturedSlotFit(tab, measureSlots, PAGE_READY_BOUND_MS)
  await setup.beforeOutput?.(tab)
  refuseMissing()
  return body(tab)
}
